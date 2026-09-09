import asyncio
import json
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from fastapi.responses import StreamingResponse
from app.auth import create_jwt, get_current_user, get_current_user_optional, hash_password, verify_password
from app.demo import seed_standard_demo_trip, seed_stress_test_trip, fetch_live_airport_weather, AIRPORT_COORDINATES
from app.database import db_accept_invite, db_add_activity_log, db_add_trip_member, db_apply_recovery, db_create_booking, db_create_dependency, db_create_disruption, db_create_trip, db_create_user, db_delete_booking, db_delete_dependency, db_get_booking, db_get_dependency, db_get_disruption, db_get_invite_by_token, db_get_member_role, db_get_recovery_candidate, db_get_recovery_candidates_by_disruption, db_get_trip, db_get_trip_member, db_get_user_by_email_with_hash, db_get_user_role_for_trip, db_list_active_disruptions, db_list_activity_feed, db_list_bookings, db_list_dependencies, db_list_trip_members, db_list_trips, db_list_trips_for_user, db_remove_trip_member, db_resolve_disruption, db_save_recovery_candidates, db_update_booking, db_update_dependency, db_update_trip_name, db_delete_trip
from app.events import event_bus
from app.graph import build_trip_graph
from app.heuristics import suggest_dependencies_for_booking
from app.models import AcceptInviteRequest, AcceptInviteResponse, ActivityFeedItem, ActivityFeedListResponse, AuthResponse, Booking, BookingCreate, BookingUpdate, BookingWithSuggestions, Dependency, DependencyCreate, DependencyUpdate, Disruption, DisruptionCreate, DisruptionResolveResponse, GraphResponse, PresenceUser, RecoveryApplyResponse, RecoveryCandidate, RecoveryOptionsResponse, RippleResponse, RoleType, SuggestedDependency, ThinConnection, Trip, TripCreate, TripMember, TripMemberInviteRequest, TripMemberInviteResponse, TripPresenceResponse, TripResilienceResponse, UserCreate, UserLogin
from app.ripple import compute_effective_bookings, compute_ripple_impact
from app.recovery import generate_raw_recovery_candidates, enrich_with_groq_or_fallback
router = APIRouter()
@router.post('/trips/{trip_id}/disruptions', response_model=RippleResponse, status_code=status.HTTP_201_CREATED)
def trigger_disruption(trip_id: UUID, disruption_in: DisruptionCreate, current_user: dict=Depends(get_current_user)):
    verify_trip_mutation_permission(trip_id, current_user)
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    booking = db_get_booking(disruption_in.booking_id)
    if not booking or booking.trip_id != trip_id:
        raise HTTPException(status_code=400, detail='Disrupted booking not found in this trip')
    disruption = db_create_disruption(trip_id, disruption_in)
    actor_name = current_user['display_name']
    actor_email = current_user['email']
    delay_str = f' (+{disruption.delay_minutes}m)' if disruption.delay_minutes else ''
    log_activity_and_broadcast(trip_id, actor_name, actor_email, 'DISRUPTION_TRIGGERED', f"{actor_name} reported {disruption.disruption_type} on '{booking.title}'{delay_str}", {'disruption_id': str(disruption.id), 'booking_id': str(disruption.booking_id)})
    event_bus.broadcast_sync(str(trip_id), 'DISRUPTION_TRIGGERED', {'disruption_id': str(disruption.id), 'booking_id': str(disruption.booking_id)})
    original_bookings = db_list_bookings(trip_id)
    dependencies = db_list_dependencies(trip_id)
    active_disruptions = db_list_active_disruptions(trip_id)
    ripple_path, per_node_impact, updated_graph = compute_ripple_impact(trip_id=str(trip.id), trip_name=trip.name, disrupted_booking_id=str(disruption_in.booking_id), original_bookings=original_bookings, dependencies=dependencies, active_disruptions=active_disruptions)
    return RippleResponse(disruption_id=str(disruption.id), disrupted_booking_id=str(disruption.booking_id), disruption_type=disruption.disruption_type, delay_minutes=disruption.delay_minutes, description=disruption.description, ripple_path=ripple_path, per_node_impact=per_node_impact, updated_graph=updated_graph)

@router.get('/trips/{trip_id}/disruptions', response_model=List[Disruption])
def list_active_disruptions(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    return db_list_active_disruptions(trip_id)

@router.post('/disruptions/{disruption_id}/resolve', response_model=DisruptionResolveResponse)
def resolve_disruption(disruption_id: UUID, current_user: dict=Depends(get_current_user)):
    disruption = db_get_disruption(disruption_id)
    if not disruption:
        raise HTTPException(status_code=404, detail='Disruption not found')
    verify_trip_mutation_permission(disruption.trip_id, current_user)
    db_resolve_disruption(disruption_id)
    actor_name = current_user['display_name']
    actor_email = current_user['email']
    log_activity_and_broadcast(disruption.trip_id, actor_name, actor_email, 'DISRUPTION_RESOLVED', f'{actor_name} resolved disruption on booking', {'disruption_id': str(disruption_id)})
    event_bus.broadcast_sync(str(disruption.trip_id), 'DISRUPTION_RESOLVED', {'disruption_id': str(disruption_id)})
    trip = db_get_trip(disruption.trip_id)
    trip_name = trip.name if trip else 'Trip'
    bookings = db_list_bookings(disruption.trip_id)
    dependencies = db_list_dependencies(disruption.trip_id)
    remaining_active = db_list_active_disruptions(disruption.trip_id)
    effective_bookings = compute_effective_bookings(bookings, remaining_active)
    reverted_graph = build_trip_graph(trip_id=str(disruption.trip_id), trip_name=trip_name, bookings=effective_bookings, dependencies=dependencies)
    return DisruptionResolveResponse(disruption_id=str(disruption.id), resolved=True, reverted_graph=reverted_graph)

@router.post('/trips/{trip_id}/disruptions/{disruption_id}/recovery-options', response_model=RecoveryOptionsResponse)
def get_recovery_options(trip_id: UUID, disruption_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    disruption = db_get_disruption(disruption_id)
    if not disruption or disruption.trip_id != trip_id:
        raise HTTPException(status_code=404, detail='Disruption not found in this trip')
    existing_candidates = db_get_recovery_candidates_by_disruption(disruption_id)
    if existing_candidates and len(existing_candidates) >= 2:
        broken_b = db_get_booking(existing_candidates[0].target_booking_id)
        broken_title = broken_b.title if broken_b else 'Affected Connection'
        return RecoveryOptionsResponse(disruption_id=str(disruption.id), trip_id=str(trip.id), broken_booking_id=str(existing_candidates[0].target_booking_id), broken_booking_title=broken_title, candidates=existing_candidates)
    disrupted_booking = db_get_booking(disruption.booking_id)
    if not disrupted_booking:
        raise HTTPException(status_code=404, detail='Disrupted booking not found')
    all_bookings = db_list_bookings(trip_id)
    dependencies = db_list_dependencies(trip_id)
    active_disruptions = db_list_active_disruptions(trip_id)
    ripple_path, per_node_impact, _ = compute_ripple_impact(trip_id=str(trip.id), trip_name=trip.name, disrupted_booking_id=str(disrupted_booking.id), original_bookings=all_bookings, dependencies=dependencies, active_disruptions=active_disruptions)
    broken_booking = None
    for impact in per_node_impact:
        if impact.severity in ('missed', 'at_risk'):
            broken_booking = next((b for b in all_bookings if str(b.id) == impact.booking_id), None)
            if broken_booking:
                break
    if not broken_booking:
        broken_booking = disrupted_booking
    raw_candidates = generate_raw_recovery_candidates(trip_id=trip_id, disruption=disruption, disrupted_booking=disrupted_booking, broken_booking=broken_booking, all_bookings=all_bookings, dependencies=dependencies)
    enriched_candidates = enrich_with_groq_or_fallback(raw_candidates)
    saved_candidates = db_save_recovery_candidates(enriched_candidates)
    return RecoveryOptionsResponse(disruption_id=str(disruption.id), trip_id=str(trip.id), broken_booking_id=str(broken_booking.id), broken_booking_title=broken_booking.title, candidates=saved_candidates)

@router.post('/recovery-options/{candidate_id}/apply', response_model=RecoveryApplyResponse)
def apply_recovery_option(candidate_id: UUID, current_user: dict=Depends(get_current_user)):
    candidate = db_get_recovery_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail='Recovery candidate not found')
    verify_trip_mutation_permission(candidate.trip_id, current_user)
    try:
        candidate, new_state = db_apply_recovery(candidate_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to apply recovery: {e}')
    trip = db_get_trip(candidate.trip_id)
    trip_name = trip.name if trip else 'Trip'
    bookings = db_list_bookings(candidate.trip_id)
    dependencies = db_list_dependencies(candidate.trip_id)
    remaining_active = db_list_active_disruptions(candidate.trip_id)
    effective_bookings = compute_effective_bookings(bookings, remaining_active)
    updated_graph = build_trip_graph(trip_id=str(candidate.trip_id), trip_name=trip_name, bookings=effective_bookings, dependencies=dependencies)
    conn_edges = [e for e in updated_graph.edges if e.to_node == str(candidate.target_booking_id)]
    slack_info = f', {int(conn_edges[0].slack_minutes)} minutes of slack restored' if conn_edges else ''
    if candidate.candidate_type == 'drop':
        confirmation = f'{candidate.title} applied. Connection dropped and refund processed.'
    else:
        confirmation = f'{candidate.title} applied{slack_info}.'
    actor_name = current_user['display_name']
    actor_email = current_user['email']
    log_activity_and_broadcast(candidate.trip_id, actor_name, actor_email, 'RECOVERY_APPLIED', f'{actor_name} applied recovery: {candidate.title}', {'disruption_id': str(candidate.disruption_id), 'candidate_id': str(candidate.id)})
    event_bus.broadcast_sync(str(candidate.trip_id), 'RECOVERY_APPLIED', {'disruption_id': str(candidate.disruption_id), 'candidate_id': str(candidate.id), 'target_booking_id': str(candidate.target_booking_id)})
    return RecoveryApplyResponse(disruption_id=str(candidate.disruption_id), applied_candidate_id=str(candidate.id), candidate_type=candidate.candidate_type, confirmation_message=confirmation, resolved=True, updated_graph=updated_graph)

@router.post('/demo/sample-disruption')
def trigger_sample_disruption_endpoint(req: SampleDisruptionRequest, current_user: dict=Depends(get_current_user)):
    """
    1-click trigger for a guided disruption on the demo trip.
    Pre-fills a 60m delay on Flight LX 354, breaking the shuttle connection and dropping resilience.
    """
    verify_trip_mutation_permission(req.trip_id, current_user)
    bookings = db_list_bookings(req.trip_id)
    if not bookings:
        raise HTTPException(status_code=404, detail='No bookings found in trip')
    target_flight = next((b for b in bookings if b.type == 'flight'), bookings[0])
    desc = req.description or f'Severe air traffic flow restriction & holding pattern delay on {target_flight.title}'
    disruption_in = DisruptionCreate(booking_id=target_flight.id, disruption_type='delay', delay_minutes=req.delay_minutes, description=desc)
    return trigger_disruption(req.trip_id, disruption_in, current_user)

@router.post('/trips/{trip_id}/disruptions/live-weather')
async def trigger_live_weather_disruption_endpoint(trip_id: UUID, req: LiveWeatherDisruptionRequest, current_user: dict=Depends(get_current_user)):
    """
    Query real-time weather from Open-Meteo and trigger an authentic live weather disruption.
    """
    verify_trip_mutation_permission(trip_id, current_user)
    weather_info = await fetch_live_airport_weather(req.airport_code)
    bookings = db_list_bookings(trip_id)
    if not bookings:
        raise HTTPException(status_code=404, detail='No bookings found in trip')
    target_booking = None
    if req.booking_id:
        target_booking = next((b for b in bookings if b.id == req.booking_id), None)
    if not target_booking:
        target_booking = next((b for b in bookings if b.type == 'flight'), bookings[0])
    delay_mins = weather_info['suggested_delay_minutes']
    desc = f"Live Weather Disruption ({weather_info['airport_name']}): {weather_info['weather_description']}, {weather_info['temperature_c']}°C, wind {weather_info['wind_speed_kmh']} km/h (gusts {weather_info['wind_gusts_kmh']} km/h). Ground stop delay: {delay_mins}m."
    disruption_in = DisruptionCreate(booking_id=target_booking.id, disruption_type='weather', delay_minutes=delay_mins, description=desc)
    return trigger_disruption(trip_id, disruption_in, current_user)@router.get('/{trip_id}/disruptions/resolved', response_model=List[Disruption])
def list_resolved_disruptions(trip_id: UUID, current_user: dict = Depends(get_current_user)):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    return db_list_resolved_disruptions(trip_id)
from app.db.disruptions import db_list_resolved_disruptions

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
@router.post('/trips/{trip_id}/bookings', response_model=BookingWithSuggestions, status_code=status.HTTP_201_CREATED)
def add_booking(trip_id: UUID, booking_in: BookingCreate, current_user: dict=Depends(get_current_user)):
    verify_trip_mutation_permission(trip_id, current_user)
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    existing_bookings = db_list_bookings(trip_id)
    existing_dependencies = db_list_dependencies(trip_id)
    booking = db_create_booking(trip_id, booking_in)
    actor_name = current_user['display_name']
    actor_email = current_user['email']
    log_activity_and_broadcast(trip_id, actor_name, actor_email, 'BOOKING_ADDED', f"{actor_name} added {booking.type} '{booking.title}'", {'booking_id': str(booking.id), 'title': booking.title, 'type': booking.type})
    suggested = suggest_dependencies_for_booking(target_booking=booking, existing_bookings=existing_bookings, existing_dependencies=existing_dependencies)
    event_bus.broadcast_sync(str(trip_id), 'BOOKING_ADDED', {'booking_id': str(booking.id), 'title': booking.title, 'type': booking.type})
    return BookingWithSuggestions(booking=booking, suggested_dependencies=suggested)

@router.put('/bookings/{booking_id}', response_model=Booking)
def update_booking(booking_id: UUID, booking_update: BookingUpdate, current_user: dict=Depends(get_current_user)):
    existing = db_get_booking(booking_id)
    if not existing:
        raise HTTPException(status_code=404, detail='Booking not found')
    verify_trip_mutation_permission(existing.trip_id, current_user)
    updated = db_update_booking(booking_id, booking_update)
    if not updated:
        raise HTTPException(status_code=404, detail='Booking not found')
    actor_name = current_user['display_name']
    actor_email = current_user['email']
    log_activity_and_broadcast(updated.trip_id, actor_name, actor_email, 'BOOKING_UPDATED', f"{actor_name} updated '{updated.title}'", {'booking_id': str(booking_id), 'title': updated.title})
    event_bus.broadcast_sync(str(updated.trip_id), 'BOOKING_UPDATED', {'booking_id': str(booking_id), 'title': updated.title, 'type': updated.type})
    return updated

@router.delete('/bookings/{booking_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_booking(booking_id: UUID, current_user: dict=Depends(get_current_user)):
    booking = db_get_booking(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail='Booking not found')
    verify_trip_mutation_permission(booking.trip_id, current_user)
    trip_id = booking.trip_id
    success = db_delete_booking(booking_id)
    if not success:
        raise HTTPException(status_code=404, detail='Booking not found')
    actor_name = current_user['display_name']
    actor_email = current_user['email']
    log_activity_and_broadcast(trip_id, actor_name, actor_email, 'BOOKING_DELETED', f"{actor_name} deleted booking '{booking.title}'", {'booking_id': str(booking_id), 'title': booking.title})
    event_bus.broadcast_sync(str(trip_id), 'BOOKING_DELETED', {'booking_id': str(booking_id)})
    return None

@router.post('/trips/{trip_id}/dependencies', response_model=Dependency, status_code=status.HTTP_201_CREATED)
def create_dependency(trip_id: UUID, dep_in: DependencyCreate, current_user: dict=Depends(get_current_user)):
    verify_trip_mutation_permission(trip_id, current_user)
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    from_b = db_get_booking(dep_in.from_booking_id)
    to_b = db_get_booking(dep_in.to_booking_id)
    if not from_b or from_b.trip_id != trip_id:
        raise HTTPException(status_code=400, detail='From booking not found in this trip')
    if not to_b or to_b.trip_id != trip_id:
        raise HTTPException(status_code=400, detail='To booking not found in this trip')
    dep = db_create_dependency(trip_id, dep_in)
    actor_name = current_user['display_name']
    actor_email = current_user['email']
    log_activity_and_broadcast(trip_id, actor_name, actor_email, 'DEPENDENCY_CREATED', f"{actor_name} linked '{from_b.title}' → '{to_b.title}' ({dep.min_buffer_minutes}m buffer)", {'dependency_id': str(dep.id), 'from': str(dep.from_booking_id), 'to': str(dep.to_booking_id)})
    event_bus.broadcast_sync(str(trip_id), 'DEPENDENCY_CREATED', {'dependency_id': str(dep.id), 'from_node': str(dep.from_booking_id), 'to_node': str(dep.to_booking_id)})
    return dep

@router.put('/dependencies/{dependency_id}', response_model=Dependency)
def update_dependency(dependency_id: UUID, dep_update: DependencyUpdate, current_user: dict=Depends(get_current_user)):
    dep = db_get_dependency(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail='Dependency not found')
    verify_trip_mutation_permission(dep.trip_id, current_user)
    trip_id = dep.trip_id
    updated = db_update_dependency(dependency_id, dep_update)
    if not updated:
        raise HTTPException(status_code=404, detail='Dependency not found')
    event_bus.broadcast_sync(str(trip_id), 'DEPENDENCY_UPDATED', {'dependency_id': str(dependency_id)})
    return updated

@router.delete('/dependencies/{dependency_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_dependency(dependency_id: UUID, current_user: dict=Depends(get_current_user)):
    dep = db_get_dependency(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail='Dependency not found')
    verify_trip_mutation_permission(dep.trip_id, current_user)
    trip_id = dep.trip_id
    success = db_delete_dependency(dependency_id)
    if not success:
        raise HTTPException(status_code=404, detail='Dependency not found')
    actor_name = current_user['display_name']
    actor_email = current_user['email']
    log_activity_and_broadcast(trip_id, actor_name, actor_email, 'DEPENDENCY_DELETED', f'{actor_name} removed connection edge', {'dependency_id': str(dependency_id)})
    event_bus.broadcast_sync(str(trip_id), 'DEPENDENCY_DELETED', {'dependency_id': str(dependency_id)})
    return None
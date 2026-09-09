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
def verify_trip_mutation_permission(trip_id: UUID, current_user: dict):
    """
    Phase 1: JWT-enforced authorization.
    Reads the real user_id from the verified JWT, NOT from any client-controlled header.
    A viewer sending 'X-User-Role: owner' header changes NOTHING — that header is ignored.

    Access rules:
      - Trip owner (trips.owner_id == user.id): always allowed
      - trip_members with role 'owner' or 'editor': allowed
      - trip_members with role 'viewer': 403 Forbidden
      - Not a member at all: 403 Forbidden (unless trip has no owner — legacy data)
    """
    user_id = UUID(current_user['user_id'])
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    if trip.owner_id and str(trip.owner_id) == str(user_id):
        return
    role = db_get_user_role_for_trip(trip_id, user_id)
    if trip.owner_id is None:
        if role == 'viewer':
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Forbidden: Viewer role has read-only access.')
        return
    if role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Forbidden: You are not a member of this trip.')
    if role == 'viewer':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Forbidden: Viewer role has read-only access.')

@router.post('/trips', response_model=Trip, status_code=status.HTTP_201_CREATED)
def create_trip(trip_in: TripCreate, current_user: dict=Depends(get_current_user)):
    """Create a trip owned by the authenticated user."""
    trip_in.owner_id = UUID(current_user['user_id'])
    return db_create_trip(trip_in)

@router.get('/trips', response_model=List[Trip])
def list_trips(current_user: dict=Depends(get_current_user)):
    """List trips the authenticated user owns or is a member of."""
    return db_list_trips_for_user(UUID(current_user['user_id']))

@router.get('/trips/{trip_id}', response_model=Trip)
def get_trip(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    return trip

@router.patch('/trips/{trip_id}', response_model=Trip)
def update_trip(trip_id: UUID, trip_in: TripUpdateInput, current_user: dict=Depends(get_current_user)):
    """Update trip details (e.g. name). Must have mutation permissions."""
    verify_trip_mutation_permission(trip_id, current_user)
    updated = db_update_trip_name(trip_id, trip_in.name)
    if not updated:
        raise HTTPException(status_code=404, detail='Trip not found')
    return updated

@router.delete('/trips/{trip_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(trip_id: UUID, current_user: dict=Depends(get_current_user)):
    """Delete a trip. Only the trip owner can delete it."""
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    if trip.owner_id and str(trip.owner_id) != current_user['user_id']:
        raise HTTPException(status_code=403, detail='Only the trip owner can delete this trip')
    db_delete_trip(trip_id)
    return None

@router.get('/trips/{trip_id}/graph', response_model=GraphResponse)
def get_trip_graph(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    bookings = db_list_bookings(trip_id)
    dependencies = db_list_dependencies(trip_id)
    active_disruptions = db_list_active_disruptions(trip_id)
    effective_bookings = compute_effective_bookings(bookings, active_disruptions)
    return build_trip_graph(trip_id=str(trip.id), trip_name=trip.name, bookings=effective_bookings, dependencies=dependencies)

@router.get('/trips/{trip_id}/suggestions', response_model=List[SuggestedDependency])
def get_trip_suggestions(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    bookings = db_list_bookings(trip_id)
    dependencies = db_list_dependencies(trip_id)
    all_suggestions: List[SuggestedDependency] = []
    for b in bookings:
        suggs = suggest_dependencies_for_booking(target_booking=b, existing_bookings=bookings, existing_dependencies=dependencies)
        for s in suggs:
            if not any((existing.from_booking_id == s.from_booking_id and existing.to_booking_id == s.to_booking_id for existing in all_suggestions)):
                all_suggestions.append(s)
    return all_suggestions

@router.get('/trips/{trip_id}/resilience', response_model=TripResilienceResponse)
def get_trip_resilience(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    bookings = db_list_bookings(trip_id)
    dependencies = db_list_dependencies(trip_id)
    active_disruptions = db_list_active_disruptions(trip_id)
    effective_bookings = compute_effective_bookings(bookings, active_disruptions)
    graph = build_trip_graph(trip_id=str(trip.id), trip_name=trip.name, bookings=effective_bookings, dependencies=dependencies)
    total_edges = len(graph.edges)
    safe_edges = 0
    tight_edges = 0
    violated_edges = 0
    thin_conns: List[ThinConnection] = []
    booking_map = {str(b.id): b.title for b in effective_bookings}
    for edge in graph.edges:
        if edge.status == 'violated':
            violated_edges += 1
        elif edge.status == 'tight':
            tight_edges += 1
        else:
            safe_edges += 1
        if edge.status in ('tight', 'violated') or edge.slack_minutes <= 30:
            thin_conns.append(ThinConnection(from_booking_id=edge.from_node, from_booking_title=booking_map.get(edge.from_node, 'From Booking'), to_booking_id=edge.to_node, to_booking_title=booking_map.get(edge.to_node, 'To Booking'), min_buffer_minutes=edge.min_buffer_minutes, actual_gap_minutes=edge.actual_gap_minutes, slack_minutes=edge.slack_minutes, status=edge.status))
    penalty = tight_edges * 15 + violated_edges * 35
    score = max(0, 100 - penalty)
    if total_edges == 0:
        score = 100
    if score >= 80:
        grade = 'Robust'
    elif score >= 50:
        grade = 'Caution'
    else:
        grade = 'Critical'
    return TripResilienceResponse(trip_id=str(trip_id), score=score, grade=grade, total_edges=total_edges, safe_edges=safe_edges, tight_edges=tight_edges, violated_edges=violated_edges, thin_connections=thin_conns)

@router.get('/trips/{trip_id}/events')
async def stream_trip_events(trip_id: UUID, request: Request, current_user: dict=Depends(get_current_user)):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    queue = await event_bus.subscribe(str(trip_id))

    async def event_generator():
        try:
            init_payload = json.dumps({'type': 'CONNECTED', 'trip_id': str(trip_id)})
            yield f'data: {init_payload}\n\n'
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f'data: {json.dumps(event)}\n\n'
                except asyncio.TimeoutError:
                    yield ': ping\n\n'
        except asyncio.CancelledError:
            pass
        finally:
            await event_bus.unsubscribe(str(trip_id), queue)
    return StreamingResponse(event_generator(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'})

@router.post('/trips/{trip_id}/presence', response_model=TripPresenceResponse)
def record_trip_presence(trip_id: UUID, user: PresenceUser):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    event_bus.record_presence(str(trip_id), user)
    active = event_bus.get_active_presence(str(trip_id))
    event_bus.broadcast_sync(str(trip_id), 'PRESENCE_UPDATED', {'active_users': [u.model_dump(mode='json') for u in active]})
    return TripPresenceResponse(trip_id=str(trip_id), active_users=active)

@router.get('/trips/{trip_id}/presence', response_model=TripPresenceResponse)
def get_trip_presence(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    active = event_bus.get_active_presence(str(trip_id))
    return TripPresenceResponse(trip_id=str(trip_id), active_users=active)

@router.get('/trips/{trip_id}/activity', response_model=ActivityFeedListResponse)
def get_trip_activity(trip_id: UUID, limit: int=50):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    items = db_list_activity_feed(trip_id, limit=limit)
    return ActivityFeedListResponse(trip_id=str(trip_id), activities=items)
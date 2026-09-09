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
@router.post('/trips/{trip_id}/members/invite', response_model=TripMemberInviteResponse, status_code=status.HTTP_201_CREATED)
def invite_trip_member(trip_id: UUID, invite_in: TripMemberInviteRequest, current_user: dict=Depends(get_current_user)):
    verify_trip_mutation_permission(trip_id, current_user)
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    invite_token = f'inv_{uuid4().hex[:12]}'
    member = db_add_trip_member(trip_id=trip_id, email=invite_in.email, name=invite_in.name, role=invite_in.role, invite_token=invite_token)
    invite_link = f'http://localhost:3000/trips/{trip_id}?invite={invite_token}'
    actor_name = current_user['display_name']
    actor_email = current_user['email']
    log_activity_and_broadcast(trip_id, actor_name, actor_email, 'MEMBER_INVITED', f'{actor_name} invited {member.name} ({member.email}) as {member.role}', {'member_id': str(member.id), 'email': member.email, 'role': member.role})
    event_bus.broadcast_sync(str(trip_id), 'MEMBER_INVITED', {'member_id': str(member.id), 'name': member.name, 'role': member.role})
    return TripMemberInviteResponse(member=member, invite_token=invite_token, invite_link=invite_link)

@router.get('/trips/{trip_id}/members', response_model=List[TripMember])
def list_trip_members(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail='Trip not found')
    return db_list_trip_members(trip_id)

@router.delete('/trips/{trip_id}/members/{member_id}', status_code=status.HTTP_204_NO_CONTENT)
def remove_trip_member(trip_id: UUID, member_id: UUID, current_user: dict=Depends(get_current_user)):
    verify_trip_mutation_permission(trip_id, current_user)
    member = db_get_trip_member(trip_id, member_id)
    if not member:
        raise HTTPException(status_code=404, detail='Member not found')
    if member.role == 'owner':
        raise HTTPException(status_code=400, detail='Cannot remove the trip owner')
    deleted = db_remove_trip_member(trip_id, member_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='Member could not be removed')
    actor_name = current_user['display_name']
    actor_email = current_user['email']
    log_activity_and_broadcast(trip_id, actor_name, actor_email, 'MEMBER_REMOVED', f'{actor_name} removed {member.name} from the trip', {'member_id': str(member_id), 'name': member.name})
    event_bus.broadcast_sync(str(trip_id), 'MEMBER_REMOVED', {'member_id': str(member_id)})
    return None

@router.get('/invites/{invite_token}')
def preview_invite(invite_token: str):
    data = db_get_invite_by_token(invite_token)
    if not data:
        raise HTTPException(status_code=404, detail='Invite link not found or expired')
    trip, member = data
    return {'trip_id': str(trip.id), 'trip_name': trip.name, 'role': member.role, 'email': member.email, 'name': member.name}

@router.post('/invites/{invite_token}/accept', response_model=AcceptInviteResponse)
def accept_invite(invite_token: str, req: AcceptInviteRequest):
    data = db_accept_invite(invite_token, req.name, req.email)
    if not data:
        raise HTTPException(status_code=404, detail='Invite link not found or invalid')
    trip, member = data
    log_activity_and_broadcast(trip.id, member.name, member.email, 'MEMBER_JOINED', f'{member.name} accepted invite and joined as {member.role}', {'member_id': str(member.id), 'role': member.role})
    event_bus.broadcast_sync(str(trip.id), 'MEMBER_JOINED', {'member_id': str(member.id), 'name': member.name, 'role': member.role})
    return AcceptInviteResponse(trip_id=str(trip.id), trip_name=trip.name, member=member, role=member.role)
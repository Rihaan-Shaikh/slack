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
router = APIRouter()

@router.post('/auth/signup', response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(user_in: UserCreate):
    """Register a new account. Returns a JWT on success."""
    import psycopg2
    if not user_in.email.strip() or not user_in.password.strip() or (not user_in.display_name.strip()):
        raise HTTPException(status_code=400, detail='Email, password, and display name are required.')
    if len(user_in.password) < 6:
        raise HTTPException(status_code=400, detail='Password must be at least 6 characters.')
    try:
        user = db_create_user(email=user_in.email, display_name=user_in.display_name, password_hash=hash_password(user_in.password))
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail='An account with this email already exists.')
    except Exception as e:
        if 'unique' in str(e).lower() or 'duplicate' in str(e).lower():
            raise HTTPException(status_code=409, detail='An account with this email already exists.')
        raise HTTPException(status_code=500, detail=f'Could not create account: {e}')
    token = create_jwt(str(user.id), user.email, user.display_name)
    return AuthResponse(access_token=token, user_id=str(user.id), email=user.email, display_name=user.display_name)

@router.post('/auth/login', response_model=AuthResponse)
def login(user_in: UserLogin):
    """Authenticate with email + password. Returns a JWT on success."""
    result = db_get_user_by_email_with_hash(user_in.email)
    if not result:
        raise HTTPException(status_code=401, detail='Invalid email or password.')
    user, password_hash = result
    if not verify_password(user_in.password, password_hash):
        raise HTTPException(status_code=401, detail='Invalid email or password.')
    token = create_jwt(str(user.id), user.email, user.display_name)
    return AuthResponse(access_token=token, user_id=str(user.id), email=user.email, display_name=user.display_name)

@router.get('/auth/me')
def get_me(current_user: dict=Depends(get_current_user)):
    """Return the currently authenticated user's identity from the JWT."""
    return {'user_id': current_user['user_id'], 'email': current_user['email'], 'display_name': current_user['display_name']}

@router.post('/auth/logout')
def logout():
    """Client-side logout: instruct frontend to clear the token from localStorage."""
    return {'message': 'Logged out successfully. Clear your access_token from localStorage.'}

def log_activity_and_broadcast(trip_id: UUID, actor_name: str, actor_email: Optional[str], action_type: str, description: str, metadata: Optional[Dict[str, Any]]=None) -> ActivityFeedItem:
    item = db_add_activity_log(trip_id, actor_name, actor_email, action_type, description, metadata)
    event_bus.broadcast_sync(str(trip_id), 'ACTIVITY_LOGGED', {'id': str(item.id), 'actor_name': item.actor_name, 'action_type': item.action_type, 'description': item.description, 'created_at': item.created_at.isoformat()})
    return item

class TripUpdateInput(BaseModel):
    name: str

class SampleDisruptionRequest(BaseModel):
    trip_id: UUID
    delay_minutes: int = 60
    description: Optional[str] = None

class LiveWeatherDisruptionRequest(BaseModel):
    airport_code: str = 'ZRH'
    booking_id: Optional[UUID] = None

@router.post('/demo/seed')
def seed_demo_endpoint(reuse: bool=Query(True, description='Reuse existing Alpine Odyssey demo trip if already owned by user'), current_user: Optional[dict]=Depends(get_current_user_optional)):
    """
    Seed a complete, realistic multi-city Alpine Odyssey trip:
    7 bookings, 1 tight connection (+15m slack), 1 overlapping pair, and 5 dependencies.
    If reuse is True and the current user already owns an Alpine Odyssey trip, reuses it.
    If a new trip is created, sequences it ("Alpine Odyssey #2", etc.) to prevent duplicate cards.
    """
    owner_id = UUID(current_user['user_id']) if current_user else None
    if owner_id:
        existing_trips = db_list_trips_for_user(owner_id)
        alpine_trips = [t for t in existing_trips if 'Alpine Odyssey' in t.name]
        if reuse and alpine_trips:
            trip = alpine_trips[0]
            bookings = db_list_bookings(trip.id)
            dependencies = db_list_dependencies(trip.id)
            resilience = get_trip_resilience(trip.id)
            return {'trip': trip, 'bookings': bookings, 'dependencies': dependencies, 'resilience': resilience, 'sample_disruption': None, 'tight_booking_id': None, 'overlapping_pair': None}
        suffix = f'#{len(alpine_trips) + 1}' if alpine_trips else ''
        seed_data = seed_standard_demo_trip(owner_id=owner_id, name_suffix=suffix)
    else:
        seed_data = seed_standard_demo_trip()
    trip = seed_data['trip']
    resilience = get_trip_resilience(trip.id)
    return {'trip': trip, 'bookings': seed_data['bookings'], 'dependencies': seed_data['dependencies'], 'resilience': resilience, 'sample_disruption': seed_data.get('sample_disruption'), 'tight_booking_id': seed_data.get('tight_booking_id'), 'overlapping_pair': seed_data.get('overlapping_pair')}

@router.post('/demo/seed-stress')
def seed_stress_endpoint():
    """
    Seed a 16-booking, 5-day Grand European Tour to stress-test graph layout scalability.
    """
    return seed_stress_test_trip()

@router.get('/weather/airports')
async def get_airport_weather_endpoint():
    """
    Fetch live real-world weather conditions for major European hubs from Open-Meteo REST API.
    """
    results = []
    for code in AIRPORT_COORDINATES.keys():
        w = await fetch_live_airport_weather(code)
        results.append(w)
    return results
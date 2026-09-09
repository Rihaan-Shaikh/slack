# API endpoints for slack-api
import asyncio
import json
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from fastapi.responses import StreamingResponse

from app.auth import (
    create_jwt,
    get_current_user,
    get_current_user_optional,
    hash_password,
    verify_password,
)

from app.demo import (
    seed_standard_demo_trip,
    seed_stress_test_trip,
    fetch_live_airport_weather,
    AIRPORT_COORDINATES,
)

from app.database import (
    db_accept_invite,
    db_add_activity_log,
    db_add_trip_member,
    db_apply_recovery,
    db_create_booking,
    db_create_dependency,
    db_create_disruption,
    db_create_trip,
    db_create_user,
    db_delete_booking,
    db_delete_dependency,
    db_get_booking,
    db_get_dependency,
    db_get_disruption,
    db_get_invite_by_token,
    db_get_member_role,
    db_get_recovery_candidate,
    db_get_recovery_candidates_by_disruption,
    db_get_trip,
    db_get_trip_member,
    db_get_user_by_email_with_hash,
    db_get_user_role_for_trip,
    db_list_active_disruptions,
    db_list_activity_feed,
    db_list_bookings,
    db_list_dependencies,
    db_list_trip_members,
    db_list_trips,
    db_list_trips_for_user,
    db_remove_trip_member,
    db_resolve_disruption,
    db_save_recovery_candidates,
    db_update_booking,
    db_update_dependency,
    db_update_trip_name,
    db_delete_trip,
)
from app.events import event_bus
from app.graph import build_trip_graph
from app.heuristics import suggest_dependencies_for_booking
from app.models import (
    AcceptInviteRequest,
    AcceptInviteResponse,
    ActivityFeedItem,
    ActivityFeedListResponse,
    AuthResponse,
    Booking,
    BookingCreate,
    BookingUpdate,
    BookingWithSuggestions,
    Dependency,
    DependencyCreate,
    DependencyUpdate,
    Disruption,
    DisruptionCreate,
    DisruptionResolveResponse,
    GraphResponse,
    PresenceUser,
    RecoveryApplyResponse,
    RecoveryCandidate,
    RecoveryOptionsResponse,
    RippleResponse,
    RoleType,
    SuggestedDependency,
    ThinConnection,
    Trip,
    TripCreate,
    TripMember,
    TripMemberInviteRequest,
    TripMemberInviteResponse,
    TripPresenceResponse,
    TripResilienceResponse,
    UserCreate,
    UserLogin,
)
from app.ripple import compute_effective_bookings, compute_ripple_impact
from app.recovery import generate_raw_recovery_candidates, enrich_with_groq_or_fallback

router = APIRouter()


# ─── Phase 1: Auth routes ─────────────────────────────────────────────────────

@router.post("/auth/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(user_in: UserCreate):
    """Register a new account. Returns a JWT on success."""
    import psycopg2
    # Reject empty fields
    if not user_in.email.strip() or not user_in.password.strip() or not user_in.display_name.strip():
        raise HTTPException(status_code=400, detail="Email, password, and display name are required.")
    if len(user_in.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    try:
        user = db_create_user(
            email=user_in.email,
            display_name=user_in.display_name,
            password_hash=hash_password(user_in.password),
        )
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        raise HTTPException(status_code=500, detail=f"Could not create account: {e}")

    token = create_jwt(str(user.id), user.email, user.display_name)
    return AuthResponse(
        access_token=token,
        user_id=str(user.id),
        email=user.email,
        display_name=user.display_name,
    )


@router.post("/auth/login", response_model=AuthResponse)
def login(user_in: UserLogin):
    """Authenticate with email + password. Returns a JWT on success."""
    result = db_get_user_by_email_with_hash(user_in.email)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    user, password_hash = result
    if not verify_password(user_in.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_jwt(str(user.id), user.email, user.display_name)
    return AuthResponse(
        access_token=token,
        user_id=str(user.id),
        email=user.email,
        display_name=user.display_name,
    )


@router.get("/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """Return the currently authenticated user's identity from the JWT."""
    return {
        "user_id": current_user["user_id"],
        "email": current_user["email"],
        "display_name": current_user["display_name"],
    }


@router.post("/auth/logout")
def logout():
    """Client-side logout: instruct frontend to clear the token from localStorage."""
    return {"message": "Logged out successfully. Clear your access_token from localStorage."}


# ─── Authorization & Activity Logging Helpers ─────────────────────────────────

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
    user_id = UUID(current_user["user_id"])
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Owner of the trip always has full access
    if trip.owner_id and str(trip.owner_id) == str(user_id):
        return

    # Check trip_members role
    role = db_get_user_role_for_trip(trip_id, user_id)

    # Legacy trips (owner_id = NULL): allow anyone logged in to mutate (backward compat)
    if trip.owner_id is None:
        if role == "viewer":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Viewer role has read-only access.",
            )
        return  # NULL-owner trips are open to any authenticated user

    # For owned trips: must be an explicit member with editor/owner role
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You are not a member of this trip.",
        )
    if role == "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Viewer role has read-only access.",
        )


def log_activity_and_broadcast(
    trip_id: UUID,
    actor_name: str,
    actor_email: Optional[str],
    action_type: str,
    description: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> ActivityFeedItem:
    item = db_add_activity_log(trip_id, actor_name, actor_email, action_type, description, metadata)
    event_bus.broadcast_sync(
        str(trip_id),
        "ACTIVITY_LOGGED",
        {
            "id": str(item.id),
            "actor_name": item.actor_name,
            "action_type": item.action_type,
            "description": item.description,
            "created_at": item.created_at.isoformat(),
        },
    )
    return item


# ─── 1. Trips endpoints ───────────────────────────────────────────────────────

@router.post("/trips", response_model=Trip, status_code=status.HTTP_201_CREATED)
def create_trip(trip_in: TripCreate, current_user: dict = Depends(get_current_user)):
    """Create a trip owned by the authenticated user."""
    trip_in.owner_id = UUID(current_user["user_id"])
    return db_create_trip(trip_in)


@router.get("/trips", response_model=List[Trip])
def list_trips(current_user: dict = Depends(get_current_user)):
    """List trips the authenticated user owns or is a member of."""
    return db_list_trips_for_user(UUID(current_user["user_id"]))

@router.get("/trips/{trip_id}", response_model=Trip)
def get_trip(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


class TripUpdateInput(BaseModel):
    name: str


@router.patch("/trips/{trip_id}", response_model=Trip)
def update_trip(trip_id: UUID, trip_in: TripUpdateInput, current_user: dict = Depends(get_current_user)):
    """Update trip details (e.g. name). Must have mutation permissions."""
    verify_trip_mutation_permission(trip_id, current_user)
    updated = db_update_trip_name(trip_id, trip_in.name)
    if not updated:
        raise HTTPException(status_code=404, detail="Trip not found")
    return updated


@router.delete("/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(trip_id: UUID, current_user: dict = Depends(get_current_user)):
    """Delete a trip. Only the trip owner can delete it."""
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.owner_id and str(trip.owner_id) != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the trip owner can delete this trip")
    db_delete_trip(trip_id)
    return None


# 2. Add booking to trip with auto suggestion
@router.post("/trips/{trip_id}/bookings", response_model=BookingWithSuggestions, status_code=status.HTTP_201_CREATED)
def add_booking(trip_id: UUID, booking_in: BookingCreate, current_user: dict = Depends(get_current_user)):
    verify_trip_mutation_permission(trip_id, current_user)

    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    existing_bookings = db_list_bookings(trip_id)
    existing_dependencies = db_list_dependencies(trip_id)

    booking = db_create_booking(trip_id, booking_in)

    actor_name = current_user["display_name"]
    actor_email = current_user["email"]
    log_activity_and_broadcast(
        trip_id,
        actor_name,
        actor_email,
        "BOOKING_CREATED",
        f"{actor_name} added {booking.type} '{booking.title}'",
        {"booking_id": str(booking.id), "title": booking.title, "type": booking.type},
    )

    suggested = suggest_dependencies_for_booking(
        target_booking=booking,
        existing_bookings=existing_bookings,
        existing_dependencies=existing_dependencies,
    )

    event_bus.broadcast_sync(
        str(trip_id),
        "BOOKING_CREATED",
        {"booking_id": str(booking.id), "title": booking.title, "type": booking.type},
    )

    return BookingWithSuggestions(
        booking=booking,
        suggested_dependencies=suggested,
    )

# 3. Edit booking
@router.put("/bookings/{booking_id}", response_model=Booking)
def update_booking(booking_id: UUID, booking_update: BookingUpdate, current_user: dict = Depends(get_current_user)):
    existing = db_get_booking(booking_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Booking not found")

    verify_trip_mutation_permission(existing.trip_id, current_user)

    updated = db_update_booking(booking_id, booking_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Booking not found")

    actor_name = current_user["display_name"]
    actor_email = current_user["email"]
    log_activity_and_broadcast(
        updated.trip_id,
        actor_name,
        actor_email,
        "BOOKING_UPDATED",
        f"{actor_name} updated '{updated.title}'",
        {"booking_id": str(booking_id), "title": updated.title},
    )

    event_bus.broadcast_sync(
        str(updated.trip_id),
        "BOOKING_UPDATED",
        {"booking_id": str(booking_id), "title": updated.title, "type": updated.type},
    )
    return updated

# 4. Delete booking (cascade delete dependencies)
@router.delete("/bookings/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_booking(booking_id: UUID, current_user: dict = Depends(get_current_user)):
    booking = db_get_booking(booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    verify_trip_mutation_permission(booking.trip_id, current_user)

    trip_id = booking.trip_id
    success = db_delete_booking(booking_id)
    if not success:
        raise HTTPException(status_code=404, detail="Booking not found")

    actor_name = current_user["display_name"]
    actor_email = current_user["email"]
    log_activity_and_broadcast(
        trip_id,
        actor_name,
        actor_email,
        "BOOKING_DELETED",
        f"{actor_name} deleted booking '{booking.title}'",
        {"booking_id": str(booking_id), "title": booking.title},
    )

    event_bus.broadcast_sync(
        str(trip_id),
        "BOOKING_DELETED",
        {"booking_id": str(booking_id)},
    )
    return None

# 5. Create dependency edge
@router.post("/trips/{trip_id}/dependencies", response_model=Dependency, status_code=status.HTTP_201_CREATED)
def create_dependency(trip_id: UUID, dep_in: DependencyCreate, current_user: dict = Depends(get_current_user)):
    verify_trip_mutation_permission(trip_id, current_user)

    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    from_b = db_get_booking(dep_in.from_booking_id)
    to_b = db_get_booking(dep_in.to_booking_id)

    if not from_b or from_b.trip_id != trip_id:
        raise HTTPException(status_code=400, detail="From booking not found in this trip")
    if not to_b or to_b.trip_id != trip_id:
        raise HTTPException(status_code=400, detail="To booking not found in this trip")

    dep = db_create_dependency(trip_id, dep_in)

    actor_name = current_user["display_name"]
    actor_email = current_user["email"]
    log_activity_and_broadcast(
        trip_id,
        actor_name,
        actor_email,
        "DEPENDENCY_CREATED",
        f"{actor_name} linked '{from_b.title}' → '{to_b.title}' ({dep.min_buffer_minutes}m buffer)",
        {"dependency_id": str(dep.id), "from": str(dep.from_booking_id), "to": str(dep.to_booking_id)},
    )

    event_bus.broadcast_sync(
        str(trip_id),
        "DEPENDENCY_CREATED",
        {"dependency_id": str(dep.id), "from_node": str(dep.from_booking_id), "to_node": str(dep.to_booking_id)},
    )
    return dep

# 6. Edit and delete dependency
@router.put("/dependencies/{dependency_id}", response_model=Dependency)
def update_dependency(dependency_id: UUID, dep_update: DependencyUpdate, current_user: dict = Depends(get_current_user)):
    dep = db_get_dependency(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found")

    verify_trip_mutation_permission(dep.trip_id, current_user)

    trip_id = dep.trip_id
    updated = db_update_dependency(dependency_id, dep_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Dependency not found")

    event_bus.broadcast_sync(
        str(trip_id),
        "DEPENDENCY_UPDATED",
        {"dependency_id": str(dependency_id)},
    )
    return updated

@router.delete("/dependencies/{dependency_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dependency(dependency_id: UUID, current_user: dict = Depends(get_current_user)):
    dep = db_get_dependency(dependency_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found")

    verify_trip_mutation_permission(dep.trip_id, current_user)

    trip_id = dep.trip_id
    success = db_delete_dependency(dependency_id)
    if not success:
        raise HTTPException(status_code=404, detail="Dependency not found")

    actor_name = current_user["display_name"]
    actor_email = current_user["email"]
    log_activity_and_broadcast(
        trip_id,
        actor_name,
        actor_email,
        "DEPENDENCY_DELETED",
        f"{actor_name} removed connection edge",
        {"dependency_id": str(dependency_id)},
    )

    event_bus.broadcast_sync(
        str(trip_id),
        "DEPENDENCY_DELETED",
        {"dependency_id": str(dependency_id)},
    )
    return None

# 7. Core graph endpoint (incorporates active disruptions for effective timings)
@router.get("/trips/{trip_id}/graph", response_model=GraphResponse)
def get_trip_graph(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    bookings = db_list_bookings(trip_id)
    dependencies = db_list_dependencies(trip_id)
    active_disruptions = db_list_active_disruptions(trip_id)

    effective_bookings = compute_effective_bookings(bookings, active_disruptions)

    return build_trip_graph(
        trip_id=str(trip.id),
        trip_name=trip.name,
        bookings=effective_bookings,
        dependencies=dependencies,
    )

# 8. Suggestions endpoint
@router.get("/trips/{trip_id}/suggestions", response_model=List[SuggestedDependency])
def get_trip_suggestions(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    bookings = db_list_bookings(trip_id)
    dependencies = db_list_dependencies(trip_id)

    all_suggestions: List[SuggestedDependency] = []
    for b in bookings:
        suggs = suggest_dependencies_for_booking(
            target_booking=b,
            existing_bookings=bookings,
            existing_dependencies=dependencies,
        )
        for s in suggs:
            if not any(
                existing.from_booking_id == s.from_booking_id and existing.to_booking_id == s.to_booking_id
                for existing in all_suggestions
            ):
                all_suggestions.append(s)

    return all_suggestions

# --- Phase 2: Disruption Endpoints ---

# 9. Ingest disruption & compute BFS ripple impact
@router.post("/trips/{trip_id}/disruptions", response_model=RippleResponse, status_code=status.HTTP_201_CREATED)
def trigger_disruption(trip_id: UUID, disruption_in: DisruptionCreate, current_user: dict = Depends(get_current_user)):
    verify_trip_mutation_permission(trip_id, current_user)

    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    booking = db_get_booking(disruption_in.booking_id)
    if not booking or booking.trip_id != trip_id:
        raise HTTPException(status_code=400, detail="Disrupted booking not found in this trip")

    # a. Insert disruption row
    disruption = db_create_disruption(trip_id, disruption_in)

    actor_name = current_user["display_name"]
    actor_email = current_user["email"]
    delay_str = f" (+{disruption.delay_minutes}m)" if disruption.delay_minutes else ""
    log_activity_and_broadcast(
        trip_id,
        actor_name,
        actor_email,
        "DISRUPTION_TRIGGERED",
        f"{actor_name} reported {disruption.disruption_type} on '{booking.title}'{delay_str}",
        {"disruption_id": str(disruption.id), "booking_id": str(disruption.booking_id)},
    )

    event_bus.broadcast_sync(
        str(trip_id),
        "DISRUPTION_TRIGGERED",
        {"disruption_id": str(disruption.id), "booking_id": str(disruption.booking_id)},
    )

    # b-g. Compute BFS ripple traversal and impact severity
    original_bookings = db_list_bookings(trip_id)
    dependencies = db_list_dependencies(trip_id)
    active_disruptions = db_list_active_disruptions(trip_id)

    ripple_path, per_node_impact, updated_graph = compute_ripple_impact(
        trip_id=str(trip.id),
        trip_name=trip.name,
        disrupted_booking_id=str(disruption_in.booking_id),
        original_bookings=original_bookings,
        dependencies=dependencies,
        active_disruptions=active_disruptions,
    )

    return RippleResponse(
        disruption_id=str(disruption.id),
        disrupted_booking_id=str(disruption.booking_id),
        disruption_type=disruption.disruption_type,
        delay_minutes=disruption.delay_minutes,
        description=disruption.description,
        ripple_path=ripple_path,
        per_node_impact=per_node_impact,
        updated_graph=updated_graph,
    )

# 10. List active, unresolved disruptions for a trip
@router.get("/trips/{trip_id}/disruptions", response_model=List[Disruption])
def list_active_disruptions(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    return db_list_active_disruptions(trip_id)

# 11. Resolve a disruption and recompute graph
@router.post("/disruptions/{disruption_id}/resolve", response_model=DisruptionResolveResponse)
def resolve_disruption(disruption_id: UUID, current_user: dict = Depends(get_current_user)):
    disruption = db_get_disruption(disruption_id)
    if not disruption:
        raise HTTPException(status_code=404, detail="Disruption not found")

    verify_trip_mutation_permission(disruption.trip_id, current_user)

    db_resolve_disruption(disruption_id)

    actor_name = current_user["display_name"]
    actor_email = current_user["email"]
    log_activity_and_broadcast(
        disruption.trip_id,
        actor_name,
        actor_email,
        "DISRUPTION_RESOLVED",
        f"{actor_name} resolved disruption on booking",
        {"disruption_id": str(disruption_id)},
    )

    event_bus.broadcast_sync(
        str(disruption.trip_id),
        "DISRUPTION_RESOLVED",
        {"disruption_id": str(disruption_id)},
    )

    trip = db_get_trip(disruption.trip_id)
    trip_name = trip.name if trip else "Trip"
    bookings = db_list_bookings(disruption.trip_id)
    dependencies = db_list_dependencies(disruption.trip_id)
    remaining_active = db_list_active_disruptions(disruption.trip_id)

    effective_bookings = compute_effective_bookings(bookings, remaining_active)
    reverted_graph = build_trip_graph(
        trip_id=str(disruption.trip_id),
        trip_name=trip_name,
        bookings=effective_bookings,
        dependencies=dependencies,
    )

    return DisruptionResolveResponse(
        disruption_id=str(disruption.id),
        resolved=True,
        reverted_graph=reverted_graph,
    )

# 12. Generate Ranked Recovery Options for an Active Disruption (Phase 3)
@router.post(
    "/trips/{trip_id}/disruptions/{disruption_id}/recovery-options",
    response_model=RecoveryOptionsResponse,
)
def get_recovery_options(trip_id: UUID, disruption_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    disruption = db_get_disruption(disruption_id)
    if not disruption or disruption.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Disruption not found in this trip")

    # Check if candidates were already computed and stored
    existing_candidates = db_get_recovery_candidates_by_disruption(disruption_id)
    if existing_candidates and len(existing_candidates) >= 2:
        broken_b = db_get_booking(existing_candidates[0].target_booking_id)
        broken_title = broken_b.title if broken_b else "Affected Connection"
        return RecoveryOptionsResponse(
            disruption_id=str(disruption.id),
            trip_id=str(trip.id),
            broken_booking_id=str(existing_candidates[0].target_booking_id),
            broken_booking_title=broken_title,
            candidates=existing_candidates,
        )

    disrupted_booking = db_get_booking(disruption.booking_id)
    if not disrupted_booking:
        raise HTTPException(status_code=404, detail="Disrupted booking not found")

    all_bookings = db_list_bookings(trip_id)
    dependencies = db_list_dependencies(trip_id)
    active_disruptions = db_list_active_disruptions(trip_id)

    # Pull the Phase 2 ripple set to identify broken downstream connection
    ripple_path, per_node_impact, _ = compute_ripple_impact(
        trip_id=str(trip.id),
        trip_name=trip.name,
        disrupted_booking_id=str(disrupted_booking.id),
        original_bookings=all_bookings,
        dependencies=dependencies,
        active_disruptions=active_disruptions,
    )

    # Find the critical broken booking (first missed or at-risk connection)
    broken_booking = None
    for impact in per_node_impact:
        if impact.severity in ("missed", "at_risk"):
            broken_booking = next((b for b in all_bookings if str(b.id) == impact.booking_id), None)
            if broken_booking:
                break

    # Fallback to the disrupted booking itself if no downstream node is broken
    if not broken_booking:
        broken_booking = disrupted_booking

    # Generate up to 3 raw candidates
    raw_candidates = generate_raw_recovery_candidates(
        trip_id=trip_id,
        disruption=disruption,
        disrupted_booking=disrupted_booking,
        broken_booking=broken_booking,
        all_bookings=all_bookings,
        dependencies=dependencies,
    )

    # Enrich with Groq 1-sentence prompt (or deterministic fallback)
    enriched_candidates = enrich_with_groq_or_fallback(raw_candidates)

    # Save to database audit table
    saved_candidates = db_save_recovery_candidates(enriched_candidates)

    return RecoveryOptionsResponse(
        disruption_id=str(disruption.id),
        trip_id=str(trip.id),
        broken_booking_id=str(broken_booking.id),
        broken_booking_title=broken_booking.title,
        candidates=saved_candidates,
    )

# 13. Apply a Ranked Recovery Option (Phase 3)
@router.post(
    "/recovery-options/{candidate_id}/apply",
    response_model=RecoveryApplyResponse,
)
def apply_recovery_option(candidate_id: UUID, current_user: dict = Depends(get_current_user)):
    candidate = db_get_recovery_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Recovery candidate not found")

    verify_trip_mutation_permission(candidate.trip_id, current_user)

    try:
        candidate, new_state = db_apply_recovery(candidate_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply recovery: {e}")

    trip = db_get_trip(candidate.trip_id)
    trip_name = trip.name if trip else "Trip"
    bookings = db_list_bookings(candidate.trip_id)
    dependencies = db_list_dependencies(candidate.trip_id)
    remaining_active = db_list_active_disruptions(candidate.trip_id)

    effective_bookings = compute_effective_bookings(bookings, remaining_active)
    updated_graph = build_trip_graph(
        trip_id=str(candidate.trip_id),
        trip_name=trip_name,
        bookings=effective_bookings,
        dependencies=dependencies,
    )

    # Find the slack of the restored connection
    conn_edges = [e for e in updated_graph.edges if e.to_node == str(candidate.target_booking_id)]
    slack_info = f", {int(conn_edges[0].slack_minutes)} minutes of slack restored" if conn_edges else ""

    if candidate.candidate_type == "drop":
        confirmation = f"{candidate.title} applied. Connection dropped and refund processed."
    else:
        confirmation = f"{candidate.title} applied{slack_info}."

    actor_name = current_user["display_name"]
    actor_email = current_user["email"]
    log_activity_and_broadcast(
        candidate.trip_id,
        actor_name,
        actor_email,
        "RECOVERY_APPLIED",
        f"{actor_name} applied recovery: {candidate.title}",
        {"disruption_id": str(candidate.disruption_id), "candidate_id": str(candidate.id)},
    )

    event_bus.broadcast_sync(
        str(candidate.trip_id),
        "RECOVERY_APPLIED",
        {
            "disruption_id": str(candidate.disruption_id),
            "candidate_id": str(candidate.id),
            "target_booking_id": str(candidate.target_booking_id),
        },
    )

    return RecoveryApplyResponse(
        disruption_id=str(candidate.disruption_id),
        applied_candidate_id=str(candidate.id),
        candidate_type=candidate.candidate_type,
        confirmation_message=confirmation,
        resolved=True,
        updated_graph=updated_graph,
    )


# --- Phase 4: Apply, Sync, and Prevent Endpoints ---

# 14. Trip Resilience Score & Thin Connections (Phase 4)
@router.get("/trips/{trip_id}/resilience", response_model=TripResilienceResponse)
def get_trip_resilience(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    bookings = db_list_bookings(trip_id)
    dependencies = db_list_dependencies(trip_id)
    active_disruptions = db_list_active_disruptions(trip_id)

    effective_bookings = compute_effective_bookings(bookings, active_disruptions)
    graph = build_trip_graph(
        trip_id=str(trip.id),
        trip_name=trip.name,
        bookings=effective_bookings,
        dependencies=dependencies,
    )

    total_edges = len(graph.edges)
    safe_edges = 0
    tight_edges = 0
    violated_edges = 0
    thin_conns: List[ThinConnection] = []

    booking_map = {str(b.id): b.title for b in effective_bookings}

    for edge in graph.edges:
        if edge.status == "violated":
            violated_edges += 1
        elif edge.status == "tight":
            tight_edges += 1
        else:
            safe_edges += 1

        if edge.status in ("tight", "violated") or edge.slack_minutes <= 30:
            thin_conns.append(
                ThinConnection(
                    from_booking_id=edge.from_node,
                    from_booking_title=booking_map.get(edge.from_node, "From Booking"),
                    to_booking_id=edge.to_node,
                    to_booking_title=booking_map.get(edge.to_node, "To Booking"),
                    min_buffer_minutes=edge.min_buffer_minutes,
                    actual_gap_minutes=edge.actual_gap_minutes,
                    slack_minutes=edge.slack_minutes,
                    status=edge.status,
                )
            )

    # Score calculation: start at 100, subtract 15 per tight edge, 35 per violated edge, floor at 0
    penalty = (tight_edges * 15) + (violated_edges * 35)
    score = max(0, 100 - penalty)
    if total_edges == 0:
        score = 100

    if score >= 80:
        grade = "Robust"
    elif score >= 50:
        grade = "Caution"
    else:
        grade = "Critical"

    return TripResilienceResponse(
        trip_id=str(trip_id),
        score=score,
        grade=grade,
        total_edges=total_edges,
        safe_edges=safe_edges,
        tight_edges=tight_edges,
        violated_edges=violated_edges,
        thin_connections=thin_conns,
    )


# 15. Server-Sent Events (SSE) Realtime Stream (Phase 4)
@router.get("/trips/{trip_id}/events")
async def stream_trip_events(trip_id: UUID, request: Request):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    queue = await event_bus.subscribe(str(trip_id))

    async def event_generator():
        try:
            # Yield initial connection confirmation
            init_payload = json.dumps({"type": "CONNECTED", "trip_id": str(trip_id)})
            yield f"data: {init_payload}\n\n"

            while True:
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    # Keep-alive heartbeat comment
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await event_bus.unsubscribe(str(trip_id), queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# 16. Presence Tracking Endpoints (Phase 4)
@router.post("/trips/{trip_id}/presence", response_model=TripPresenceResponse)
def record_trip_presence(trip_id: UUID, user: PresenceUser):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    event_bus.record_presence(str(trip_id), user)
    active = event_bus.get_active_presence(str(trip_id))

    event_bus.broadcast_sync(
        str(trip_id),
        "PRESENCE_UPDATED",
        {"active_users": [u.model_dump(mode="json") for u in active]},
    )

    return TripPresenceResponse(
        trip_id=str(trip_id),
        active_users=active,
    )


@router.get("/trips/{trip_id}/presence", response_model=TripPresenceResponse)
def get_trip_presence(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    active = event_bus.get_active_presence(str(trip_id))
    return TripPresenceResponse(
        trip_id=str(trip_id),
        active_users=active,
    )


# --- Phase 5: Multi-Traveler Collaboration Endpoints ---

# 17. Invite a collaborator (email & link flow with role)
@router.post(
    "/trips/{trip_id}/members/invite",
    response_model=TripMemberInviteResponse,
    status_code=status.HTTP_201_CREATED,
)
def invite_trip_member(trip_id: UUID, invite_in: TripMemberInviteRequest, current_user: dict = Depends(get_current_user)):
    verify_trip_mutation_permission(trip_id, current_user)

    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    invite_token = f"inv_{uuid4().hex[:12]}"
    member = db_add_trip_member(
        trip_id=trip_id,
        email=invite_in.email,
        name=invite_in.name,
        role=invite_in.role,
        invite_token=invite_token,
    )

    invite_link = f"http://localhost:3000/trips/{trip_id}?invite={invite_token}"

    actor_name = current_user["display_name"]
    actor_email = current_user["email"]
    log_activity_and_broadcast(
        trip_id,
        actor_name,
        actor_email,
        "MEMBER_INVITED",
        f"{actor_name} invited {member.name} ({member.email}) as {member.role}",
        {"member_id": str(member.id), "email": member.email, "role": member.role},
    )

    event_bus.broadcast_sync(
        str(trip_id),
        "MEMBER_INVITED",
        {"member_id": str(member.id), "name": member.name, "role": member.role},
    )

    return TripMemberInviteResponse(
        member=member,
        invite_token=invite_token,
        invite_link=invite_link,
    )


# 18. List all members of a trip
@router.get("/trips/{trip_id}/members", response_model=List[TripMember])
def list_trip_members(trip_id: UUID):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    return db_list_trip_members(trip_id)


# 19. Remove a collaborator from a trip
@router.delete("/trips/{trip_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_trip_member(trip_id: UUID, member_id: UUID, current_user: dict = Depends(get_current_user)):
    verify_trip_mutation_permission(trip_id, current_user)

    member = db_get_trip_member(trip_id, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.role == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove the trip owner")

    deleted = db_remove_trip_member(trip_id, member_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Member could not be removed")

    actor_name = current_user["display_name"]
    actor_email = current_user["email"]
    log_activity_and_broadcast(
        trip_id,
        actor_name,
        actor_email,
        "MEMBER_REMOVED",
        f"{actor_name} removed {member.name} from the trip",
        {"member_id": str(member_id), "name": member.name},
    )

    event_bus.broadcast_sync(
        str(trip_id),
        "MEMBER_REMOVED",
        {"member_id": str(member_id)},
    )
    return None


# 20. Preview an invite link
@router.get("/invites/{invite_token}")
def preview_invite(invite_token: str):
    data = db_get_invite_by_token(invite_token)
    if not data:
        raise HTTPException(status_code=404, detail="Invite link not found or expired")
    trip, member = data
    return {
        "trip_id": str(trip.id),
        "trip_name": trip.name,
        "role": member.role,
        "email": member.email,
        "name": member.name,
    }


# 21. Accept an invite link
@router.post("/invites/{invite_token}/accept", response_model=AcceptInviteResponse)
def accept_invite(invite_token: str, req: AcceptInviteRequest):
    data = db_accept_invite(invite_token, req.name, req.email)
    if not data:
        raise HTTPException(status_code=404, detail="Invite link not found or invalid")
    trip, member = data

    log_activity_and_broadcast(
        trip.id,
        member.name,
        member.email,
        "MEMBER_JOINED",
        f"{member.name} accepted invite and joined as {member.role}",
        {"member_id": str(member.id), "role": member.role},
    )

    event_bus.broadcast_sync(
        str(trip.id),
        "MEMBER_JOINED",
        {"member_id": str(member.id), "name": member.name, "role": member.role},
    )

    return AcceptInviteResponse(
        trip_id=str(trip.id),
        trip_name=trip.name,
        member=member,
        role=member.role,
    )


# 22. Trip Activity Feed (reverse-chronological history)
@router.get("/trips/{trip_id}/activity", response_model=ActivityFeedListResponse)
def get_trip_activity(trip_id: UUID, limit: int = 50):
    trip = db_get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    items = db_list_activity_feed(trip_id, limit=limit)
    return ActivityFeedListResponse(
        trip_id=str(trip_id),
        activities=items,
    )


# =====================================================================
# Phase 6: Demo Mode & Live Weather Endpoints
# =====================================================================

class SampleDisruptionRequest(BaseModel):
    trip_id: UUID
    delay_minutes: int = 60
    description: Optional[str] = None


class LiveWeatherDisruptionRequest(BaseModel):
    airport_code: str = "ZRH"
    booking_id: Optional[UUID] = None


@router.post("/demo/seed")
def seed_demo_endpoint(
    reuse: bool = Query(True, description="Reuse existing Alpine Odyssey demo trip if already owned by user"),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Seed a complete, realistic multi-city Alpine Odyssey trip:
    7 bookings, 1 tight connection (+15m slack), 1 overlapping pair, and 5 dependencies.
    If reuse is True and the current user already owns an Alpine Odyssey trip, reuses it.
    If a new trip is created, sequences it ("Alpine Odyssey #2", etc.) to prevent duplicate cards.
    """
    owner_id = UUID(current_user["user_id"]) if current_user else None
    if owner_id:
        existing_trips = db_list_trips_for_user(owner_id)
        alpine_trips = [t for t in existing_trips if "Alpine Odyssey" in t.name]
        if reuse and alpine_trips:
            # Reuse existing trip
            trip = alpine_trips[0]
            bookings = db_list_bookings(trip.id)
            dependencies = db_list_dependencies(trip.id)
            resilience = get_trip_resilience(trip.id)
            return {
                "trip": trip,
                "bookings": bookings,
                "dependencies": dependencies,
                "resilience": resilience,
                "sample_disruption": None,
                "tight_booking_id": None,
                "overlapping_pair": None,
            }

        suffix = f"#{len(alpine_trips) + 1}" if alpine_trips else ""
        seed_data = seed_standard_demo_trip(owner_id=owner_id, name_suffix=suffix)
    else:
        seed_data = seed_standard_demo_trip()

    trip = seed_data["trip"]
    resilience = get_trip_resilience(trip.id)
    return {
        "trip": trip,
        "bookings": seed_data["bookings"],
        "dependencies": seed_data["dependencies"],
        "resilience": resilience,
        "sample_disruption": seed_data.get("sample_disruption"),
        "tight_booking_id": seed_data.get("tight_booking_id"),
        "overlapping_pair": seed_data.get("overlapping_pair"),
    }


@router.post("/demo/seed-stress")
def seed_stress_endpoint():
    """
    Seed a 16-booking, 5-day Grand European Tour to stress-test graph layout scalability.
    """
    return seed_stress_test_trip()


@router.post("/demo/sample-disruption")
def trigger_sample_disruption_endpoint(req: SampleDisruptionRequest, current_user: dict = Depends(get_current_user)):
    """
    1-click trigger for a guided disruption on the demo trip.
    Pre-fills a 60m delay on Flight LX 354, breaking the shuttle connection and dropping resilience.
    """
    verify_trip_mutation_permission(req.trip_id, current_user)
    bookings = db_list_bookings(req.trip_id)
    if not bookings:
        raise HTTPException(status_code=404, detail="No bookings found in trip")

    # Target the first flight booking (e.g. Flight LX 354)
    target_flight = next((b for b in bookings if b.type == "flight"), bookings[0])

    desc = req.description or f"Severe air traffic flow restriction & holding pattern delay on {target_flight.title}"
    disruption_in = DisruptionCreate(
        booking_id=target_flight.id,
        disruption_type="delay",
        delay_minutes=req.delay_minutes,
        description=desc,
    )
    return trigger_disruption(req.trip_id, disruption_in, current_user)


@router.get("/weather/airports")
async def get_airport_weather_endpoint():
    """
    Fetch live real-world weather conditions for major European hubs from Open-Meteo REST API.
    """
    results = []
    for code in AIRPORT_COORDINATES.keys():
        w = await fetch_live_airport_weather(code)
        results.append(w)
    return results


@router.post("/trips/{trip_id}/disruptions/live-weather")
async def trigger_live_weather_disruption_endpoint(
    trip_id: UUID, req: LiveWeatherDisruptionRequest, current_user: dict = Depends(get_current_user)
):
    """
    Query real-time weather from Open-Meteo and trigger an authentic live weather disruption.
    """
    verify_trip_mutation_permission(trip_id, current_user)
    weather_info = await fetch_live_airport_weather(req.airport_code)

    bookings = db_list_bookings(trip_id)
    if not bookings:
        raise HTTPException(status_code=404, detail="No bookings found in trip")

    target_booking = None
    if req.booking_id:
        target_booking = next((b for b in bookings if b.id == req.booking_id), None)
    if not target_booking:
        target_booking = next((b for b in bookings if b.type == "flight"), bookings[0])

    delay_mins = weather_info["suggested_delay_minutes"]
    desc = (
        f"Live Weather Disruption ({weather_info['airport_name']}): "
        f"{weather_info['weather_description']}, {weather_info['temperature_c']}°C, "
        f"wind {weather_info['wind_speed_kmh']} km/h (gusts {weather_info['wind_gusts_kmh']} km/h). "
        f"Ground stop delay: {delay_mins}m."
    )

    disruption_in = DisruptionCreate(
        booking_id=target_booking.id,
        disruption_type="weather",
        delay_minutes=delay_mins,
        description=desc,
    )
    return trigger_disruption(trip_id, disruption_in, current_user)

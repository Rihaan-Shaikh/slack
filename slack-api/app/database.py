# Production-Grade Pure PostgreSQL Database Layer for Slack Disruption Engine
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, urlunparse
from uuid import UUID, uuid4

import psycopg2
import psycopg2.extras

from app.config import settings
from app.models import (
    ActivityFeedItem,
    Booking,
    BookingCreate,
    BookingUpdate,
    Dependency,
    DependencyCreate,
    DependencyUpdate,
    Disruption,
    DisruptionCreate,
    RecoveryCandidate,
    ScoringBreakdown,
    Trip,
    TripCreate,
    TripMember,
)


def ensure_postgres_database():
    """Ensure the target PostgreSQL database exists; if not, create it via maintenance DB."""
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set. A valid PostgreSQL URL is required.")

    parsed = urlparse(settings.database_url)
    target_dbname = parsed.path.lstrip("/") or "slack_db"

    # Try connecting directly to target DB
    try:
        conn = psycopg2.connect(settings.database_url, connect_timeout=3)
        conn.close()
        return
    except Exception as e:
        if f'database "{target_dbname}" does not exist' in str(e) or "does not exist" in str(e):
            print(f"Database '{target_dbname}' does not exist. Creating it on PostgreSQL server...")
            maint_url = urlunparse(parsed._replace(path="/postgres"))
            maint_conn = psycopg2.connect(maint_url)
            maint_conn.autocommit = True
            with maint_conn.cursor() as cur:
                cur.execute(f'CREATE DATABASE "{target_dbname}"')
            maint_conn.close()
            print(f"PostgreSQL database '{target_dbname}' created successfully.")
        else:
            raise e


def init_postgres_db():
    """Initialize all PostgreSQL tables with native UUID, JSONB, and TIMESTAMPTZ types."""
    ensure_postgres_database()

    with psycopg2.connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS trips (
                    id UUID PRIMARY KEY,
                    name TEXT NOT NULL,
                    owner_id UUID,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS bookings (
                    id UUID PRIMARY KEY,
                    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                    type TEXT NOT NULL CHECK (type IN ('flight', 'hotel', 'transfer', 'activity')),
                    title TEXT NOT NULL,
                    vendor TEXT,
                    location TEXT,
                    start_time TIMESTAMPTZ NOT NULL,
                    end_time TIMESTAMPTZ NOT NULL,
                    cost NUMERIC,
                    cancellation_policy TEXT,
                    metadata JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS dependencies (
                    id UUID PRIMARY KEY,
                    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                    from_booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
                    to_booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
                    min_buffer_minutes INTEGER NOT NULL DEFAULT 0,
                    dependency_type TEXT DEFAULT 'temporal',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS disruptions (
                    id UUID PRIMARY KEY,
                    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
                    disruption_type TEXT NOT NULL,
                    delay_minutes INTEGER DEFAULT 0,
                    description TEXT,
                    triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    resolved BOOLEAN DEFAULT FALSE,
                    resolved_at TIMESTAMPTZ
                );
                CREATE TABLE IF NOT EXISTS recovery_candidates (
                    id UUID PRIMARY KEY,
                    disruption_id UUID NOT NULL,
                    trip_id UUID NOT NULL,
                    target_booking_id UUID NOT NULL,
                    candidate_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    human_explanation TEXT NOT NULL,
                    score INTEGER NOT NULL,
                    cost_delta NUMERIC NOT NULL DEFAULT 0,
                    time_delta_minutes INTEGER NOT NULL DEFAULT 0,
                    itinerary_altered_percent NUMERIC NOT NULL DEFAULT 0,
                    refund_amount NUMERIC NOT NULL DEFAULT 0,
                    refund_eligible BOOLEAN NOT NULL DEFAULT FALSE,
                    is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
                    scoring_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
                    mutation_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE TABLE IF NOT EXISTS applied_recoveries (
                    id UUID PRIMARY KEY,
                    disruption_id UUID NOT NULL,
                    candidate_id UUID NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    previous_state JSONB NOT NULL DEFAULT '{}'::jsonb,
                    new_state JSONB NOT NULL DEFAULT '{}'::jsonb
                );
                CREATE TABLE IF NOT EXISTS trip_members (
                    id UUID PRIMARY KEY,
                    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                    user_id UUID,
                    email TEXT NOT NULL,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
                    invite_token TEXT UNIQUE,
                    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    UNIQUE (trip_id, email)
                );
                CREATE TABLE IF NOT EXISTS activity_feed (
                    id UUID PRIMARY KEY,
                    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                    actor_name TEXT NOT NULL,
                    actor_email TEXT,
                    action_type TEXT NOT NULL,
                    description TEXT NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
            """)
        conn.commit()


# Initialize PostgreSQL tables
init_postgres_db()


class DBWrapper:
    """Production-grade PostgreSQL connection wrapper with auto-commit and RealDictCursor."""
    def __init__(self, conn):
        self.conn = conn
        self.cursor = None

    def __enter__(self):
        self.cursor = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is not None:
                self.conn.rollback()
            else:
                self.conn.commit()
        finally:
            if self.cursor is not None:
                self.cursor.close()
            self.conn.close()

    def execute(self, query: str, params: Optional[Tuple] = None):
        self.cursor.execute(query, params)
        return self.cursor

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()


def get_db_connection() -> DBWrapper:
    """Obtain a direct PostgreSQL database connection."""
    raw_conn = psycopg2.connect(settings.database_url)
    return DBWrapper(raw_conn)


# --- Type & Row Converters ---

def _to_datetime(val: Any) -> Optional[datetime]:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        cleaned = val.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None


def _to_uuid(val: Any) -> Optional[UUID]:
    if val is None or val == "":
        return None
    if isinstance(val, UUID):
        return val
    return UUID(str(val))


def _to_float(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    return float(val)


def _to_dict(val: Any) -> Dict[str, Any]:
    if val is None or val == "":
        return {}
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return {}
    return {}


def _to_bool(val: Any) -> bool:
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return bool(val)
    return str(val).lower() in ("true", "1", "t", "yes")


def _row_to_trip(r: Any) -> Trip:
    return Trip(
        id=_to_uuid(r["id"]),
        name=r["name"],
        owner_id=_to_uuid(r["owner_id"]) if r.get("owner_id") else None,
        created_at=_to_datetime(r["created_at"]) or datetime.now(timezone.utc),
    )


def _row_to_booking(r: Any) -> Booking:
    return Booking(
        id=_to_uuid(r["id"]),
        trip_id=_to_uuid(r["trip_id"]),
        type=r["type"],
        title=r["title"],
        vendor=r.get("vendor"),
        location=r.get("location"),
        start_time=_to_datetime(r["start_time"]) or datetime.now(timezone.utc),
        end_time=_to_datetime(r["end_time"]) or datetime.now(timezone.utc),
        cost=_to_float(r.get("cost")),
        cancellation_policy=r.get("cancellation_policy"),
        metadata=_to_dict(r.get("metadata")),
        created_at=_to_datetime(r["created_at"]) or datetime.now(timezone.utc),
    )


def _row_to_dependency(r: Any) -> Dependency:
    return Dependency(
        id=_to_uuid(r["id"]),
        trip_id=_to_uuid(r["trip_id"]),
        from_booking_id=_to_uuid(r["from_booking_id"]),
        to_booking_id=_to_uuid(r["to_booking_id"]),
        min_buffer_minutes=int(r["min_buffer_minutes"]),
        dependency_type=r.get("dependency_type") or "temporal",
        created_at=_to_datetime(r["created_at"]) or datetime.now(timezone.utc),
    )


def _row_to_disruption(r: Any) -> Disruption:
    return Disruption(
        id=_to_uuid(r["id"]),
        trip_id=_to_uuid(r["trip_id"]),
        booking_id=_to_uuid(r["booking_id"]),
        disruption_type=r["disruption_type"],
        delay_minutes=int(r["delay_minutes"]),
        description=r.get("description"),
        triggered_at=_to_datetime(r["triggered_at"]) or datetime.now(timezone.utc),
        resolved=_to_bool(r["resolved"]),
        resolved_at=_to_datetime(r["resolved_at"]) if r.get("resolved_at") else None,
    )


def _row_to_recovery_candidate(r: Any) -> RecoveryCandidate:
    breakdown_dict = _to_dict(r.get("scoring_breakdown"))
    breakdown_obj = ScoringBreakdown(**breakdown_dict) if breakdown_dict else None
    mutation_dict = _to_dict(r.get("mutation_payload"))
    return RecoveryCandidate(
        id=_to_uuid(r["id"]),
        disruption_id=_to_uuid(r["disruption_id"]),
        trip_id=_to_uuid(r["trip_id"]),
        target_booking_id=_to_uuid(r["target_booking_id"]),
        candidate_type=r["candidate_type"],
        title=r["title"],
        description=r.get("description"),
        human_explanation=r["human_explanation"],
        score=int(r["score"]),
        cost_delta=_to_float(r.get("cost_delta")) or 0.0,
        time_delta_minutes=int(r.get("time_delta_minutes", 0)),
        itinerary_altered_percent=_to_float(r.get("itinerary_altered_percent")) or 0.0,
        refund_amount=_to_float(r.get("refund_amount")) or 0.0,
        refund_eligible=_to_bool(r.get("refund_eligible")),
        is_recommended=_to_bool(r.get("is_recommended")),
        scoring_breakdown=breakdown_obj,
        mutation_payload=mutation_dict,
        created_at=_to_datetime(r["created_at"]) or datetime.now(timezone.utc),
    )


def _row_to_trip_member(r: Any) -> TripMember:
    return TripMember(
        id=_to_uuid(r["id"]),
        trip_id=_to_uuid(r["trip_id"]),
        user_id=_to_uuid(r["user_id"]) if r.get("user_id") else None,
        email=r["email"],
        name=r["name"],
        role=r["role"],
        invite_token=r.get("invite_token"),
        joined_at=_to_datetime(r["joined_at"]) or datetime.now(timezone.utc),
    )


def _row_to_activity_feed_item(r: Any) -> ActivityFeedItem:
    return ActivityFeedItem(
        id=_to_uuid(r["id"]),
        trip_id=_to_uuid(r["trip_id"]),
        actor_name=r["actor_name"],
        actor_email=r.get("actor_email"),
        action_type=r["action_type"],
        description=r["description"],
        metadata=_to_dict(r.get("metadata")),
        created_at=_to_datetime(r["created_at"]) or datetime.now(timezone.utc),
    )


# --- 1. Trip Operations (Pure PostgreSQL) ---

def db_create_trip(trip_in: TripCreate) -> Trip:
    trip_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    owner_str = str(trip_in.owner_id) if trip_in.owner_id else None
    owner_member_id = uuid4()
    activity_id = uuid4()

    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO trips (id, name, owner_id, created_at) VALUES (%s, %s, %s, %s)",
            (str(trip_id), trip_in.name, owner_str, now_iso),
        )
        # Register creator as owner in trip_members
        conn.execute(
            """
            INSERT INTO trip_members (id, trip_id, user_id, email, name, role, joined_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (trip_id, email) DO NOTHING
            """,
            (
                str(owner_member_id),
                str(trip_id),
                owner_str,
                "owner@slacktravel.demo",
                "Trip Owner",
                "owner",
                now_iso,
            ),
        )
        # Record initial activity log
        conn.execute(
            """
            INSERT INTO activity_feed (id, trip_id, actor_name, actor_email, action_type, description, metadata, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(activity_id),
                str(trip_id),
                "Trip Owner",
                "owner@slacktravel.demo",
                "TRIP_CREATED",
                f"Trip '{trip_in.name}' created",
                json.dumps({"trip_name": trip_in.name}),
                now_iso,
            ),
        )

    return Trip(
        id=trip_id,
        name=trip_in.name,
        owner_id=trip_in.owner_id,
        created_at=datetime.fromisoformat(now_iso),
    )


def db_get_trip(trip_id: UUID) -> Optional[Trip]:
    with get_db_connection() as conn:
        conn.execute("SELECT * FROM trips WHERE id = %s", (str(trip_id),))
        row = conn.cursor.fetchone()
        return _row_to_trip(row) if row else None


def db_list_trips() -> List[Trip]:
    with get_db_connection() as conn:
        conn.execute("SELECT * FROM trips ORDER BY created_at DESC")
        rows = conn.cursor.fetchall()
        return [_row_to_trip(r) for r in rows]


# --- 2. Booking Operations (Pure PostgreSQL) ---

def db_create_booking(trip_id: UUID, booking_in: BookingCreate) -> Booking:
    booking_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    meta_json = json.dumps(booking_in.metadata or {})

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO bookings (
                id, trip_id, type, title, vendor, location,
                start_time, end_time, cost, cancellation_policy, metadata, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(booking_id),
                str(trip_id),
                booking_in.type,
                booking_in.title,
                booking_in.vendor,
                booking_in.location,
                booking_in.start_time.isoformat(),
                booking_in.end_time.isoformat(),
                booking_in.cost,
                booking_in.cancellation_policy,
                meta_json,
                now_iso,
            ),
        )

    return Booking(
        id=booking_id,
        trip_id=trip_id,
        type=booking_in.type,
        title=booking_in.title,
        vendor=booking_in.vendor,
        location=booking_in.location,
        start_time=booking_in.start_time,
        end_time=booking_in.end_time,
        cost=booking_in.cost,
        cancellation_policy=booking_in.cancellation_policy,
        metadata=booking_in.metadata,
        created_at=datetime.fromisoformat(now_iso),
    )


def db_get_booking(booking_id: UUID) -> Optional[Booking]:
    with get_db_connection() as conn:
        conn.execute("SELECT * FROM bookings WHERE id = %s", (str(booking_id),))
        row = conn.cursor.fetchone()
        return _row_to_booking(row) if row else None


def db_update_booking(booking_id: UUID, booking_update: BookingUpdate) -> Optional[Booking]:
    existing = db_get_booking(booking_id)
    if not existing:
        return None

    update_dict = booking_update.model_dump(exclude_unset=True)
    if not update_dict:
        return existing

    set_clauses = []
    params = []
    for k, v in update_dict.items():
        set_clauses.append(f"{k} = %s")
        if isinstance(v, datetime):
            params.append(v.isoformat())
        elif isinstance(v, dict):
            params.append(json.dumps(v))
        else:
            params.append(v)

    params.append(str(booking_id))
    query = f"UPDATE bookings SET {', '.join(set_clauses)} WHERE id = %s RETURNING *"

    with get_db_connection() as conn:
        conn.execute(query, tuple(params))
        row = conn.cursor.fetchone()
        return _row_to_booking(row) if row else None


def db_delete_booking(booking_id: UUID) -> bool:
    with get_db_connection() as conn:
        # Cascade delete any attached dependencies explicitly
        conn.execute(
            "DELETE FROM dependencies WHERE from_booking_id = %s OR to_booking_id = %s",
            (str(booking_id), str(booking_id)),
        )
        conn.execute("DELETE FROM bookings WHERE id = %s", (str(booking_id),))
        return conn.cursor.rowcount > 0


def db_list_bookings(trip_id: UUID) -> List[Booking]:
    with get_db_connection() as conn:
        conn.execute("SELECT * FROM bookings WHERE trip_id = %s ORDER BY start_time ASC", (str(trip_id),))
        rows = conn.cursor.fetchall()
        return [_row_to_booking(r) for r in rows]


# --- 3. Dependency Operations (Pure PostgreSQL) ---

def db_create_dependency(trip_id: UUID, dep_in: DependencyCreate) -> Dependency:
    dep_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO dependencies (
                id, trip_id, from_booking_id, to_booking_id, min_buffer_minutes, dependency_type, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(dep_id),
                str(trip_id),
                str(dep_in.from_booking_id),
                str(dep_in.to_booking_id),
                dep_in.min_buffer_minutes,
                dep_in.dependency_type,
                now_iso,
            ),
        )

    return Dependency(
        id=dep_id,
        trip_id=trip_id,
        from_booking_id=dep_in.from_booking_id,
        to_booking_id=dep_in.to_booking_id,
        min_buffer_minutes=dep_in.min_buffer_minutes,
        dependency_type=dep_in.dependency_type,
        created_at=datetime.fromisoformat(now_iso),
    )


def db_get_dependency(dep_id: UUID) -> Optional[Dependency]:
    with get_db_connection() as conn:
        conn.execute("SELECT * FROM dependencies WHERE id = %s", (str(dep_id),))
        row = conn.cursor.fetchone()
        return _row_to_dependency(row) if row else None


def db_update_dependency(dep_id: UUID, dep_update: DependencyUpdate) -> Optional[Dependency]:
    existing = db_get_dependency(dep_id)
    if not existing:
        return None

    update_dict = dep_update.model_dump(exclude_unset=True)
    if not update_dict:
        return existing

    set_clauses = []
    params = []
    for k, v in update_dict.items():
        set_clauses.append(f"{k} = %s")
        params.append(v)

    params.append(str(dep_id))
    query = f"UPDATE dependencies SET {', '.join(set_clauses)} WHERE id = %s RETURNING *"

    with get_db_connection() as conn:
        conn.execute(query, tuple(params))
        row = conn.cursor.fetchone()
        return _row_to_dependency(row) if row else None


def db_delete_dependency(dep_id: UUID) -> bool:
    with get_db_connection() as conn:
        conn.execute("DELETE FROM dependencies WHERE id = %s", (str(dep_id),))
        return conn.cursor.rowcount > 0


def db_list_dependencies(trip_id: UUID) -> List[Dependency]:
    with get_db_connection() as conn:
        conn.execute("SELECT * FROM dependencies WHERE trip_id = %s", (str(trip_id),))
        rows = conn.cursor.fetchall()
        return [_row_to_dependency(r) for r in rows]


# --- 4. Disruption Operations (Pure PostgreSQL) ---

def db_create_disruption(trip_id: UUID, disruption_in: DisruptionCreate) -> Disruption:
    disruption_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO disruptions (
                id, trip_id, booking_id, disruption_type, delay_minutes, description,
                triggered_at, resolved, resolved_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(disruption_id),
                str(trip_id),
                str(disruption_in.booking_id),
                disruption_in.disruption_type,
                disruption_in.delay_minutes,
                disruption_in.description,
                now_iso,
                False,
                None,
            ),
        )

    return Disruption(
        id=disruption_id,
        trip_id=trip_id,
        booking_id=disruption_in.booking_id,
        disruption_type=disruption_in.disruption_type,
        delay_minutes=disruption_in.delay_minutes,
        description=disruption_in.description,
        triggered_at=datetime.fromisoformat(now_iso),
        resolved=False,
        resolved_at=None,
    )


def db_get_disruption(disruption_id: UUID) -> Optional[Disruption]:
    with get_db_connection() as conn:
        conn.execute("SELECT * FROM disruptions WHERE id = %s", (str(disruption_id),))
        row = conn.cursor.fetchone()
        return _row_to_disruption(row) if row else None


def db_list_active_disruptions(trip_id: UUID) -> List[Disruption]:
    with get_db_connection() as conn:
        conn.execute(
            "SELECT * FROM disruptions WHERE trip_id = %s AND resolved = FALSE ORDER BY triggered_at DESC",
            (str(trip_id),),
        )
        rows = conn.cursor.fetchall()
        return [_row_to_disruption(r) for r in rows]


def db_resolve_disruption(disruption_id: UUID) -> bool:
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        conn.execute(
            "UPDATE disruptions SET resolved = TRUE, resolved_at = %s WHERE id = %s",
            (now_iso, str(disruption_id)),
        )
        return conn.cursor.rowcount > 0


# --- 5. Recovery Candidate Operations (Pure PostgreSQL) ---

def db_save_recovery_candidates(candidates: List[Any]) -> List[RecoveryCandidate]:
    if not candidates:
        return []

    results: List[RecoveryCandidate] = []
    with get_db_connection() as conn:
        for c in candidates:
            if isinstance(c, dict):
                c_id = _to_uuid(c.get("id")) or uuid4()
                disruption_id = _to_uuid(c.get("disruption_id"))
                trip_id = _to_uuid(c.get("trip_id"))
                target_booking_id = _to_uuid(c.get("target_booking_id"))
                candidate_type = c.get("candidate_type", "retime")
                title = c.get("title", "")
                description = c.get("description")
                human_explanation = c.get("human_explanation", "")
                score = int(c.get("score", 0))
                cost_delta = _to_float(c.get("cost_delta", 0.0)) or 0.0
                time_delta_minutes = int(c.get("time_delta_minutes", 0))
                itinerary_altered_percent = _to_float(c.get("itinerary_altered_percent", 0.0)) or 0.0
                refund_amount = _to_float(c.get("refund_amount", 0.0)) or 0.0
                refund_eligible = _to_bool(c.get("refund_eligible", False))
                is_recommended = _to_bool(c.get("is_recommended", False))

                sb = c.get("scoring_breakdown")
                if hasattr(sb, "model_dump"):
                    sb_dict = sb.model_dump()
                elif isinstance(sb, dict):
                    sb_dict = sb
                elif isinstance(sb, str):
                    try:
                        sb_dict = json.loads(sb)
                    except Exception:
                        sb_dict = {}
                else:
                    sb_dict = {}
                breakdown_json = json.dumps(sb_dict)

                payload = c.get("mutation_payload")
                if hasattr(payload, "model_dump"):
                    payload_dict = payload.model_dump()
                elif isinstance(payload, dict):
                    payload_dict = payload
                else:
                    payload_dict = {}
                payload_json = json.dumps(payload_dict)

                created_at = _to_datetime(c.get("created_at")) or datetime.now(timezone.utc)
            else:
                c_id = c.id
                disruption_id = c.disruption_id
                trip_id = c.trip_id
                target_booking_id = c.target_booking_id
                candidate_type = c.candidate_type
                title = c.title
                description = c.description
                human_explanation = c.human_explanation
                score = c.score
                cost_delta = c.cost_delta
                time_delta_minutes = c.time_delta_minutes
                itinerary_altered_percent = c.itinerary_altered_percent
                refund_amount = c.refund_amount
                refund_eligible = c.refund_eligible
                is_recommended = c.is_recommended
                sb_dict = c.scoring_breakdown.model_dump() if c.scoring_breakdown else {}
                breakdown_json = json.dumps(sb_dict)
                payload_dict = c.mutation_payload or {}
                payload_json = json.dumps(payload_dict)
                created_at = c.created_at

            conn.execute(
                """
                INSERT INTO recovery_candidates (
                    id, disruption_id, trip_id, target_booking_id, candidate_type,
                    title, description, human_explanation, score, cost_delta,
                    time_delta_minutes, itinerary_altered_percent, refund_amount,
                    refund_eligible, is_recommended, scoring_breakdown, mutation_payload, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    score = EXCLUDED.score,
                    is_recommended = EXCLUDED.is_recommended,
                    human_explanation = EXCLUDED.human_explanation,
                    mutation_payload = EXCLUDED.mutation_payload
                """,
                (
                    str(c_id),
                    str(disruption_id),
                    str(trip_id),
                    str(target_booking_id),
                    candidate_type,
                    title,
                    description,
                    human_explanation,
                    score,
                    cost_delta,
                    time_delta_minutes,
                    itinerary_altered_percent,
                    refund_amount,
                    refund_eligible,
                    is_recommended,
                    breakdown_json,
                    payload_json,
                    created_at.isoformat(),
                ),
            )
            results.append(
                RecoveryCandidate(
                    id=c_id,
                    disruption_id=disruption_id,
                    trip_id=trip_id,
                    target_booking_id=target_booking_id,
                    candidate_type=candidate_type,
                    title=title,
                    description=description,
                    human_explanation=human_explanation,
                    score=score,
                    cost_delta=cost_delta,
                    time_delta_minutes=time_delta_minutes,
                    itinerary_altered_percent=itinerary_altered_percent,
                    refund_amount=refund_amount,
                    refund_eligible=refund_eligible,
                    is_recommended=is_recommended,
                    scoring_breakdown=ScoringBreakdown(**sb_dict) if sb_dict else None,
                    mutation_payload=payload_dict,
                    created_at=created_at,
                )
            )

    return results


def db_get_recovery_candidates_by_disruption(disruption_id: UUID) -> List[RecoveryCandidate]:
    with get_db_connection() as conn:
        conn.execute(
            "SELECT * FROM recovery_candidates WHERE disruption_id = %s ORDER BY score DESC",
            (str(disruption_id),),
        )
        rows = conn.cursor.fetchall()
        return [_row_to_recovery_candidate(r) for r in rows]


def db_get_recovery_candidate(candidate_id: UUID) -> Optional[RecoveryCandidate]:
    with get_db_connection() as conn:
        conn.execute("SELECT * FROM recovery_candidates WHERE id = %s", (str(candidate_id),))
        row = conn.cursor.fetchone()
        return _row_to_recovery_candidate(row) if row else None


def db_apply_recovery(candidate_id: UUID) -> Tuple[RecoveryCandidate, Dict[str, Any]]:
    """Atomically apply recovery candidate mutations and record audit trail."""
    candidate = db_get_recovery_candidate(candidate_id)
    if not candidate:
        raise ValueError(f"Candidate {candidate_id} not found")

    target_booking = db_get_booking(candidate.target_booking_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    previous_state = target_booking.model_dump(mode="json") if target_booking else {}
    payload = candidate.mutation_payload
    action = payload.get("action", candidate.candidate_type)

    new_state: Dict[str, Any] = {}

    if action in ("rebook", "shift"):
        new_start = datetime.fromisoformat(payload["new_start_time"])
        new_end = datetime.fromisoformat(payload["new_end_time"])
        cost_delta = payload.get("cost_delta", 0.0)
        new_cost = (target_booking.cost or 0.0) + cost_delta if target_booking and target_booking.cost is not None else None
        new_title = payload.get("title", target_booking.title if target_booking else candidate.title)

        update_in = BookingUpdate(
            title=new_title,
            start_time=new_start,
            end_time=new_end,
            cost=new_cost,
        )
        updated_booking = db_update_booking(candidate.target_booking_id, update_in)
        new_state = updated_booking.model_dump(mode="json") if updated_booking else {}
    elif action == "drop":
        db_delete_booking(candidate.target_booking_id)
        new_state = {
            "dropped": True,
            "refund_amount": payload.get("refund_amount", candidate.refund_amount),
        }

    # Mark disruption resolved
    db_resolve_disruption(candidate.disruption_id)

    # Record audit trail in applied_recoveries
    audit_id = uuid4()
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO applied_recoveries (
                id, disruption_id, candidate_id, applied_at, previous_state, new_state
            ) VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                str(audit_id),
                str(candidate.disruption_id),
                str(candidate.id),
                now_iso,
                json.dumps(previous_state),
                json.dumps(new_state),
            ),
        )

    return candidate, new_state


# --- 6. Multi-Traveler Collaboration Operations (Pure PostgreSQL) ---

def db_add_trip_member(
    trip_id: UUID,
    email: str,
    name: str,
    role: str = "editor",
    invite_token: Optional[str] = None,
    user_id: Optional[UUID] = None,
) -> TripMember:
    member_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    user_str = str(user_id) if user_id else None

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO trip_members (id, trip_id, user_id, email, name, role, invite_token, joined_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (trip_id, email) DO UPDATE SET
                role = EXCLUDED.role,
                name = EXCLUDED.name,
                invite_token = COALESCE(EXCLUDED.invite_token, trip_members.invite_token)
            RETURNING id, trip_id, user_id, email, name, role, invite_token, joined_at
            """,
            (str(member_id), str(trip_id), user_str, email.strip().lower(), name.strip(), role, invite_token, now_iso),
        )
        row = conn.cursor.fetchone()

    return _row_to_trip_member(row)


def db_list_trip_members(trip_id: UUID) -> List[TripMember]:
    with get_db_connection() as conn:
        conn.execute(
            """
            SELECT id, trip_id, user_id, email, name, role, invite_token, joined_at
            FROM trip_members
            WHERE trip_id = %s
            ORDER BY CASE WHEN role = 'owner' THEN 0 WHEN role = 'editor' THEN 1 ELSE 2 END, joined_at ASC
            """,
            (str(trip_id),),
        )
        rows = conn.cursor.fetchall()
        return [_row_to_trip_member(r) for r in rows]


def db_get_trip_member(trip_id: UUID, member_id: UUID) -> Optional[TripMember]:
    with get_db_connection() as conn:
        conn.execute(
            """
            SELECT id, trip_id, user_id, email, name, role, invite_token, joined_at
            FROM trip_members
            WHERE trip_id = %s AND id = %s
            """,
            (str(trip_id), str(member_id)),
        )
        row = conn.cursor.fetchone()
        return _row_to_trip_member(row) if row else None


def db_get_trip_member_by_email(trip_id: UUID, email: str) -> Optional[TripMember]:
    with get_db_connection() as conn:
        conn.execute(
            """
            SELECT id, trip_id, user_id, email, name, role, invite_token, joined_at
            FROM trip_members
            WHERE trip_id = %s AND LOWER(email) = LOWER(%s)
            """,
            (str(trip_id), email.strip()),
        )
        row = conn.cursor.fetchone()
        return _row_to_trip_member(row) if row else None


def db_remove_trip_member(trip_id: UUID, member_id: UUID) -> bool:
    with get_db_connection() as conn:
        conn.execute(
            "DELETE FROM trip_members WHERE trip_id = %s AND id = %s AND role != 'owner'",
            (str(trip_id), str(member_id)),
        )
        return conn.cursor.rowcount > 0


def db_get_invite_by_token(invite_token: str) -> Optional[Tuple[Trip, TripMember]]:
    with get_db_connection() as conn:
        conn.execute(
            """
            SELECT tm.id as member_id, tm.trip_id, tm.user_id, tm.email, tm.name as member_name, tm.role, tm.invite_token, tm.joined_at,
                   t.id as trip_table_id, t.name as trip_name, t.owner_id as trip_owner_id, t.created_at as trip_created_at
            FROM trip_members tm
            JOIN trips t ON t.id = tm.trip_id
            WHERE tm.invite_token = %s
            """,
            (invite_token.strip(),),
        )
        row = conn.cursor.fetchone()
        if not row:
            return None

        trip = Trip(
            id=_to_uuid(row["trip_table_id"]),
            name=row["trip_name"],
            owner_id=_to_uuid(row["trip_owner_id"]) if row.get("trip_owner_id") else None,
            created_at=_to_datetime(row["trip_created_at"]),
        )
        member = TripMember(
            id=_to_uuid(row["member_id"]),
            trip_id=_to_uuid(row["trip_id"]),
            user_id=_to_uuid(row["user_id"]) if row.get("user_id") else None,
            email=row["email"],
            name=row["member_name"],
            role=row["role"],
            invite_token=row["invite_token"],
            joined_at=_to_datetime(row["joined_at"]),
        )
        return trip, member


def db_accept_invite(invite_token: str, name: str, email: str) -> Optional[Tuple[Trip, TripMember]]:
    data = db_get_invite_by_token(invite_token)
    if not data:
        return None
    trip, member = data

    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        conn.execute(
            """
            UPDATE trip_members
            SET name = %s, email = %s, joined_at = %s
            WHERE id = %s
            RETURNING id, trip_id, user_id, email, name, role, invite_token, joined_at
            """,
            (name.strip(), email.strip().lower(), now_iso, str(member.id)),
        )
        row = conn.cursor.fetchone()

    updated_member = _row_to_trip_member(row)
    return trip, updated_member


def db_get_member_role(trip_id: UUID, email: Optional[str]) -> Optional[str]:
    """Retrieve the member's role ('owner', 'editor', 'viewer') or None."""
    if not email:
        return None
    with get_db_connection() as conn:
        conn.execute(
            "SELECT role FROM trip_members WHERE trip_id = %s AND LOWER(email) = LOWER(%s)",
            (str(trip_id), email.strip()),
        )
        row = conn.cursor.fetchone()
        return row["role"] if row else None


def db_add_activity_log(
    trip_id: UUID,
    actor_name: str,
    actor_email: Optional[str],
    action_type: str,
    description: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> ActivityFeedItem:
    activity_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    meta_json = json.dumps(metadata or {})

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO activity_feed (id, trip_id, actor_name, actor_email, action_type, description, metadata, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, trip_id, actor_name, actor_email, action_type, description, metadata, created_at
            """,
            (
                str(activity_id),
                str(trip_id),
                actor_name.strip(),
                actor_email.strip().lower() if actor_email else None,
                action_type,
                description.strip(),
                meta_json,
                now_iso,
            ),
        )
        row = conn.cursor.fetchone()

    return _row_to_activity_feed_item(row)


def db_list_activity_feed(trip_id: UUID, limit: int = 50) -> List[ActivityFeedItem]:
    with get_db_connection() as conn:
        conn.execute(
            """
            SELECT id, trip_id, actor_name, actor_email, action_type, description, metadata, created_at
            FROM activity_feed
            WHERE trip_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (str(trip_id), limit),
        )
        rows = conn.cursor.fetchall()
        return [_row_to_activity_feed_item(r) for r in rows]

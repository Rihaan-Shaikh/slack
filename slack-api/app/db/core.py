import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, urlunparse
from uuid import UUID, uuid4
import psycopg2
import psycopg2.extras
from app.config import settings
from app.models import ActivityFeedItem, Booking, BookingCreate, BookingUpdate, Dependency, DependencyCreate, DependencyUpdate, Disruption, DisruptionCreate, RecoveryCandidate, ScoringBreakdown, Trip, TripCreate, TripMember, User

def ensure_postgres_database():
    """Ensure the target PostgreSQL database exists; if not, create it via maintenance DB."""
    if not settings.database_url:
        raise RuntimeError('DATABASE_URL is not set. A valid PostgreSQL URL is required.')
    parsed = urlparse(settings.database_url)
    target_dbname = parsed.path.lstrip('/') or 'slack_db'
    try:
        conn = psycopg2.connect(settings.database_url, connect_timeout=3)
        conn.close()
        return
    except Exception as e:
        if f'database "{target_dbname}" does not exist' in str(e) or 'does not exist' in str(e):
            print(f"Database '{target_dbname}' does not exist. Creating it on PostgreSQL server...")
            maint_url = urlunparse(parsed._replace(path='/postgres'))
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
            cur.execute("\n                CREATE TABLE IF NOT EXISTS trips (\n                    id UUID PRIMARY KEY,\n                    name TEXT NOT NULL,\n                    owner_id UUID,\n                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n                );\n                CREATE TABLE IF NOT EXISTS bookings (\n                    id UUID PRIMARY KEY,\n                    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,\n                    type TEXT NOT NULL CHECK (type IN ('flight', 'hotel', 'transfer', 'activity')),\n                    title TEXT NOT NULL,\n                    vendor TEXT,\n                    location TEXT,\n                    start_time TIMESTAMPTZ NOT NULL,\n                    end_time TIMESTAMPTZ NOT NULL,\n                    cost NUMERIC,\n                    cancellation_policy TEXT,\n                    metadata JSONB DEFAULT '{}'::jsonb,\n                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n                );\n                CREATE TABLE IF NOT EXISTS dependencies (\n                    id UUID PRIMARY KEY,\n                    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,\n                    from_booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,\n                    to_booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,\n                    min_buffer_minutes INTEGER NOT NULL DEFAULT 0,\n                    dependency_type TEXT DEFAULT 'temporal',\n                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n                );\n                CREATE TABLE IF NOT EXISTS disruptions (\n                    id UUID PRIMARY KEY,\n                    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,\n                    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,\n                    disruption_type TEXT NOT NULL,\n                    delay_minutes INTEGER DEFAULT 0,\n                    description TEXT,\n                    triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n                    resolved BOOLEAN DEFAULT FALSE,\n                    resolved_at TIMESTAMPTZ\n                );\n                CREATE TABLE IF NOT EXISTS recovery_candidates (\n                    id UUID PRIMARY KEY,\n                    disruption_id UUID NOT NULL,\n                    trip_id UUID NOT NULL,\n                    target_booking_id UUID NOT NULL,\n                    candidate_type TEXT NOT NULL,\n                    title TEXT NOT NULL,\n                    description TEXT,\n                    human_explanation TEXT NOT NULL,\n                    score INTEGER NOT NULL,\n                    cost_delta NUMERIC NOT NULL DEFAULT 0,\n                    time_delta_minutes INTEGER NOT NULL DEFAULT 0,\n                    itinerary_altered_percent NUMERIC NOT NULL DEFAULT 0,\n                    refund_amount NUMERIC NOT NULL DEFAULT 0,\n                    refund_eligible BOOLEAN NOT NULL DEFAULT FALSE,\n                    is_recommended BOOLEAN NOT NULL DEFAULT FALSE,\n                    scoring_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,\n                    mutation_payload JSONB NOT NULL DEFAULT '{}'::jsonb,\n                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n                );\n                CREATE TABLE IF NOT EXISTS applied_recoveries (\n                    id UUID PRIMARY KEY,\n                    disruption_id UUID NOT NULL,\n                    candidate_id UUID NOT NULL,\n                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n                    previous_state JSONB NOT NULL DEFAULT '{}'::jsonb,\n                    new_state JSONB NOT NULL DEFAULT '{}'::jsonb\n                );\n                CREATE TABLE IF NOT EXISTS trip_members (\n                    id UUID PRIMARY KEY,\n                    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,\n                    user_id UUID,\n                    email TEXT NOT NULL,\n                    name TEXT NOT NULL,\n                    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),\n                    invite_token TEXT UNIQUE,\n                    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n                    UNIQUE (trip_id, email)\n                );\n                CREATE TABLE IF NOT EXISTS activity_feed (\n                    id UUID PRIMARY KEY,\n                    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,\n                    actor_name TEXT NOT NULL,\n                    actor_email TEXT,\n                    action_type TEXT NOT NULL,\n                    description TEXT NOT NULL,\n                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,\n                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n                );\n                CREATE TABLE IF NOT EXISTS users (\n                    id UUID PRIMARY KEY,\n                    email TEXT NOT NULL UNIQUE,\n                    display_name TEXT NOT NULL,\n                    password_hash TEXT NOT NULL,\n                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n                );\n            ")
        conn.commit()

try:
    init_postgres_db()
except Exception as e:
    print(f"Warning: Could not initialize PostgreSQL: {e}")

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

    def execute(self, query: str, params: Optional[Tuple]=None):
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

def _to_datetime(val: Any) -> Optional[datetime]:
    if val is None or val == '':
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        cleaned = val.replace('Z', '+00:00')
        dt = datetime.fromisoformat(cleaned)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None

def _to_uuid(val: Any) -> Optional[UUID]:
    if val is None or val == '':
        return None
    if isinstance(val, UUID):
        return val
    return UUID(str(val))

def _to_float(val: Any) -> Optional[float]:
    if val is None or val == '':
        return None
    return float(val)

def _to_dict(val: Any) -> Dict[str, Any]:
    if val is None or val == '':
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
    return str(val).lower() in ('true', '1', 't', 'yes')

def _row_to_activity_feed_item(r: Any) -> ActivityFeedItem:
    return ActivityFeedItem(id=_to_uuid(r['id']), trip_id=_to_uuid(r['trip_id']), actor_name=r['actor_name'], actor_email=r.get('actor_email'), action_type=r['action_type'], description=r['description'], metadata=_to_dict(r.get('metadata')), created_at=_to_datetime(r['created_at']) or datetime.now(timezone.utc))

def db_list_dependencies(trip_id: UUID) -> List[Dependency]:
    with get_db_connection() as conn:
        conn.execute('SELECT * FROM dependencies WHERE trip_id = %s', (str(trip_id),))
        rows = conn.cursor.fetchall()
        return [_row_to_dependency(r) for r in rows]

def db_add_activity_log(trip_id: UUID, actor_name: str, actor_email: Optional[str], action_type: str, description: str, metadata: Optional[Dict[str, Any]]=None) -> ActivityFeedItem:
    activity_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    meta_json = json.dumps(metadata or {})
    with get_db_connection() as conn:
        conn.execute('\n            INSERT INTO activity_feed (id, trip_id, actor_name, actor_email, action_type, description, metadata, created_at)\n            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)\n            RETURNING id, trip_id, actor_name, actor_email, action_type, description, metadata, created_at\n            ', (str(activity_id), str(trip_id), actor_name.strip(), actor_email.strip().lower() if actor_email else None, action_type, description.strip(), meta_json, now_iso))
        row = conn.cursor.fetchone()
    return _row_to_activity_feed_item(row)

def db_list_activity_feed(trip_id: UUID, limit: int=50) -> List[ActivityFeedItem]:
    with get_db_connection() as conn:
        conn.execute('\n            SELECT id, trip_id, actor_name, actor_email, action_type, description, metadata, created_at\n            FROM activity_feed\n            WHERE trip_id = %s\n            ORDER BY created_at DESC\n            LIMIT %s\n            ', (str(trip_id), limit))
        rows = conn.cursor.fetchall()
        return [_row_to_activity_feed_item(r) for r in rows]

def _row_to_user(r: Any) -> User:
    return User(id=_to_uuid(r['id']), email=r['email'], display_name=r['display_name'], created_at=_to_datetime(r['created_at']) or datetime.now(timezone.utc))

def db_create_user(email: str, display_name: str, password_hash: str) -> User:
    """Create a new user. Raises IntegrityError if email already exists."""
    user_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        conn.execute('\n            INSERT INTO users (id, email, display_name, password_hash, created_at)\n            VALUES (%s, %s, %s, %s, %s)\n            RETURNING id, email, display_name, created_at\n            ', (str(user_id), email.strip().lower(), display_name.strip(), password_hash, now_iso))
        row = conn.cursor.fetchone()
    return _row_to_user(row)

def db_get_user_by_email(email: str) -> Optional[User]:
    """Fetch a user record by email. Returns None if not found."""
    with get_db_connection() as conn:
        conn.execute('SELECT id, email, display_name, created_at FROM users WHERE email = %s', (email.strip().lower(),))
        row = conn.cursor.fetchone()
    if not row:
        return None
    return _row_to_user(row)

def db_get_user_by_email_with_hash(email: str) -> Optional[tuple]:
    """Returns (User, password_hash) tuple for login verification."""
    with get_db_connection() as conn:
        conn.execute('SELECT id, email, display_name, password_hash, created_at FROM users WHERE email = %s', (email.strip().lower(),))
        row = conn.cursor.fetchone()
    if not row:
        return None
    user = User(id=_to_uuid(row['id']), email=row['email'], display_name=row['display_name'], created_at=_to_datetime(row['created_at']) or datetime.now(timezone.utc))
    return (user, row['password_hash'])

def db_get_user_by_id(user_id: UUID) -> Optional[User]:
    """Fetch a user by UUID."""
    with get_db_connection() as conn:
        conn.execute('SELECT id, email, display_name, created_at FROM users WHERE id = %s', (str(user_id),))
        row = conn.cursor.fetchone()
    if not row:
        return None
    return _row_to_user(row)

def db_seed_demo_users(hash_fn) -> None:
    """
    Idempotently insert 3 demo accounts for the judge demo flow.
    hash_fn is the bcrypt hash function (passed in to avoid circular import with auth.py).
    Demo accounts:
      owner@demo.com   / demo1234  → Aisha (Owner)
      editor@demo.com  / demo1234  → Charlie (Editor)
      viewer@demo.com  / demo1234  → Bob (Viewer)
    """
    demo_accounts = [('owner@demo.com', 'Aisha (Owner)', 'demo1234'), ('editor@demo.com', 'Charlie (Editor)', 'demo1234'), ('viewer@demo.com', 'Bob (Viewer)', 'demo1234')]
    for email, display_name, password in demo_accounts:
        existing = db_get_user_by_email(email)
        if existing is None:
            try:
                db_create_user(email, display_name, hash_fn(password))
                print(f'[auth] Seeded demo user: {email}')
            except Exception as e:
                print(f'[auth] Could not seed {email}: {e}')
        else:
            pass
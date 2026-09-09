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

def _row_to_trip(r: Any) -> Trip:
    return Trip(id=_to_uuid(r['id']), name=r['name'], owner_id=_to_uuid(r['owner_id']) if r.get('owner_id') else None, created_at=_to_datetime(r['created_at']) or datetime.now(timezone.utc))

def db_create_trip(trip_in: TripCreate) -> Trip:
    trip_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    owner_str = str(trip_in.owner_id) if trip_in.owner_id else None
    owner_member_id = uuid4()
    activity_id = uuid4()
    with get_db_connection() as conn:
        conn.execute('INSERT INTO trips (id, name, owner_id, created_at) VALUES (%s, %s, %s, %s)', (str(trip_id), trip_in.name, owner_str, now_iso))
        conn.execute('\n            INSERT INTO trip_members (id, trip_id, user_id, email, name, role, joined_at)\n            VALUES (%s, %s, %s, %s, %s, %s, %s)\n            ON CONFLICT (trip_id, email) DO NOTHING\n            ', (str(owner_member_id), str(trip_id), owner_str, 'owner@slacktravel.demo', 'Trip Owner', 'owner', now_iso))
        conn.execute('\n            INSERT INTO activity_feed (id, trip_id, actor_name, actor_email, action_type, description, metadata, created_at)\n            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)\n            ', (str(activity_id), str(trip_id), 'Trip Owner', 'owner@slacktravel.demo', 'TRIP_CREATED', f"Trip '{trip_in.name}' created", json.dumps({'trip_name': trip_in.name}), now_iso))
    return Trip(id=trip_id, name=trip_in.name, owner_id=trip_in.owner_id, created_at=datetime.fromisoformat(now_iso))

def db_get_trip(trip_id: UUID) -> Optional[Trip]:
    with get_db_connection() as conn:
        conn.execute('SELECT * FROM trips WHERE id = %s', (str(trip_id),))
        row = conn.cursor.fetchone()
        return _row_to_trip(row) if row else None

def db_list_trips() -> List[Trip]:
    with get_db_connection() as conn:
        conn.execute('SELECT * FROM trips ORDER BY created_at DESC')
        rows = conn.cursor.fetchall()
        return [_row_to_trip(r) for r in rows]

def db_update_trip_name(trip_id: UUID, name: str) -> Optional[Trip]:
    with get_db_connection() as conn:
        conn.execute('UPDATE trips SET name = %s WHERE id = %s RETURNING *', (name, str(trip_id)))
        row = conn.cursor.fetchone()
        return _row_to_trip(row) if row else None

def db_delete_trip(trip_id: UUID) -> bool:
    with get_db_connection() as conn:
        conn.execute('DELETE FROM recovery_candidates WHERE disruption_id IN (SELECT id FROM disruptions WHERE trip_id = %s)', (str(trip_id),))
        conn.execute('DELETE FROM applied_recoveries WHERE disruption_id IN (SELECT id FROM disruptions WHERE trip_id = %s)', (str(trip_id),))
        conn.execute('DELETE FROM disruptions WHERE trip_id = %s', (str(trip_id),))
        conn.execute('DELETE FROM dependencies WHERE trip_id = %s', (str(trip_id),))
        conn.execute('DELETE FROM bookings WHERE trip_id = %s', (str(trip_id),))
        conn.execute('DELETE FROM trip_members WHERE trip_id = %s', (str(trip_id),))
        conn.execute('DELETE FROM activity_feed WHERE trip_id = %s', (str(trip_id),))
        conn.execute('DELETE FROM trips WHERE id = %s', (str(trip_id),))
        return True

def db_get_user_role_for_trip(trip_id: UUID, user_id: UUID) -> Optional[str]:
    """
    Look up this user's role in trip_members for the given trip.
    Returns the role string ('owner', 'editor', 'viewer') or None if not a member.
    """
    with get_db_connection() as conn:
        conn.execute('\n            SELECT role FROM trip_members\n            WHERE trip_id = %s AND user_id = %s\n            ', (str(trip_id), str(user_id)))
        row = conn.cursor.fetchone()
    if not row:
        return None
    return row['role']

def db_list_trips_for_user(user_id: UUID) -> List[Trip]:
    """
    Return trips where user is the owner OR is an explicit trip_member.
    Trips with owner_id = NULL (legacy/demo) are also included for backward compat.
    """
    with get_db_connection() as conn:
        conn.execute('\n            SELECT DISTINCT t.id, t.name, t.owner_id, t.created_at\n            FROM trips t\n            LEFT JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = %s\n            WHERE t.owner_id = %s\n               OR tm.user_id = %s\n               OR t.owner_id IS NULL\n            ORDER BY t.created_at DESC\n            ', (str(user_id), str(user_id), str(user_id)))
        rows = conn.cursor.fetchall()
    return [_row_to_trip(r) for r in rows]
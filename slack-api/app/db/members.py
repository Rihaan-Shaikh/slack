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

def _row_to_trip_member(r: Any) -> TripMember:
    return TripMember(id=_to_uuid(r['id']), trip_id=_to_uuid(r['trip_id']), user_id=_to_uuid(r['user_id']) if r.get('user_id') else None, email=r['email'], name=r['name'], role=r['role'], invite_token=r.get('invite_token'), joined_at=_to_datetime(r['joined_at']) or datetime.now(timezone.utc))

def db_add_trip_member(trip_id: UUID, email: str, name: str, role: str='editor', invite_token: Optional[str]=None, user_id: Optional[UUID]=None) -> TripMember:
    member_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    user_str = str(user_id) if user_id else None
    with get_db_connection() as conn:
        conn.execute('\n            INSERT INTO trip_members (id, trip_id, user_id, email, name, role, invite_token, joined_at)\n            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)\n            ON CONFLICT (trip_id, email) DO UPDATE SET\n                role = EXCLUDED.role,\n                name = EXCLUDED.name,\n                invite_token = COALESCE(EXCLUDED.invite_token, trip_members.invite_token)\n            RETURNING id, trip_id, user_id, email, name, role, invite_token, joined_at\n            ', (str(member_id), str(trip_id), user_str, email.strip().lower(), name.strip(), role, invite_token, now_iso))
        row = conn.cursor.fetchone()
    return _row_to_trip_member(row)

def db_list_trip_members(trip_id: UUID) -> List[TripMember]:
    with get_db_connection() as conn:
        conn.execute("\n            SELECT id, trip_id, user_id, email, name, role, invite_token, joined_at\n            FROM trip_members\n            WHERE trip_id = %s\n            ORDER BY CASE WHEN role = 'owner' THEN 0 WHEN role = 'editor' THEN 1 ELSE 2 END, joined_at ASC\n            ", (str(trip_id),))
        rows = conn.cursor.fetchall()
        return [_row_to_trip_member(r) for r in rows]

def db_get_trip_member(trip_id: UUID, member_id: UUID) -> Optional[TripMember]:
    with get_db_connection() as conn:
        conn.execute('\n            SELECT id, trip_id, user_id, email, name, role, invite_token, joined_at\n            FROM trip_members\n            WHERE trip_id = %s AND id = %s\n            ', (str(trip_id), str(member_id)))
        row = conn.cursor.fetchone()
        return _row_to_trip_member(row) if row else None

def db_get_trip_member_by_email(trip_id: UUID, email: str) -> Optional[TripMember]:
    with get_db_connection() as conn:
        conn.execute('\n            SELECT id, trip_id, user_id, email, name, role, invite_token, joined_at\n            FROM trip_members\n            WHERE trip_id = %s AND LOWER(email) = LOWER(%s)\n            ', (str(trip_id), email.strip()))
        row = conn.cursor.fetchone()
        return _row_to_trip_member(row) if row else None

def db_remove_trip_member(trip_id: UUID, member_id: UUID) -> bool:
    with get_db_connection() as conn:
        conn.execute("DELETE FROM trip_members WHERE trip_id = %s AND id = %s AND role != 'owner'", (str(trip_id), str(member_id)))
        return conn.cursor.rowcount > 0

def db_get_invite_by_token(invite_token: str) -> Optional[Tuple[Trip, TripMember]]:
    with get_db_connection() as conn:
        conn.execute('\n            SELECT tm.id as member_id, tm.trip_id, tm.user_id, tm.email, tm.name as member_name, tm.role, tm.invite_token, tm.joined_at,\n                   t.id as trip_table_id, t.name as trip_name, t.owner_id as trip_owner_id, t.created_at as trip_created_at\n            FROM trip_members tm\n            JOIN trips t ON t.id = tm.trip_id\n            WHERE tm.invite_token = %s\n            ', (invite_token.strip(),))
        row = conn.cursor.fetchone()
        if not row:
            return None
        trip = Trip(id=_to_uuid(row['trip_table_id']), name=row['trip_name'], owner_id=_to_uuid(row['trip_owner_id']) if row.get('trip_owner_id') else None, created_at=_to_datetime(row['trip_created_at']))
        member = TripMember(id=_to_uuid(row['member_id']), trip_id=_to_uuid(row['trip_id']), user_id=_to_uuid(row['user_id']) if row.get('user_id') else None, email=row['email'], name=row['member_name'], role=row['role'], invite_token=row['invite_token'], joined_at=_to_datetime(row['joined_at']))
        return (trip, member)

def db_accept_invite(invite_token: str, name: str, email: str) -> Optional[Tuple[Trip, TripMember]]:
    data = db_get_invite_by_token(invite_token)
    if not data:
        return None
    trip, member = data
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        conn.execute('\n            UPDATE trip_members\n            SET name = %s, email = %s, joined_at = %s\n            WHERE id = %s\n            RETURNING id, trip_id, user_id, email, name, role, invite_token, joined_at\n            ', (name.strip(), email.strip().lower(), now_iso, str(member.id)))
        row = conn.cursor.fetchone()
    updated_member = _row_to_trip_member(row)
    return (trip, updated_member)

def db_get_member_role(trip_id: UUID, email: Optional[str]) -> Optional[str]:
    """Retrieve the member's role ('owner', 'editor', 'viewer') or None."""
    if not email:
        return None
    with get_db_connection() as conn:
        conn.execute('SELECT role FROM trip_members WHERE trip_id = %s AND LOWER(email) = LOWER(%s)', (str(trip_id), email.strip()))
        row = conn.cursor.fetchone()
        return row['role'] if row else None
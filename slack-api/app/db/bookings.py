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

def _row_to_booking(r: Any) -> Booking:
    return Booking(id=_to_uuid(r['id']), trip_id=_to_uuid(r['trip_id']), type=r['type'], title=r['title'], vendor=r.get('vendor'), location=r.get('location'), start_time=_to_datetime(r['start_time']) or datetime.now(timezone.utc), end_time=_to_datetime(r['end_time']) or datetime.now(timezone.utc), cost=_to_float(r.get('cost')), cancellation_policy=r.get('cancellation_policy'), metadata=_to_dict(r.get('metadata')), created_at=_to_datetime(r['created_at']) or datetime.now(timezone.utc))

def _row_to_dependency(r: Any) -> Dependency:
    return Dependency(id=_to_uuid(r['id']), trip_id=_to_uuid(r['trip_id']), from_booking_id=_to_uuid(r['from_booking_id']), to_booking_id=_to_uuid(r['to_booking_id']), min_buffer_minutes=int(r['min_buffer_minutes']), dependency_type=r.get('dependency_type') or 'temporal', created_at=_to_datetime(r['created_at']) or datetime.now(timezone.utc))

def db_create_booking(trip_id: UUID, booking_in: BookingCreate) -> Booking:
    booking_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    meta_json = json.dumps(booking_in.metadata or {})
    with get_db_connection() as conn:
        conn.execute('\n            INSERT INTO bookings (\n                id, trip_id, type, title, vendor, location,\n                start_time, end_time, cost, cancellation_policy, metadata, created_at\n            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)\n            ', (str(booking_id), str(trip_id), booking_in.type, booking_in.title, booking_in.vendor, booking_in.location, booking_in.start_time.isoformat(), booking_in.end_time.isoformat(), booking_in.cost, booking_in.cancellation_policy, meta_json, now_iso))
    return Booking(id=booking_id, trip_id=trip_id, type=booking_in.type, title=booking_in.title, vendor=booking_in.vendor, location=booking_in.location, start_time=booking_in.start_time, end_time=booking_in.end_time, cost=booking_in.cost, cancellation_policy=booking_in.cancellation_policy, metadata=booking_in.metadata, created_at=datetime.fromisoformat(now_iso))

def db_get_booking(booking_id: UUID) -> Optional[Booking]:
    with get_db_connection() as conn:
        conn.execute('SELECT * FROM bookings WHERE id = %s', (str(booking_id),))
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
        set_clauses.append(f'{k} = %s')
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
        conn.execute('DELETE FROM dependencies WHERE from_booking_id = %s OR to_booking_id = %s', (str(booking_id), str(booking_id)))
        conn.execute('DELETE FROM bookings WHERE id = %s', (str(booking_id),))
        return conn.cursor.rowcount > 0

def db_list_bookings(trip_id: UUID) -> List[Booking]:
    with get_db_connection() as conn:
        conn.execute('SELECT * FROM bookings WHERE trip_id = %s ORDER BY start_time ASC', (str(trip_id),))
        rows = conn.cursor.fetchall()
        return [_row_to_booking(r) for r in rows]

def db_create_dependency(trip_id: UUID, dep_in: DependencyCreate) -> Dependency:
    dep_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        conn.execute('\n            INSERT INTO dependencies (\n                id, trip_id, from_booking_id, to_booking_id, min_buffer_minutes, dependency_type, created_at\n            ) VALUES (%s, %s, %s, %s, %s, %s, %s)\n            ', (str(dep_id), str(trip_id), str(dep_in.from_booking_id), str(dep_in.to_booking_id), dep_in.min_buffer_minutes, dep_in.dependency_type, now_iso))
    return Dependency(id=dep_id, trip_id=trip_id, from_booking_id=dep_in.from_booking_id, to_booking_id=dep_in.to_booking_id, min_buffer_minutes=dep_in.min_buffer_minutes, dependency_type=dep_in.dependency_type, created_at=datetime.fromisoformat(now_iso))

def db_get_dependency(dep_id: UUID) -> Optional[Dependency]:
    with get_db_connection() as conn:
        conn.execute('SELECT * FROM dependencies WHERE id = %s', (str(dep_id),))
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
        set_clauses.append(f'{k} = %s')
        params.append(v)
    params.append(str(dep_id))
    query = f"UPDATE dependencies SET {', '.join(set_clauses)} WHERE id = %s RETURNING *"
    with get_db_connection() as conn:
        conn.execute(query, tuple(params))
        row = conn.cursor.fetchone()
        return _row_to_dependency(row) if row else None

def db_delete_dependency(dep_id: UUID) -> bool:
    with get_db_connection() as conn:
        conn.execute('DELETE FROM dependencies WHERE id = %s', (str(dep_id),))
        return conn.cursor.rowcount > 0
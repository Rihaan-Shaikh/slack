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

def _row_to_disruption(r: Any) -> Disruption:
    return Disruption(id=_to_uuid(r['id']), trip_id=_to_uuid(r['trip_id']), booking_id=_to_uuid(r['booking_id']), disruption_type=r['disruption_type'], delay_minutes=int(r['delay_minutes']), description=r.get('description'), triggered_at=_to_datetime(r['triggered_at']) or datetime.now(timezone.utc), resolved=_to_bool(r['resolved']), resolved_at=_to_datetime(r['resolved_at']) if r.get('resolved_at') else None)

def _row_to_recovery_candidate(r: Any) -> RecoveryCandidate:
    breakdown_dict = _to_dict(r.get('scoring_breakdown'))
    breakdown_obj = ScoringBreakdown(**breakdown_dict) if breakdown_dict else None
    mutation_dict = _to_dict(r.get('mutation_payload'))
    return RecoveryCandidate(id=_to_uuid(r['id']), disruption_id=_to_uuid(r['disruption_id']), trip_id=_to_uuid(r['trip_id']), target_booking_id=_to_uuid(r['target_booking_id']), candidate_type=r['candidate_type'], title=r['title'], description=r.get('description'), human_explanation=r['human_explanation'], score=int(r['score']), cost_delta=_to_float(r.get('cost_delta')) or 0.0, time_delta_minutes=int(r.get('time_delta_minutes', 0)), itinerary_altered_percent=_to_float(r.get('itinerary_altered_percent')) or 0.0, refund_amount=_to_float(r.get('refund_amount')) or 0.0, refund_eligible=_to_bool(r.get('refund_eligible')), is_recommended=_to_bool(r.get('is_recommended')), scoring_breakdown=breakdown_obj, mutation_payload=mutation_dict, created_at=_to_datetime(r['created_at']) or datetime.now(timezone.utc))

def db_create_disruption(trip_id: UUID, disruption_in: DisruptionCreate) -> Disruption:
    disruption_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        conn.execute('\n            INSERT INTO disruptions (\n                id, trip_id, booking_id, disruption_type, delay_minutes, description,\n                triggered_at, resolved, resolved_at\n            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)\n            ', (str(disruption_id), str(trip_id), str(disruption_in.booking_id), disruption_in.disruption_type, disruption_in.delay_minutes, disruption_in.description, now_iso, False, None))
    return Disruption(id=disruption_id, trip_id=trip_id, booking_id=disruption_in.booking_id, disruption_type=disruption_in.disruption_type, delay_minutes=disruption_in.delay_minutes, description=disruption_in.description, triggered_at=datetime.fromisoformat(now_iso), resolved=False, resolved_at=None)

def db_get_disruption(disruption_id: UUID) -> Optional[Disruption]:
    with get_db_connection() as conn:
        conn.execute('SELECT * FROM disruptions WHERE id = %s', (str(disruption_id),))
        row = conn.cursor.fetchone()
        return _row_to_disruption(row) if row else None

def db_list_active_disruptions(trip_id: UUID) -> List[Disruption]:
    with get_db_connection() as conn:
        conn.execute('SELECT * FROM disruptions WHERE trip_id = %s AND resolved = FALSE ORDER BY triggered_at DESC', (str(trip_id),))
        rows = conn.cursor.fetchall()
        return [_row_to_disruption(r) for r in rows]

def db_resolve_disruption(disruption_id: UUID) -> bool:
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        conn.execute('UPDATE disruptions SET resolved = TRUE, resolved_at = %s WHERE id = %s', (now_iso, str(disruption_id)))
        return conn.cursor.rowcount > 0

def db_save_recovery_candidates(candidates: List[Any]) -> List[RecoveryCandidate]:
    if not candidates:
        return []
    results: List[RecoveryCandidate] = []
    with get_db_connection() as conn:
        for c in candidates:
            if isinstance(c, dict):
                c_id = _to_uuid(c.get('id')) or uuid4()
                disruption_id = _to_uuid(c.get('disruption_id'))
                trip_id = _to_uuid(c.get('trip_id'))
                target_booking_id = _to_uuid(c.get('target_booking_id'))
                candidate_type = c.get('candidate_type', 'retime')
                title = c.get('title', '')
                description = c.get('description')
                human_explanation = c.get('human_explanation', '')
                score = int(c.get('score', 0))
                cost_delta = _to_float(c.get('cost_delta', 0.0)) or 0.0
                time_delta_minutes = int(c.get('time_delta_minutes', 0))
                itinerary_altered_percent = _to_float(c.get('itinerary_altered_percent', 0.0)) or 0.0
                refund_amount = _to_float(c.get('refund_amount', 0.0)) or 0.0
                refund_eligible = _to_bool(c.get('refund_eligible', False))
                is_recommended = _to_bool(c.get('is_recommended', False))
                sb = c.get('scoring_breakdown')
                if hasattr(sb, 'model_dump'):
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
                payload = c.get('mutation_payload')
                if hasattr(payload, 'model_dump'):
                    payload_dict = payload.model_dump()
                elif isinstance(payload, dict):
                    payload_dict = payload
                else:
                    payload_dict = {}
                payload_json = json.dumps(payload_dict)
                created_at = _to_datetime(c.get('created_at')) or datetime.now(timezone.utc)
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
            conn.execute('\n                INSERT INTO recovery_candidates (\n                    id, disruption_id, trip_id, target_booking_id, candidate_type,\n                    title, description, human_explanation, score, cost_delta,\n                    time_delta_minutes, itinerary_altered_percent, refund_amount,\n                    refund_eligible, is_recommended, scoring_breakdown, mutation_payload, created_at\n                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)\n                ON CONFLICT (id) DO UPDATE SET\n                    score = EXCLUDED.score,\n                    is_recommended = EXCLUDED.is_recommended,\n                    human_explanation = EXCLUDED.human_explanation,\n                    mutation_payload = EXCLUDED.mutation_payload\n                ', (str(c_id), str(disruption_id), str(trip_id), str(target_booking_id), candidate_type, title, description, human_explanation, score, cost_delta, time_delta_minutes, itinerary_altered_percent, refund_amount, refund_eligible, is_recommended, breakdown_json, payload_json, created_at.isoformat()))
            results.append(RecoveryCandidate(id=c_id, disruption_id=disruption_id, trip_id=trip_id, target_booking_id=target_booking_id, candidate_type=candidate_type, title=title, description=description, human_explanation=human_explanation, score=score, cost_delta=cost_delta, time_delta_minutes=time_delta_minutes, itinerary_altered_percent=itinerary_altered_percent, refund_amount=refund_amount, refund_eligible=refund_eligible, is_recommended=is_recommended, scoring_breakdown=ScoringBreakdown(**sb_dict) if sb_dict else None, mutation_payload=payload_dict, created_at=created_at))
    return results

def db_get_recovery_candidates_by_disruption(disruption_id: UUID) -> List[RecoveryCandidate]:
    with get_db_connection() as conn:
        conn.execute('SELECT * FROM recovery_candidates WHERE disruption_id = %s ORDER BY score DESC', (str(disruption_id),))
        rows = conn.cursor.fetchall()
        return [_row_to_recovery_candidate(r) for r in rows]

def db_get_recovery_candidate(candidate_id: UUID) -> Optional[RecoveryCandidate]:
    with get_db_connection() as conn:
        conn.execute('SELECT * FROM recovery_candidates WHERE id = %s', (str(candidate_id),))
        row = conn.cursor.fetchone()
        return _row_to_recovery_candidate(row) if row else None

def db_apply_recovery(candidate_id: UUID) -> Tuple[RecoveryCandidate, Dict[str, Any]]:
    """Atomically apply recovery candidate mutations and record audit trail."""
    candidate = db_get_recovery_candidate(candidate_id)
    if not candidate:
        raise ValueError(f'Candidate {candidate_id} not found')
    target_booking = db_get_booking(candidate.target_booking_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    previous_state = target_booking.model_dump(mode='json') if target_booking else {}
    payload = candidate.mutation_payload
    action = payload.get('action', candidate.candidate_type)
    new_state: Dict[str, Any] = {}
    if action in ('rebook', 'shift'):
        new_start = datetime.fromisoformat(payload['new_start_time'])
        new_end = datetime.fromisoformat(payload['new_end_time'])
        cost_delta = payload.get('cost_delta', 0.0)
        new_cost = (target_booking.cost or 0.0) + cost_delta if target_booking and target_booking.cost is not None else None
        new_title = payload.get('title', target_booking.title if target_booking else candidate.title)
        update_in = BookingUpdate(title=new_title, start_time=new_start, end_time=new_end, cost=new_cost)
        updated_booking = db_update_booking(candidate.target_booking_id, update_in)
        new_state = updated_booking.model_dump(mode='json') if updated_booking else {}
    elif action == 'drop':
        db_delete_booking(candidate.target_booking_id)
        new_state = {'dropped': True, 'refund_amount': payload.get('refund_amount', candidate.refund_amount)}
    db_resolve_disruption(candidate.disruption_id)
    audit_id = uuid4()
    with get_db_connection() as conn:
        conn.execute('\n            INSERT INTO applied_recoveries (\n                id, disruption_id, candidate_id, applied_at, previous_state, new_state\n            ) VALUES (%s, %s, %s, %s, %s, %s)\n            ', (str(audit_id), str(candidate.disruption_id), str(candidate.id), now_iso, json.dumps(previous_state), json.dumps(new_state)))
    return (candidate, new_state)

def db_list_resolved_disruptions(trip_id: UUID) -> List[Disruption]:
    with get_db_connection() as conn:
        conn.execute('SELECT * FROM disruptions WHERE trip_id = %s AND resolved = TRUE ORDER BY triggered_at DESC', (str(trip_id),))
        rows = conn.cursor.fetchall()
        return [_row_to_disruption(r) for r in rows]

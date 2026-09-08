# Pure, unit-testable Ranked Recovery Generation and scoring engine
import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4
import httpx

from app.models import (
    Booking,
    CandidateType,
    Dependency,
    Disruption,
    RecoveryCandidate,
    ScoringBreakdown,
)

def parse_cancellation_policy(
    policy_str: Optional[str],
    cost: Optional[float],
    hours_before_departure: float = 48.0,
) -> Tuple[float, bool]:
    # Returns (refund_amount, is_refund_eligible)
    if not cost or cost <= 0:
        return 0.0, False

    if not policy_str:
        # Default policy: 50% partial refund
        return round(cost * 0.5, 2), True

    policy_lower = policy_str.lower().strip()

    if "non-refundable" in policy_lower or "non refundable" in policy_lower or "no refund" in policy_lower:
        return 0.0, False

    if "free cancellation" in policy_lower or "fully refundable" in policy_lower or "full refund" in policy_lower:
        return round(cost, 2), True

    # Check for "refundable up to X hours/days prior"
    hours_match = re.search(r"(\d+)\s*(hour|hr|h)", policy_lower)
    if hours_match:
        cutoff_hours = float(hours_match.group(1))
        if hours_before_departure >= cutoff_hours:
            return round(cost, 2), True
        else:
            return round(cost * 0.25, 2), True

    days_match = re.search(r"(\d+)\s*(day|d)", policy_lower)
    if days_match:
        cutoff_hours = float(days_match.group(1)) * 24.0
        if hours_before_departure >= cutoff_hours:
            return round(cost, 2), True
        else:
            return round(cost * 0.25, 2), True

    # Generic refundable: 80% refund
    if "refundable" in policy_lower:
        return round(cost * 0.8, 2), True

    return round(cost * 0.5, 2), True

def score_recovery_candidate(
    candidate_type: CandidateType,
    cost_delta: float,
    time_delta_minutes: int,
    itinerary_altered_percent: float,
    refund_amount: float,
    refund_eligible: bool,
    original_cost: Optional[float] = None,
) -> Tuple[int, ScoringBreakdown]:
    # Fixed transparent weights summing to 1.00
    w_cost = 0.35
    w_time = 0.30
    w_itin = 0.20
    w_refund = 0.15

    # 1. Cost Score (0 - 100): zero or negative cost delta = 100, drops linearly as extra cost rises
    if cost_delta <= 0:
        cost_score = 100.0
    else:
        cost_score = max(0.0, round(100.0 - (cost_delta * 1.5), 1))

    # 2. Time Score (0 - 100): zero or negative slip = 100, drops linearly with schedule delay
    if time_delta_minutes <= 0:
        time_score = 100.0
    else:
        time_score = max(0.0, round(100.0 - (time_delta_minutes * 0.5), 1))

    # 3. Itinerary Preservation Score (0 - 100): 100 minus percentage of itinerary modified
    itinerary_score = max(0.0, round(100.0 - itinerary_altered_percent, 1))

    # 4. Refund / Value Recovery Score (0 - 100)
    if candidate_type == "drop":
        if refund_eligible and original_cost and original_cost > 0:
            refund_score = min(100.0, round((refund_amount / original_cost) * 100.0, 1))
        elif refund_eligible and refund_amount > 0:
            refund_score = 80.0
        else:
            refund_score = 0.0
    else:
        # Rebook and Shift do not drop the booking, preserving full purchase value
        refund_score = 100.0

    raw_total = (
        w_cost * cost_score
        + w_time * time_score
        + w_itin * itinerary_score
        + w_refund * refund_score
    )
    final_score = int(max(0, min(100, round(raw_total))))

    formula_explanation = (
        f"({int(w_cost * 100)}% × {cost_score:.1f} cost) + "
        f"({int(w_time * 100)}% × {time_score:.1f} time) + "
        f"({int(w_itin * 100)}% × {itinerary_score:.1f} itinerary) + "
        f"({int(w_refund * 100)}% × {refund_score:.1f} refund) = {final_score}/100"
    )

    breakdown = ScoringBreakdown(
        cost_score=cost_score,
        cost_weight=w_cost,
        time_score=time_score,
        time_weight=w_time,
        itinerary_score=itinerary_score,
        itinerary_weight=w_itin,
        refund_score=refund_score,
        refund_weight=w_refund,
        raw_cost_delta=round(cost_delta, 2),
        raw_time_delta_minutes=time_delta_minutes,
        raw_altered_percent=round(itinerary_altered_percent, 1),
        raw_refund_amount=round(refund_amount, 2),
        formula_explanation=formula_explanation,
    )

    return final_score, breakdown

def generate_raw_recovery_candidates(
    trip_id: UUID,
    disruption: Disruption,
    disrupted_booking: Booking,
    broken_booking: Booking,
    all_bookings: List[Booking],
    dependencies: List[Dependency],
) -> List[Dict[str, Any]]:
    # Generate up to 3 raw candidates against the specific broken booking
    raw_list: List[Dict[str, Any]] = []
    total_count = max(1, len(all_bookings))
    altered_pct = round((1.0 / total_count) * 100.0, 1)

    target_cost = broken_booking.cost or 40.0
    delay_min = disruption.delay_minutes or 60

    # Calculate earliest viable start time based on effective arrival of predecessor
    effective_arrival = disrupted_booking.end_time + timedelta(minutes=delay_min)
    # Target required buffer (find connecting dependency if exists)
    conn_dep = next(
        (
            d
            for d in dependencies
            if str(d.from_booking_id) == str(disrupted_booking.id)
            and str(d.to_booking_id) == str(broken_booking.id)
        ),
        None,
    )
    req_buffer = conn_dep.min_buffer_minutes if conn_dep else 30
    viable_earliest_start = effective_arrival + timedelta(minutes=req_buffer)

    # Calculate time to departure for cancellation policy
    now_utc = datetime.now(timezone.utc)
    if broken_booking.start_time.tzinfo is None:
        target_start_aware = broken_booking.start_time.replace(tzinfo=timezone.utc)
    else:
        target_start_aware = broken_booking.start_time
    hours_to_dep = max(0.0, (target_start_aware - now_utc).total_seconds() / 3600.0)

    # -------------------------------------------------------------
    # Candidate 1: REBOOK (Push to later slot with real buffer)
    # -------------------------------------------------------------
    # Calculate next scheduled slot: round forward to 15-min or 30-min block
    slot_minutes = max(15, int((viable_earliest_start - target_start_aware).total_seconds() / 60.0) + 15)
    rebook_start = target_start_aware + timedelta(minutes=slot_minutes)
    duration = broken_booking.end_time - broken_booking.start_time
    rebook_end = rebook_start + duration

    rebook_cost_delta = round(min(45.0, max(15.0, target_cost * 0.25)), 2)

    score_1, breakdown_1 = score_recovery_candidate(
        candidate_type="rebook",
        cost_delta=rebook_cost_delta,
        time_delta_minutes=slot_minutes,
        itinerary_altered_percent=altered_pct,
        refund_amount=0.0,
        refund_eligible=False,
        original_cost=target_cost,
    )

    rebook_candidate = {
        "id": uuid4(),
        "disruption_id": disruption.id,
        "trip_id": trip_id,
        "target_booking_id": broken_booking.id,
        "candidate_type": "rebook",
        "title": f"Rebook {broken_booking.title} (+{slot_minutes}m slot)",
        "description": (
            f"Transfer {broken_booking.title} to the next departure at "
            f"{rebook_start.strftime('%H:%M')}, restoring {req_buffer}m of positive slack."
        ),
        "human_explanation": (
            f"Push {broken_booking.title} to the {rebook_start.strftime('%H:%M')} slot "
            f"for an extra ${int(rebook_cost_delta)}, restoring {req_buffer}m of safe buffer."
        ),
        "score": score_1,
        "cost_delta": rebook_cost_delta,
        "time_delta_minutes": slot_minutes,
        "itinerary_altered_percent": altered_pct,
        "refund_amount": 0.0,
        "refund_eligible": False,
        "scoring_breakdown": breakdown_1,
        "mutation_payload": {
            "action": "rebook",
            "booking_id": str(broken_booking.id),
            "new_start_time": rebook_start.isoformat(),
            "new_end_time": rebook_end.isoformat(),
            "cost_delta": rebook_cost_delta,
        },
    }
    raw_list.append(rebook_candidate)

    # -------------------------------------------------------------
    # Candidate 2: SHIFT (only for hotel/activity) OR ALTERNATIVE UPGRADE
    # -------------------------------------------------------------
    if broken_booking.type in ("hotel", "activity"):
        shift_minutes = delay_min
        shift_start = target_start_aware + timedelta(minutes=shift_minutes)
        shift_end = broken_booking.end_time + timedelta(minutes=shift_minutes)

        score_2, breakdown_2 = score_recovery_candidate(
            candidate_type="shift",
            cost_delta=0.0,
            time_delta_minutes=shift_minutes,
            itinerary_altered_percent=altered_pct,
            refund_amount=0.0,
            refund_eligible=False,
            original_cost=target_cost,
        )

        shift_candidate = {
            "id": uuid4(),
            "disruption_id": disruption.id,
            "trip_id": trip_id,
            "target_booking_id": broken_booking.id,
            "candidate_type": "shift",
            "title": f"Shift {broken_booking.title} Schedule (+{shift_minutes}m)",
            "description": (
                f"Shift {broken_booking.title} check-in/start time to "
                f"{shift_start.strftime('%H:%M')} with zero fee, accommodating incoming arrival."
            ),
            "human_explanation": (
                f"Shift {broken_booking.title} to {shift_start.strftime('%H:%M')} with "
                f"zero extra charge, safely preserving all subsequent plans."
            ),
            "score": score_2,
            "cost_delta": 0.0,
            "time_delta_minutes": shift_minutes,
            "itinerary_altered_percent": altered_pct,
            "refund_amount": 0.0,
            "refund_eligible": False,
            "scoring_breakdown": breakdown_2,
            "mutation_payload": {
                "action": "shift",
                "booking_id": str(broken_booking.id),
                "new_start_time": shift_start.isoformat(),
                "new_end_time": shift_end.isoformat(),
                "cost_delta": 0.0,
            },
        }
        raw_list.append(shift_candidate)
    else:
        # For transfers/flights: Offer Express Priority / Direct Transfer Alternative
        express_start = viable_earliest_start + timedelta(minutes=5)
        express_duration = timedelta(minutes=max(20, int(duration.total_seconds() / 60.0) - 10))
        express_end = express_start + express_duration
        express_cost_delta = round(min(60.0, max(25.0, target_cost * 0.6)), 2)
        express_time_delta = max(5, int((express_start - target_start_aware).total_seconds() / 60.0))

        score_2, breakdown_2 = score_recovery_candidate(
            candidate_type="rebook",
            cost_delta=express_cost_delta,
            time_delta_minutes=express_time_delta,
            itinerary_altered_percent=altered_pct,
            refund_amount=0.0,
            refund_eligible=False,
            original_cost=target_cost,
        )

        upgrade_candidate = {
            "id": uuid4(),
            "disruption_id": disruption.id,
            "trip_id": trip_id,
            "target_booking_id": broken_booking.id,
            "candidate_type": "rebook",
            "title": f"Priority Express Direct ({broken_booking.title})",
            "description": (
                f"Switch to express direct departure at {express_start.strftime('%H:%M')} "
                f"saving transit time and securing arrival ahead of schedule."
            ),
            "human_explanation": (
                f"Upgrade to a direct express connection at {express_start.strftime('%H:%M')} "
                f"for +${int(express_cost_delta)} to recover lost buffer immediately."
            ),
            "score": score_2,
            "cost_delta": express_cost_delta,
            "time_delta_minutes": express_time_delta,
            "itinerary_altered_percent": altered_pct,
            "refund_amount": 0.0,
            "refund_eligible": False,
            "scoring_breakdown": breakdown_2,
            "mutation_payload": {
                "action": "rebook",
                "booking_id": str(broken_booking.id),
                "title": f"Direct Express {broken_booking.title}",
                "new_start_time": express_start.isoformat(),
                "new_end_time": express_end.isoformat(),
                "cost_delta": express_cost_delta,
            },
        }
        raw_list.append(upgrade_candidate)

    # -------------------------------------------------------------
    # Candidate 3: DROP (Remove booking, calculate policy refund)
    # -------------------------------------------------------------
    refund_amt, refund_ok = parse_cancellation_policy(
        policy_str=broken_booking.cancellation_policy,
        cost=target_cost,
        hours_before_departure=hours_to_dep,
    )

    # Cost delta is negative refund (money returned to traveler)
    drop_cost_delta = -refund_amt

    score_3, breakdown_3 = score_recovery_candidate(
        candidate_type="drop",
        cost_delta=drop_cost_delta,
        time_delta_minutes=0,
        itinerary_altered_percent=altered_pct,
        refund_amount=refund_amt,
        refund_eligible=refund_ok,
        original_cost=target_cost,
    )

    refund_str = f"${int(refund_amt)}" if refund_amt > 0 else "no"
    drop_candidate = {
        "id": uuid4(),
        "disruption_id": disruption.id,
        "trip_id": trip_id,
        "target_booking_id": broken_booking.id,
        "candidate_type": "drop",
        "title": f"Drop {broken_booking.title}",
        "description": (
            f"Cancel {broken_booking.title} entirely. Based on the stored cancellation policy, "
            f"you are eligible for a {refund_str} refund."
        ),
        "human_explanation": (
            f"Cancel the connection entirely and claim an instant ${int(refund_amt)} refund "
            f"under the stored policy terms."
            if refund_amt > 0
            else f"Drop {broken_booking.title} from the trip to proceed directly to subsequent bookings."
        ),
        "score": score_3,
        "cost_delta": drop_cost_delta,
        "time_delta_minutes": 0,
        "itinerary_altered_percent": altered_pct,
        "refund_amount": refund_amt,
        "refund_eligible": refund_ok,
        "scoring_breakdown": breakdown_3,
        "mutation_payload": {
            "action": "drop",
            "booking_id": str(broken_booking.id),
            "refund_amount": refund_amt,
        },
    }
    raw_list.append(drop_candidate)

    # Flag the highest-scored candidate as Recommended
    max_score = max(c["score"] for c in raw_list)
    for c in raw_list:
        c["is_recommended"] = c["score"] == max_score

    # Sort descending by score
    raw_list.sort(key=lambda x: x["score"], reverse=True)

    return raw_list

def enrich_with_groq_or_fallback(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Attempts Groq API call with strict narrow prompt; gracefully uses deterministic fallback if anything fails
    groq_api_key = os.environ.get("GROQ_API_KEY")
    if not groq_api_key:
        # Return candidates with their deterministic fallback sentences
        return candidates

    try:
        # Construct compact JSON prompt
        payload_options = [
            {
                "id": str(c["id"]),
                "type": c["candidate_type"],
                "cost_delta": c["cost_delta"],
                "time_delta_minutes": c["time_delta_minutes"],
                "refund_amount": c["refund_amount"],
                "score": c["score"],
                "title": c["title"],
            }
            for c in candidates
        ]

        system_prompt = (
            "You are a travel concierge. Given scored recovery options, generate exactly ONE "
            "spoken sentence per option explaining the choice in plain human terms. "
            "You MUST return a JSON dictionary mapping option 'id' to the sentence string. "
            "Do NOT rank options, do NOT change any numbers, and do NOT add options."
        )

        user_content = json.dumps({"options": payload_options})

        headers = {
            "Authorization": f"Bearer {groq_api_key}",
            "Content-Type": "application/json",
        }

        request_body = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.2,
            "max_tokens": 250,
            "response_format": {"type": "json_object"},
        }

        with httpx.Client(timeout=3.0) as client:
            resp = client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=request_body,
            )

        if resp.status_code == 200:
            result_json = resp.json()
            content = result_json["choices"][0]["message"]["content"]
            parsed_sentences = json.loads(content)

            for c in candidates:
                cid = str(c["id"])
                if cid in parsed_sentences and isinstance(parsed_sentences[cid], str):
                    c["human_explanation"] = parsed_sentences[cid].strip()
    except Exception as e:
        # Fallback path: never let a network hiccup or missing key block execution
        pass

    return candidates

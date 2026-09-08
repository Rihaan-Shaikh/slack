# Dependency auto suggestion heuristics
from typing import List, Set, Tuple
from app.models import Booking, Dependency, SuggestedDependency

def normalize_location(loc: str | None) -> str:
    if not loc:
        return ""
    return loc.lower().strip()

def locations_overlap(loc1: str | None, loc2: str | None) -> bool:
    if not loc1 or not loc2:
        return False
    l1 = normalize_location(loc1)
    l2 = normalize_location(loc2)
    # Check exact match or substring match
    if l1 == l2 or l1 in l2 or l2 in l1:
        return True
    # Word token intersection
    tokens1 = {w for w in l1.replace(",", " ").split() if len(w) > 2}
    tokens2 = {w for w in l2.replace(",", " ").split() if len(w) > 2}
    return len(tokens1.intersection(tokens2)) > 0

def calculate_recommended_buffer(from_type: str, to_type: str, actual_gap_minutes: float) -> int:
    # Flight to transfer/hotel: need baggage and customs time
    if from_type == "flight":
        base_buffer = 60
    # Transfer/hotel to flight: need check-in and security time
    elif to_type == "flight":
        base_buffer = 90
    # Transfer to hotel or activity
    elif from_type == "transfer":
        base_buffer = 15
    # Activity to activity or hotel
    elif from_type == "activity":
        base_buffer = 30
    else:
        base_buffer = 30

    # Ensure suggested buffer is sensible relative to actual gap
    if actual_gap_minutes > 0:
        return min(base_buffer, max(15, int(actual_gap_minutes)))
    return base_buffer

def suggest_dependencies_for_booking(
    target_booking: Booking,
    existing_bookings: List[Booking],
    existing_dependencies: List[Dependency],
) -> List[SuggestedDependency]:
    suggestions: List[SuggestedDependency] = []

    # Keep track of existing edges to avoid recommending duplicates
    existing_pairs: Set[Tuple[str, str]] = {
        (str(dep.from_booking_id), str(dep.to_booking_id))
        for dep in existing_dependencies
    }

    target_id = str(target_booking.id)

    for other in existing_bookings:
        other_id = str(other.id)
        if other_id == target_id:
            continue

        loc_match = locations_overlap(target_booking.location, other.location)

        # Scenario A: other booking ends before target booking starts (other -> target)
        gap_a = (target_booking.start_time - other.end_time).total_seconds() / 60.0
        # Check if temporally proximate (within 24 hours or overlapping up to 2 hours)
        if -120 <= gap_a <= 1440 and (other_id, target_id) not in existing_pairs:
            rec_buffer = calculate_recommended_buffer(other.type, target_booking.type, gap_a)
            reason_parts = [f"Temporal proximity ({int(gap_a)} min gap)"]
            if loc_match:
                reason_parts.append("location match")
            if other.type == "flight":
                reason_parts.append("airport arrival buffer")
            elif target_booking.type == "flight":
                reason_parts.append("airport departure buffer")

            suggestions.append(
                SuggestedDependency(
                    from_booking_id=other_id,
                    to_booking_id=target_id,
                    suggested_min_buffer_minutes=rec_buffer,
                    reason=", ".join(reason_parts),
                    dependency_type="temporal",
                )
            )

        # Scenario B: target booking ends before other booking starts (target -> other)
        gap_b = (other.start_time - target_booking.end_time).total_seconds() / 60.0
        if -120 <= gap_b <= 1440 and (target_id, other_id) not in existing_pairs:
            rec_buffer = calculate_recommended_buffer(target_booking.type, other.type, gap_b)
            reason_parts = [f"Temporal proximity ({int(gap_b)} min gap)"]
            if loc_match:
                reason_parts.append("location match")
            if target_booking.type == "flight":
                reason_parts.append("airport arrival buffer")
            elif other.type == "flight":
                reason_parts.append("airport departure buffer")

            suggestions.append(
                SuggestedDependency(
                    from_booking_id=target_id,
                    to_booking_id=other_id,
                    suggested_min_buffer_minutes=rec_buffer,
                    reason=", ".join(reason_parts),
                    dependency_type="temporal",
                )
            )

    # Sort suggestions: positive gaps that are smallest first, followed by others
    suggestions.sort(
        key=lambda s: abs((target_booking.start_time - target_booking.end_time).total_seconds())
    )
    return suggestions

# NetworkX graph construction and slack computation
from datetime import datetime
from typing import Dict, List, Tuple
import networkx as nx

from app.config import settings
from app.models import Booking, Dependency, EdgeStatus, GraphEdge, GraphNode, GraphResponse

def compute_slack_metrics(
    from_end_time: datetime,
    to_start_time: datetime,
    min_buffer_minutes: int,
    tight_threshold_minutes: int = settings.tight_threshold_minutes,
) -> Tuple[float, float, EdgeStatus]:
    # Calculate actual gap in minutes between the end of from-booking and start of to-booking
    gap_seconds = (to_start_time - from_end_time).total_seconds()
    actual_gap_minutes = round(gap_seconds / 60.0, 1)

    # Slack is the buffer remaining beyond the required minimum buffer
    slack_minutes = round(actual_gap_minutes - min_buffer_minutes, 1)

    if slack_minutes < 0:
        status: EdgeStatus = "violated"
    elif slack_minutes <= tight_threshold_minutes:
        status = "tight"
    else:
        status = "safe"

    return actual_gap_minutes, slack_minutes, status

def build_trip_graph(
    trip_id: str,
    trip_name: str,
    bookings: List[Booking],
    dependencies: List[Dependency],
) -> GraphResponse:
    # Construct a directed NetworkX graph
    g = nx.DiGraph()

    # Index bookings by id string for fast lookup
    booking_map: Dict[str, Booking] = {}
    nodes: List[GraphNode] = []

    for b in bookings:
        b_id_str = str(b.id)
        booking_map[b_id_str] = b
        g.add_node(
            b_id_str,
            type=b.type,
            title=b.title,
            start_time=b.start_time.isoformat(),
            end_time=b.end_time.isoformat(),
            location=b.location,
            vendor=b.vendor,
            cost=b.cost,
            cancellation_policy=b.cancellation_policy,
            metadata=b.metadata,
        )
        nodes.append(
            GraphNode(
                id=b_id_str,
                type=b.type,
                title=b.title,
                start_time=b.start_time.isoformat(),
                end_time=b.end_time.isoformat(),
                location=b.location,
                vendor=b.vendor,
                cost=b.cost,
                cancellation_policy=b.cancellation_policy,
                metadata=b.metadata,
            )
        )

    edges: List[GraphEdge] = []
    for dep in dependencies:
        from_id = str(dep.from_booking_id)
        to_id = str(dep.to_booking_id)

        from_booking = booking_map.get(from_id)
        to_booking = booking_map.get(to_id)

        if not from_booking or not to_booking:
            # Skip orphan dependency if booking is missing
            continue

        actual_gap, slack, status = compute_slack_metrics(
            from_end_time=from_booking.end_time,
            to_start_time=to_booking.start_time,
            min_buffer_minutes=dep.min_buffer_minutes,
        )

        # Store edge in NetworkX graph with attributes
        g.add_edge(
            from_id,
            to_id,
            dependency_id=str(dep.id),
            min_buffer_minutes=dep.min_buffer_minutes,
            actual_gap_minutes=actual_gap,
            slack_minutes=slack,
            status=status,
            dependency_type=dep.dependency_type,
        )

        edges.append(
            GraphEdge(
                id=str(dep.id),
                from_node=from_id,
                to_node=to_id,
                min_buffer_minutes=dep.min_buffer_minutes,
                actual_gap_minutes=actual_gap,
                slack_minutes=slack,
                status=status,
                dependency_type=dep.dependency_type,
            )
        )

    return GraphResponse(
        trip_id=trip_id,
        trip_name=trip_name,
        nodes=nodes,
        edges=edges,
    )

# Pure testable BFS ripple traversal and severity classification logic
from collections import deque
from datetime import datetime, timedelta
from typing import Dict, List, Set, Tuple
import networkx as nx

from app.graph import build_trip_graph, compute_slack_metrics
from app.models import (
    Booking,
    Dependency,
    Disruption,
    EdgeStatus,
    GraphResponse,
    NodeImpact,
    SeverityType,
)

def compute_effective_bookings(
    bookings: List[Booking],
    active_disruptions: List[Disruption],
) -> List[Booking]:
    # Group delays and cancellations by booking_id
    delay_map: Dict[str, int] = {}
    cancelled_ids: Set[str] = set()

    for d in active_disruptions:
        if d.resolved:
            continue
        bid = str(d.booking_id)
        if d.disruption_type == "delay":
            delay_map[bid] = delay_map.get(bid, 0) + d.delay_minutes
        elif d.disruption_type == "cancellation":
            cancelled_ids.add(bid)

    effective_bookings: List[Booking] = []
    for b in bookings:
        bid = str(b.id)
        if bid in cancelled_ids:
            # Cancellation: mark in metadata without destructive row deletion
            updated_meta = dict(b.metadata)
            updated_meta["is_cancelled"] = True
            effective_b = b.model_copy(
                update={"metadata": updated_meta}
            )
            effective_bookings.append(effective_b)
        elif bid in delay_map:
            # Delay: mutate effective end_time by adding delay_minutes
            delay_min = delay_map[bid]
            new_end = b.end_time + timedelta(minutes=delay_min)
            updated_meta = dict(b.metadata)
            updated_meta["effective_delay_minutes"] = delay_min
            effective_b = b.model_copy(
                update={
                    "end_time": new_end,
                    "metadata": updated_meta,
                }
            )
            effective_bookings.append(effective_b)
        else:
            effective_bookings.append(b)

    return effective_bookings

def bfs_ripple_traversal(
    nx_graph: nx.DiGraph,
    start_node_id: str,
) -> List[str]:
    # BFS traversal starting from the disrupted node, following outgoing edges
    if start_node_id not in nx_graph:
        return []

    visited: Set[str] = {start_node_id}
    queue: deque[str] = deque([start_node_id])
    ordered_ripple_path: List[str] = []

    while queue:
        current = queue.popleft()
        for successor in nx_graph.successors(current):
            if successor not in visited:
                visited.add(successor)
                ordered_ripple_path.append(successor)
                queue.append(successor)

    return ordered_ripple_path

def classify_node_severity(
    booking_title: str,
    preceding_title: str,
    prev_slack: float,
    new_slack: float,
    prev_status: EdgeStatus,
    new_status: EdgeStatus,
    min_buffer_minutes: int,
) -> Tuple[SeverityType, str]:
    # Strongly negative slack indicates a missed connection
    if new_slack < -15:
        severity: SeverityType = "missed"
        if new_slack < 0:
            deficit = abs(int(new_slack))
            explanation = (
                f"{booking_title} will now be missed. Connection required {min_buffer_minutes}m "
                f"buffer, but the schedule has slipped by {deficit}m past the limit "
                f"(slack dropped from {int(prev_slack)}m to {int(new_slack)}m)."
            )
        else:
            explanation = f"{booking_title} is critically delayed and will be missed."
    elif new_slack < 0 or (prev_status == "safe" and new_status == "tight") or (new_slack < prev_slack and new_status == "tight"):
        severity = "at_risk"
        explanation = (
            f"{booking_title} is at risk. Buffer has tightened to {int(new_slack)}m "
            f"beyond the required {min_buffer_minutes}m buffer (previously {int(prev_slack)}m slack)."
        )
    else:
        severity = "unaffected"
        explanation = (
            f"{booking_title} remains unaffected with {int(new_slack)}m of buffer buffer."
        )

    return severity, explanation

def compute_ripple_impact(
    trip_id: str,
    trip_name: str,
    disrupted_booking_id: str,
    original_bookings: List[Booking],
    dependencies: List[Dependency],
    active_disruptions: List[Disruption],
) -> Tuple[List[str], List[NodeImpact], GraphResponse]:
    # 1. Build original graph baseline to compare status and slack
    orig_graph_resp = build_trip_graph(trip_id, trip_name, original_bookings, dependencies)
    orig_edges_by_target: Dict[str, Tuple[EdgeStatus, float]] = {
        e.to_node: (e.status, e.slack_minutes) for e in orig_graph_resp.edges
    }

    # 2. Build NetworkX graph for topology traversal
    g = nx.DiGraph()
    for b in original_bookings:
        g.add_node(str(b.id))
    for dep in dependencies:
        g.add_edge(str(dep.from_booking_id), str(dep.to_booking_id))

    # 3. Perform BFS traversal starting from the disrupted booking
    ripple_path = bfs_ripple_traversal(g, disrupted_booking_id)

    # 4. Compute effective bookings under active disruptions
    effective_bookings = compute_effective_bookings(original_bookings, active_disruptions)

    # 5. Rebuild updated graph with derived timing
    updated_graph = build_trip_graph(trip_id, trip_name, effective_bookings, dependencies)
    updated_edges_by_target: Dict[str, Tuple[EdgeStatus, float, int, str]] = {
        e.to_node: (e.status, e.slack_minutes, e.min_buffer_minutes, e.from_node)
        for e in updated_graph.edges
    }

    booking_title_map: Dict[str, str] = {str(b.id): b.title for b in original_bookings}

    # 6. Classify severity for every node in the ripple path
    per_node_impact: List[NodeImpact] = []
    for node_id in ripple_path:
        b_title = booking_title_map.get(node_id, "Booking")

        if node_id in updated_edges_by_target:
            new_status, new_slack, min_buf, from_id = updated_edges_by_target[node_id]
            prev_status, prev_slack = orig_edges_by_target.get(node_id, (new_status, new_slack))
            from_title = booking_title_map.get(from_id, "Origin")

            severity, explanation = classify_node_severity(
                booking_title=b_title,
                preceding_title=from_title,
                prev_slack=prev_slack,
                new_slack=new_slack,
                prev_status=prev_status,
                new_status=new_status,
                min_buffer_minutes=min_buf,
            )

            per_node_impact.append(
                NodeImpact(
                    booking_id=node_id,
                    booking_title=b_title,
                    severity=severity,
                    previous_status=prev_status,
                    new_status=new_status,
                    previous_slack_minutes=prev_slack,
                    new_slack_minutes=new_slack,
                    human_explanation=explanation,
                )
            )
        else:
            # Node has no incoming edge in graph
            per_node_impact.append(
                NodeImpact(
                    booking_id=node_id,
                    booking_title=b_title,
                    severity="unaffected",
                    previous_status="safe",
                    new_status="safe",
                    previous_slack_minutes=0.0,
                    new_slack_minutes=0.0,
                    human_explanation=f"{b_title} has no incoming dependency constraint.",
                )
            )

    return ripple_path, per_node_impact, updated_graph

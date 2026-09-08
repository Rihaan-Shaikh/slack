# Data models for slack-api
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, ConfigDict

BookingType = Literal["flight", "hotel", "transfer", "activity"]
DependencyType = Literal["temporal", "location", "prerequisite"]
EdgeStatus = Literal["safe", "tight", "violated"]
DisruptionType = Literal["delay", "cancellation", "weather", "other"]
SeverityType = Literal["missed", "at_risk", "unaffected"]

# Trip models
class TripBase(BaseModel):
    name: str

class TripCreate(TripBase):
    owner_id: Optional[UUID] = None

class Trip(TripBase):
    id: UUID
    owner_id: Optional[UUID] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# Booking models
class BookingBase(BaseModel):
    type: BookingType
    title: str
    vendor: Optional[str] = None
    location: Optional[str] = None
    start_time: datetime
    end_time: datetime
    cost: Optional[float] = None
    cancellation_policy: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class BookingCreate(BookingBase):
    pass

class BookingUpdate(BaseModel):
    type: Optional[BookingType] = None
    title: Optional[str] = None
    vendor: Optional[str] = None
    location: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    cost: Optional[float] = None
    cancellation_policy: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class Booking(BookingBase):
    id: UUID
    trip_id: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# Dependency models
class DependencyBase(BaseModel):
    from_booking_id: UUID
    to_booking_id: UUID
    min_buffer_minutes: int = 0
    dependency_type: Optional[DependencyType] = "temporal"

class DependencyCreate(DependencyBase):
    pass

class DependencyUpdate(BaseModel):
    min_buffer_minutes: Optional[int] = None
    dependency_type: Optional[DependencyType] = None

class Dependency(DependencyBase):
    id: UUID
    trip_id: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# Graph representation models
class GraphNode(BaseModel):
    id: str
    type: BookingType
    title: str
    start_time: str
    end_time: str
    location: Optional[str] = None
    vendor: Optional[str] = None
    cost: Optional[float] = None
    cancellation_policy: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class GraphEdge(BaseModel):
    id: str
    from_node: str = Field(..., alias="from")
    to_node: str = Field(..., alias="to")
    min_buffer_minutes: int
    actual_gap_minutes: float
    slack_minutes: float
    status: EdgeStatus
    dependency_type: Optional[DependencyType] = "temporal"
    model_config = ConfigDict(populate_by_name=True)

class GraphResponse(BaseModel):
    trip_id: str
    trip_name: str
    nodes: List[GraphNode]
    edges: List[GraphEdge]

# Auto suggestion models
class SuggestedDependency(BaseModel):
    from_booking_id: str = Field(..., alias="from")
    to_booking_id: str = Field(..., alias="to")
    suggested_min_buffer_minutes: int
    reason: str
    dependency_type: DependencyType = "temporal"
    model_config = ConfigDict(populate_by_name=True)

class BookingWithSuggestions(BaseModel):
    booking: Booking
    suggested_dependencies: List[SuggestedDependency]

# Disruption models (Phase 2)
class DisruptionBase(BaseModel):
    booking_id: UUID
    disruption_type: DisruptionType
    delay_minutes: int = 0
    description: Optional[str] = None

class DisruptionCreate(DisruptionBase):
    pass

class Disruption(DisruptionBase):
    id: UUID
    trip_id: UUID
    triggered_at: datetime
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class NodeImpact(BaseModel):
    booking_id: str
    booking_title: str
    severity: SeverityType
    previous_status: EdgeStatus
    new_status: EdgeStatus
    previous_slack_minutes: float
    new_slack_minutes: float
    human_explanation: str

class RippleResponse(BaseModel):
    disruption_id: str
    disrupted_booking_id: str
    disruption_type: DisruptionType
    delay_minutes: int
    description: Optional[str] = None
    ripple_path: List[str]
    per_node_impact: List[NodeImpact]
    updated_graph: GraphResponse

class DisruptionResolveResponse(BaseModel):
    disruption_id: str
    resolved: bool
    reverted_graph: GraphResponse

# Phase 3: Recovery models
CandidateType = Literal["rebook", "shift", "drop"]

class ScoringBreakdown(BaseModel):
    cost_score: float
    cost_weight: float = 0.35
    time_score: float
    time_weight: float = 0.30
    itinerary_score: float
    itinerary_weight: float = 0.20
    refund_score: float
    refund_weight: float = 0.15
    raw_cost_delta: float
    raw_time_delta_minutes: int
    raw_altered_percent: float
    raw_refund_amount: float
    formula_explanation: str

class RecoveryCandidate(BaseModel):
    id: UUID
    disruption_id: UUID
    trip_id: UUID
    target_booking_id: UUID
    candidate_type: CandidateType
    title: str
    description: Optional[str] = None
    human_explanation: str
    score: int
    cost_delta: float
    time_delta_minutes: int
    itinerary_altered_percent: float
    refund_amount: float
    refund_eligible: bool
    is_recommended: bool = False
    scoring_breakdown: ScoringBreakdown
    mutation_payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class RecoveryOptionsResponse(BaseModel):
    disruption_id: str
    trip_id: str
    broken_booking_id: str
    broken_booking_title: str
    candidates: List[RecoveryCandidate]

class RecoveryApplyResponse(BaseModel):
    disruption_id: str
    applied_candidate_id: str
    candidate_type: CandidateType
    confirmation_message: str
    resolved: bool = True
    updated_graph: GraphResponse

# Phase 4: Resilience and Presence Models
class ThinConnection(BaseModel):
    from_booking_id: str
    from_booking_title: str
    to_booking_id: str
    to_booking_title: str
    min_buffer_minutes: int
    actual_gap_minutes: float
    slack_minutes: float
    status: EdgeStatus

class TripResilienceResponse(BaseModel):
    trip_id: str
    score: int  # 0 to 100
    grade: str  # "Robust", "Caution", "Critical"
    total_edges: int
    safe_edges: int
    tight_edges: int
    violated_edges: int
    thin_connections: List[ThinConnection]

class PresenceUser(BaseModel):
    client_id: str
    client_name: str
    avatar_color: str
    last_seen: Optional[datetime] = None

class TripPresenceResponse(BaseModel):
    trip_id: str
    active_users: List[PresenceUser]

# Phase 5: Multi-Traveler Collaboration Models
RoleType = Literal["owner", "editor", "viewer"]

class TripMemberBase(BaseModel):
    email: str
    name: str
    role: RoleType = "editor"

class TripMemberInviteRequest(TripMemberBase):
    pass

class TripMember(TripMemberBase):
    id: UUID
    trip_id: UUID
    user_id: Optional[UUID] = None
    invite_token: Optional[str] = None
    joined_at: datetime
    model_config = ConfigDict(from_attributes=True)

class TripMemberInviteResponse(BaseModel):
    member: TripMember
    invite_token: str
    invite_link: str

class AcceptInviteRequest(BaseModel):
    name: str
    email: str

class AcceptInviteResponse(BaseModel):
    trip_id: str
    trip_name: str
    member: TripMember
    role: RoleType

class ActivityFeedItem(BaseModel):
    id: UUID
    trip_id: UUID
    actor_name: str
    actor_email: Optional[str] = None
    action_type: str
    description: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ActivityFeedListResponse(BaseModel):
    trip_id: str
    activities: List[ActivityFeedItem]


// TypeScript definitions for Slack web client
// Strict typing: no any types allowed

export type BookingType = "flight" | "hotel" | "transfer" | "activity";
export type DependencyType = "temporal" | "location" | "prerequisite";
export type EdgeStatus = "safe" | "tight" | "violated";
export type DisruptionType = "delay" | "cancellation" | "weather" | "other";
export type SeverityType = "missed" | "at_risk" | "unaffected";

export interface Trip {
  id: string;
  name: string;
  owner_id?: string | null;
  created_at: string;
}

export interface BookingMetadata {
  flight_number?: string;
  terminal?: string;
  pickup?: string;
  dropoff?: string;
  room_type?: string;
  ticket_type?: string;
  notes?: string;
  effective_delay_minutes?: number;
  is_cancelled?: boolean;
  [key: string]: string | number | boolean | undefined;
}

export interface Booking {
  id: string;
  trip_id: string;
  type: BookingType;
  title: string;
  vendor?: string | null;
  location?: string | null;
  start_time: string;
  end_time: string;
  cost?: number | null;
  cancellation_policy?: string | null;
  metadata: BookingMetadata;
  created_at: string;
}

export interface BookingCreateInput {
  type: BookingType;
  title: string;
  vendor?: string;
  location?: string;
  start_time: string;
  end_time: string;
  cost?: number;
  cancellation_policy?: string;
  metadata: BookingMetadata;
}

export interface Dependency {
  id: string;
  trip_id: string;
  from_booking_id: string;
  to_booking_id: string;
  min_buffer_minutes: number;
  dependency_type: DependencyType;
  created_at: string;
}

export interface DependencyCreateInput {
  from_booking_id: string;
  to_booking_id: string;
  min_buffer_minutes: number;
  dependency_type: DependencyType;
}

export interface GraphNode {
  id: string;
  type: BookingType;
  title: string;
  start_time: string;
  end_time: string;
  location?: string | null;
  vendor?: string | null;
  cost?: number | null;
  cancellation_policy?: string | null;
  metadata: BookingMetadata;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  min_buffer_minutes: number;
  actual_gap_minutes: number;
  slack_minutes: number;
  status: EdgeStatus;
  dependency_type?: DependencyType;
}

export interface GraphResponse {
  trip_id: string;
  trip_name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SuggestedDependency {
  from: string;
  to: string;
  suggested_min_buffer_minutes: number;
  reason: string;
  dependency_type: DependencyType;
}

export interface BookingCreateResponse {
  booking: Booking;
  suggested_dependencies: SuggestedDependency[];
}

// Phase 2: Disruption & Ripple Impact definitions
export interface Disruption {
  id: string;
  trip_id: string;
  booking_id: string;
  disruption_type: DisruptionType;
  delay_minutes: number;
  description?: string | null;
  triggered_at: string;
  resolved: boolean;
  resolved_at?: string | null;
}

export interface DisruptionCreateInput {
  booking_id: string;
  disruption_type: DisruptionType;
  delay_minutes: number;
  description?: string;
}

export interface NodeImpact {
  booking_id: string;
  booking_title: string;
  severity: SeverityType;
  previous_status: EdgeStatus;
  new_status: EdgeStatus;
  previous_slack_minutes: float;
  new_slack_minutes: float;
  human_explanation: string;
}

// Float alias for TypeScript clarity
type float = number;

export interface RippleResponse {
  disruption_id: string;
  disrupted_booking_id: string;
  disruption_type: DisruptionType;
  delay_minutes: number;
  description?: string | null;
  ripple_path: string[];
  per_node_impact: NodeImpact[];
  updated_graph: GraphResponse;
}

export interface DisruptionResolveResponse {
  disruption_id: string;
  resolved: boolean;
  reverted_graph: GraphResponse;
}

// Phase 3: Ranked Recovery definitions
export type CandidateType = "rebook" | "shift" | "drop";

export interface ScoringBreakdown {
  cost_score: number;
  time_score: number;
  itinerary_score: number;
  refund_score: number;
  raw_weighted_sum: number;
  final_score: number;
  weights: {
    cost: number;
    time: number;
    itinerary: number;
    refund: number;
  };
  formula_explanation: string;
}

export interface RecoveryCandidate {
  id: string;
  disruption_id: string;
  trip_id: string;
  target_booking_id: string;
  candidate_type: CandidateType;
  title: string;
  description?: string | null;
  human_explanation: string;
  score: number;
  cost_delta: number;
  time_delta_minutes: number;
  itinerary_altered_percent: number;
  refund_amount: number;
  refund_eligible: boolean;
  is_recommended: boolean;
  scoring_breakdown: ScoringBreakdown;
  mutation_payload: Record<string, unknown>;
  created_at: string;
}

export interface RecoveryOptionsResponse {
  disruption_id: string;
  trip_id: string;
  broken_booking_id: string;
  broken_booking_title: string;
  candidates: RecoveryCandidate[];
}

export interface RecoveryApplyResponse {
  candidate_id?: string;
  applied_candidate_id?: string;
  disruption_id: string;
  candidate_type: CandidateType;
  confirmation_message: string;
  toast_message?: string;
  resolved?: boolean;
  updated_graph: GraphResponse;
  applied_mutation?: Record<string, unknown>;
}

// Phase 4: Resilience and Presence Types
export interface ThinConnection {
  from_booking_id: string;
  from_booking_title: string;
  to_booking_id: string;
  to_booking_title: string;
  min_buffer_minutes: number;
  actual_gap_minutes: number;
  slack_minutes: number;
  status: EdgeStatus;
}

export interface TripResilienceResponse {
  trip_id: string;
  score: number; // 0 to 100
  grade: "Robust" | "Caution" | "Critical" | string;
  total_edges: number;
  safe_edges: number;
  tight_edges: number;
  violated_edges: number;
  thin_connections: ThinConnection[];
}

export interface PresenceUser {
  client_id: string;
  client_name: string;
  avatar_color: string;
  last_seen?: string | null;
}

export interface TripPresenceResponse {
  trip_id: string;
  active_users: PresenceUser[];
}

export interface RealtimeEvent {
  type: string;
  trip_id?: string;
  payload?: {
    booking_id?: string;
    title?: string;
    type?: string;
    disruption_id?: string;
    candidate_id?: string;
    target_booking_id?: string;
    active_users?: PresenceUser[];
    member_id?: string;
    name?: string;
    role?: string;
    actor_name?: string;
    action_type?: string;
    description?: string;
    [key: string]: unknown;
  };
  timestamp?: string;
}

// Phase 5: Multi-Traveler Collaboration Types
export type RoleType = "owner" | "editor" | "viewer";

export interface TripMember {
  id: string;
  trip_id: string;
  user_id?: string | null;
  email: string;
  name: string;
  role: RoleType;
  invite_token?: string | null;
  joined_at: string;
}

export interface TripMemberInviteResponse {
  member: TripMember;
  invite_token: string;
  invite_link: string;
}

export interface AcceptInviteResponse {
  trip_id: string;
  trip_name: string;
  member: TripMember;
  role: RoleType;
}

export interface ActivityFeedItem {
  id: string;
  trip_id: string;
  actor_name: string;
  actor_email?: string | null;
  action_type: string;
  description: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ActivityFeedListResponse {
  trip_id: string;
  activities: ActivityFeedItem[];
}

// Phase 6: Demo Mode & Weather Types
export interface SampleDisruptionPayload {
  booking_id: string;
  booking_title: string;
  disruption_type: DisruptionType;
  delay_minutes: number;
  description: string;
  expected_impact: string;
}

export interface DemoSeedResponse {
  trip: Trip;
  bookings: Booking[];
  dependencies: Dependency[];
  resilience: TripResilienceResponse;
  sample_disruption: SampleDisruptionPayload;
  tight_booking_id: string;
  overlapping_pair: string[];
}

export interface StressTestResponse {
  trip: Trip;
  bookings_count: number;
  dependencies_count: number;
}

export interface AirportWeather {
  airport: string;
  airport_name: string;
  city: string;
  weather_description: string;
  severity: "normal" | "minor" | "delay" | "severe" | string;
  temperature_c: number;
  wind_speed_kmh: number;
  wind_gusts_kmh: number;
  precipitation_mm: number;
  suggested_delay_minutes: number;
  live_source: string;
}


// Phase 1: Real Identity & Access
export interface AuthUser {
  user_id: string;
  email: string;
  display_name: string;
}

export interface AuthResponse {
  access_token: string;
  user_id: string;
  email: string;
  display_name: string;
}

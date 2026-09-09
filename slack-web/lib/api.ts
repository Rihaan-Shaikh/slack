// API client for slack-api service
import {
  Booking,
  BookingCreateInput,
  BookingCreateResponse,
  Dependency,
  DependencyCreateInput,
  Disruption,
  DisruptionCreateInput,
  DisruptionResolveResponse,
  GraphResponse,
  RippleResponse,
  SuggestedDependency,
  Trip,
  RecoveryOptionsResponse,
  RecoveryApplyResponse,
  PresenceUser,
  TripPresenceResponse,
  TripResilienceResponse,
  TripMember,
  TripMemberInviteResponse,
  AcceptInviteResponse,
  ActivityFeedItem,
  ActivityFeedListResponse,
  DemoSeedResponse,
  StressTestResponse,
  AirportWeather,
  AuthResponse,
  AuthUser,
  RoleType,
} from "./types";
import { getAuthHeaders, setAuth, clearAuth } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      // Phase 1: Real auth — reads JWT from localStorage, not fake X-User-* headers
      ...getAuthHeaders(),
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `API error (${res.status})`;
    try {
      const errData = (await res.json()) as { detail?: string };
      if (errData.detail) {
        message = errData.detail;
      }
    } catch {
      // Ignore JSON parse error on non-json error responses
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return (await res.json()) as T;
}

// Phase 1: Auth API functions
export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail || "Login failed");
  }
  const data = (await res.json()) as AuthResponse;
  setAuth(data);
  return data;
}

export async function signupUser(
  email: string,
  password: string,
  display_name: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail || "Sign up failed");
  }
  const data = (await res.json()) as AuthResponse;
  setAuth(data);
  return data;
}

export async function logoutUser(): Promise<void> {
  clearAuth();
}

export async function getMe(): Promise<AuthUser> {
  return fetchJson<AuthUser>(`${API_BASE}/auth/me`);
}

export async function createTrip(name: string): Promise<Trip> {
  return fetchJson<Trip>(`${API_BASE}/trips`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function listTrips(): Promise<Trip[]> {
  return fetchJson<Trip[]>(`${API_BASE}/trips`);
}

export async function getTrip(tripId: string): Promise<Trip> {
  return fetchJson<Trip>(`${API_BASE}/trips/${tripId}`);
}

export async function updateTrip(tripId: string, name: string): Promise<Trip> {
  return fetchJson<Trip>(`${API_BASE}/trips/${tripId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteTrip(tripId: string): Promise<void> {
  await fetchJson<void>(`${API_BASE}/trips/${tripId}`, {
    method: "DELETE",
  });
}

export async function getTripGraph(tripId: string): Promise<GraphResponse> {
  return fetchJson<GraphResponse>(`${API_BASE}/trips/${tripId}/graph`);
}

export async function addBooking(
  tripId: string,
  booking: BookingCreateInput
): Promise<BookingCreateResponse> {
  return fetchJson<BookingCreateResponse>(`${API_BASE}/trips/${tripId}/bookings`, {
    method: "POST",
    body: JSON.stringify(booking),
  });
}

export async function updateBooking(
  bookingId: string,
  booking: Partial<BookingCreateInput>
): Promise<Booking> {
  return fetchJson<Booking>(`${API_BASE}/bookings/${bookingId}`, {
    method: "PUT",
    body: JSON.stringify(booking),
  });
}

export async function deleteBooking(bookingId: string): Promise<void> {
  await fetchJson<void>(`${API_BASE}/bookings/${bookingId}`, {
    method: "DELETE",
  });
}

export async function createDependency(
  tripId: string,
  dependency: DependencyCreateInput
): Promise<Dependency> {
  return fetchJson<Dependency>(`${API_BASE}/trips/${tripId}/dependencies`, {
    method: "POST",
    body: JSON.stringify(dependency),
  });
}

export async function updateDependency(
  dependencyId: string,
  update: Partial<DependencyCreateInput>
): Promise<Dependency> {
  return fetchJson<Dependency>(`${API_BASE}/dependencies/${dependencyId}`, {
    method: "PUT",
    body: JSON.stringify(update),
  });
}

export async function deleteDependency(dependencyId: string): Promise<void> {
  await fetchJson<void>(`${API_BASE}/dependencies/${dependencyId}`, {
    method: "DELETE",
  });
}

export async function getTripSuggestions(tripId: string): Promise<SuggestedDependency[]> {
  return fetchJson<SuggestedDependency[]>(`${API_BASE}/trips/${tripId}/suggestions`);
}

// Phase 2: Disruption API methods
export async function triggerDisruption(
  tripId: string,
  disruption: DisruptionCreateInput
): Promise<RippleResponse> {
  return fetchJson<RippleResponse>(`${API_BASE}/trips/${tripId}/disruptions`, {
    method: "POST",
    body: JSON.stringify(disruption),
  });
}

export async function listActiveDisruptions(tripId: string): Promise<Disruption[]> {
  return fetchJson<Disruption[]>(`${API_BASE}/trips/${tripId}/disruptions`);
}

export async function resolveDisruption(
  disruptionId: string
): Promise<DisruptionResolveResponse> {
  return fetchJson<DisruptionResolveResponse>(`${API_BASE}/disruptions/${disruptionId}/resolve`, {
    method: "POST",
  });
}

// Phase 3: Recovery Options API
export async function getRecoveryOptions(
  tripId: string,
  disruptionId: string
): Promise<RecoveryOptionsResponse> {
  return fetchJson<RecoveryOptionsResponse>(
    `${API_BASE}/trips/${tripId}/disruptions/${disruptionId}/recovery-options`,
    {
      method: "POST",
    }
  );
}

export async function applyRecoveryOption(
  candidateId: string
): Promise<RecoveryApplyResponse> {
  return fetchJson<RecoveryApplyResponse>(
    `${API_BASE}/recovery-options/${candidateId}/apply`,
    {
      method: "POST",
    }
  );
}

// Phase 4: Resilience and Presence API
export async function getTripResilience(tripId: string): Promise<TripResilienceResponse> {
  return fetchJson<TripResilienceResponse>(`${API_BASE}/trips/${tripId}/resilience`);
}

export async function sendPresenceHeartbeat(
  tripId: string,
  user: PresenceUser
): Promise<TripPresenceResponse> {
  return fetchJson<TripPresenceResponse>(`${API_BASE}/trips/${tripId}/presence`, {
    method: "POST",
    body: JSON.stringify(user),
  });
}

export async function getTripPresence(tripId: string): Promise<TripPresenceResponse> {
  return fetchJson<TripPresenceResponse>(`${API_BASE}/trips/${tripId}/presence`);
}

// Phase 5: Multi-Traveler Collaboration API methods
export async function inviteTripMember(
  tripId: string,
  input: { email: string; name: string; role: RoleType }
): Promise<TripMemberInviteResponse> {
  return fetchJson<TripMemberInviteResponse>(`${API_BASE}/trips/${tripId}/members/invite`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listTripMembers(tripId: string): Promise<TripMember[]> {
  return fetchJson<TripMember[]>(`${API_BASE}/trips/${tripId}/members`);
}

export async function removeTripMember(tripId: string, memberId: string): Promise<void> {
  await fetchJson<void>(`${API_BASE}/trips/${tripId}/members/${memberId}`, {
    method: "DELETE",
  });
}

export async function previewTripInvite(
  inviteToken: string
): Promise<{ trip_id: string; trip_name: string; role: RoleType; email: string; name: string }> {
  return fetchJson<{ trip_id: string; trip_name: string; role: RoleType; email: string; name: string }>(
    `${API_BASE}/invites/${inviteToken}`
  );
}

export async function acceptTripInvite(
  inviteToken: string,
  input: { name: string; email: string }
): Promise<AcceptInviteResponse> {
  return fetchJson<AcceptInviteResponse>(`${API_BASE}/invites/${inviteToken}/accept`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getTripActivity(tripId: string, limit: number = 50): Promise<ActivityFeedListResponse> {
  return fetchJson<ActivityFeedListResponse>(`${API_BASE}/trips/${tripId}/activity?limit=${limit}`);
}

// Phase 6: Demo Mode & Weather API methods
export async function seedDemoTrip(reuse: boolean = true): Promise<DemoSeedResponse> {
  return fetchJson<DemoSeedResponse>(`${API_BASE}/demo/seed?reuse=${reuse}`, {
    method: "POST",
  });
}

export async function seedStressTrip(): Promise<StressTestResponse> {
  return fetchJson<StressTestResponse>(`${API_BASE}/demo/seed-stress`, {
    method: "POST",
  });
}

export async function triggerSampleDisruption(
  tripId: string,
  delayMinutes: number = 60,
  description?: string
): Promise<RippleResponse> {
  return fetchJson<RippleResponse>(`${API_BASE}/demo/sample-disruption`, {
    method: "POST",
    body: JSON.stringify({
      trip_id: tripId,
      delay_minutes: delayMinutes,
      description,
    }),
  });
}

export async function fetchAirportWeather(): Promise<AirportWeather[]> {
  return fetchJson<AirportWeather[]>(`${API_BASE}/weather/airports`);
}

export async function triggerLiveWeatherDisruption(
  tripId: string,
  airportCode: string = "ZRH",
  bookingId?: string
): Promise<RippleResponse> {
  return fetchJson<RippleResponse>(`${API_BASE}/trips/${tripId}/disruptions/live-weather`, {
    method: "POST",
    body: JSON.stringify({
      airport_code: airportCode,
      booking_id: bookingId,
    }),
  });
}


export async function listResolvedDisruptions(tripId: string): Promise<Disruption[]> {
  const response = await fetch(\\/trips/\/disruptions/resolved\, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to fetch resolved disruptions");
  }
  return response.json();
}

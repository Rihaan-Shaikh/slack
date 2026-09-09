// Phase 1: Real Identity & Access — auth token storage utilities
// JWT is stored in localStorage and sent as Authorization: Bearer <token>.
// NOTE: In a same-origin deployment (API proxied through Next.js rewrites),
// this would be an httpOnly cookie set by the server. For the current
// cross-origin dev setup (frontend :3000, API :8000), localStorage + Bearer
// is the pragmatic approach. See slack-api/app/auth.py for the server side.

import type { AuthUser, AuthResponse } from "./types";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export function setAuth(response: AuthResponse): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, response.access_token);
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      user_id: response.user_id,
      email: response.email,
      display_name: response.display_name,
    } satisfies AuthUser)
  );
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

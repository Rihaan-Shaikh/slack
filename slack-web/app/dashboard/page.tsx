"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Compass,
  Plus,
  ArrowRight,
  Settings,
  Trash2,
  AlertTriangle,
  CheckCircle,
  LogOut,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { Trip, TripResilienceResponse, AuthUser } from "@/lib/types";
import {
  listTrips,
  getTripResilience,
  createTrip,
  deleteTrip,
  seedDemoTrip,
  logoutUser,
} from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import { ResilienceRing } from "@/components/ResilienceRing";
import { TripCreateModal } from "@/components/TripCreateModal";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [resilienceMap, setResilienceMap] = useState<Record<string, TripResilienceResponse>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "success") => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => {
        // Prevent duplicate identical toasts within 1500ms
        if (prev.some((t) => t.message === message)) return prev;
        return [...prev, { id, message, type }];
      });
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const loadDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      const fetchedTrips = await listTrips();
      setTrips(fetchedTrips);

      if (fetchedTrips.length > 0) {
        const results = await Promise.all(
          fetchedTrips.map((t) =>
            getTripResilience(t.id)
              .then((res) => ({ id: t.id, res }))
              .catch(() => null)
          )
        );

        const newMap: Record<string, TripResilienceResponse> = {};
        results.forEach((item) => {
          if (item) newMap[item.id] = item.res;
        });
        setResilienceMap(newMap);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to load dashboard data", "error");
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    const user = getAuthUser();
    if (user) setCurrentUser(user);
    loadDashboardData();
  }, [loadDashboardData]);

  const handleLogout = async () => {
    await logoutUser();
    router.push("/login");
  };

  const handleCreateTrip = async (name: string) => {
    try {
      const newTrip = await createTrip(name);
      addToast(`Created trip "${newTrip.name}"`, "success");
      await loadDashboardData();
      router.push(`/trips/${newTrip.id}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to create trip", "error");
    }
  };

  const handleLoadDemoTrip = async () => {
    try {
      setIsDemoLoading(true);
      // Calls seedDemoTrip with reuse=true: reuses existing demo trip or sequences clearly
      const res = await seedDemoTrip(true);
      addToast(`Loaded Demo Trip: ${res.trip.name}`, "success");
      await loadDashboardData();
      router.push(`/trips/${res.trip.id}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to load demo trip", "error");
    } finally {
      setIsDemoLoading(false);
    }
  };

  const handleDeleteTrip = async (e: React.MouseEvent, tripId: string, tripName: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete "${tripName}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteTrip(tripId);
      addToast(`Deleted trip "${tripName}"`, "info");
      await loadDashboardData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to delete trip", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Dashboard Top Header */}
      <header className="border-b border-[var(--border)] bg-[var(--card)] px-6 py-3.5 sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center border border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]">
                <Compass className="h-5 w-5" />
              </div>
              <span className="font-serif-heading text-xl font-bold tracking-tight text-[var(--foreground)]">
                Slack
              </span>
            </Link>
            <div className="h-4 w-px bg-[var(--border)] hidden sm:block" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] hidden sm:inline">
              Dashboard
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLoadDemoTrip}
              disabled={isDemoLoading}
              className="flex items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 transition-colors"
              title="Load or reuse the standard Alpine Odyssey scenario"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#885434]" />
              <span>{isDemoLoading ? "Loading..." : "Load Demo Trip"}</span>
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 border border-[var(--foreground)] bg-[var(--foreground)] px-3.5 py-1.5 text-xs font-semibold text-[var(--background)] hover:bg-[#38332B] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Trip</span>
            </button>

            {currentUser && (
              <div className="flex items-center gap-2 border-l border-[var(--border)] pl-3 ml-1">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-[var(--foreground)] leading-tight">
                    {currentUser.display_name}
                  </div>
                  <div className="text-[10px] text-[#8E887D] leading-tight">
                    {currentUser.email}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  className="flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--card)] p-1.5 text-[var(--muted-foreground)] hover:bg-[#FEE2E2] hover:text-[#991B1B] hover:border-[#FCA5A5] transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Page Title & Stats Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-6 mb-8">
          <div>
            <h1 className="font-serif-heading text-2xl sm:text-3xl font-bold text-[var(--foreground)]">
              Trip Health & Resilience Dashboard
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[var(--muted-foreground)]">
              Proactive connection risk monitoring and graph workspace access across your itineraries.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)]">
            <div>
              Total Trips: <strong className="text-[var(--foreground)]">{trips.length}</strong>
            </div>
          </div>
        </div>

        {/* Content Section */}
        {isLoading ? (
          <div className="py-20 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--foreground)] border-t-transparent mb-3" />
            <p className="text-xs text-[var(--muted-foreground)]">Analyzing resilience metrics across your trips...</p>
          </div>
        ) : trips.length === 0 ? (
          /* Empty State */
          <div className="border border-[var(--border-strong)] bg-[var(--card)] p-12 text-center max-w-xl mx-auto shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--background)] border border-[var(--foreground)] text-[var(--foreground)] mb-4">
              <Compass className="h-7 w-7" />
            </div>
            <h2 className="font-serif-heading text-xl font-bold text-[var(--foreground)]">
              No trips recorded yet
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-[var(--muted-foreground)] max-w-md mx-auto leading-relaxed">
              Start by seeding the complete, realistic Alpine Odyssey demo trip or create your own
              custom itinerary from scratch.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleLoadDemoTrip}
                disabled={isDemoLoading}
                className="flex items-center gap-2 border border-[var(--foreground)] bg-[var(--foreground)] px-4 py-2.5 text-xs font-semibold text-[var(--background)] hover:bg-[#38332B] transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#FCD34D]" />
                <span>{isDemoLoading ? "Seeding..." : "Load Demo Trip (Alpine Odyssey)"}</span>
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 border border-[var(--border-strong)] bg-[var(--card)] px-4 py-2.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Custom Trip</span>
              </button>
            </div>
          </div>
        ) : (
          /* Trips Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trips.map((trip) => {
              const res = resilienceMap[trip.id];
              const thinConns = res?.thin_connections || [];
              const hasThinLayover = thinConns.length > 0;

              return (
                <div
                  key={trip.id}
                  onClick={() => router.push(`/trips/${trip.id}`)}
                  className="group relative flex flex-col justify-between border border-[var(--border-strong)] bg-[var(--card)] p-5 shadow-xs transition-all hover:border-[var(--foreground)] hover:shadow-md cursor-pointer"
                >
                  <div>
                    {/* Header Row: Title & Resilience */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-serif-heading text-lg font-bold text-[var(--foreground)] group-hover:text-[#2B5B84] transition-colors line-clamp-2">
                          {trip.name}
                        </h2>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-[#8E887D]">
                          <Clock className="h-3 w-3" />
                          <span>Created {new Date(trip.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {/* Resilience Ring */}
                      {res ? (
                        <div className="flex flex-col items-end shrink-0">
                          <ResilienceRing
                            score={res.score}
                            grade={res.grade}
                            size="md"
                            showLabel={true}
                          />
                          <span className="mt-1 text-[9.5px] font-semibold text-[#8E887D]">
                            Resilience
                          </span>
                        </div>
                      ) : (
                        <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--muted)]" />
                      )}
                    </div>

                    {/* Thin Connection Warning Badge */}
                    {hasThinLayover && (
                      <div className="mt-4 border border-[#FCD34D] bg-[#FFFBEB] p-2.5 text-xs text-[#92400E]">
                        <div className="flex items-center gap-1.5 font-bold text-[#78350F]">
                          <AlertTriangle className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                          <span>
                            {thinConns[0].status === "violated"
                              ? "Critical Layover Violation"
                              : "Thin Layover Buffer Caught"}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#92400E] mt-1">
                          {thinConns[0].from_booking_title} → {thinConns[0].to_booking_title} (
                          {Math.round(thinConns[0].actual_gap_minutes)}m gap,{" "}
                          {Math.round(thinConns[0].slack_minutes)}m slack)
                        </div>
                      </div>
                    )}

                    {!hasThinLayover && res && (
                      <div className="mt-4 flex items-center gap-1.5 border border-[#A7F3D0] bg-[#ECFDF5] px-2.5 py-1.5 text-[11px] text-[#065F46]">
                        <CheckCircle className="h-3.5 w-3.5 text-[#059669] shrink-0" />
                        <span>All connection edges verified with safe buffer</span>
                      </div>
                    )}
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="mt-6 pt-4 border-t border-[var(--border)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/trips/${trip.id}/settings`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 border border-[var(--border-strong)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                        title="Trip Settings"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Link>

                      <button
                        onClick={(e) => handleDeleteTrip(e, trip.id, trip.name)}
                        className="p-1.5 border border-[var(--border-strong)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[#991B1B] hover:bg-[#FEE2E2] hover:border-[#FCA5A5] transition-colors"
                        title="Delete Trip"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-semibold text-[var(--foreground)] group-hover:translate-x-0.5 transition-transform">
                      <span>Open Workspace</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Trip Create Modal */}
      <TripCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateTrip={handleCreateTrip}
      />

      {/* Toasts Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 border px-4 py-2.5 text-xs shadow-lg max-w-sm ${
              toast.type === "error"
                ? "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B]"
                : toast.type === "info"
                ? "border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1]"
                : "border-[#86EFAC] bg-[#DCFCE7] text-[#15803D]"
            }`}
          >
            <span>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="font-bold opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

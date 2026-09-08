"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Compass, Plus, Sparkles } from "lucide-react";
import {
  BookingCreateInput,
  DependencyCreateInput,
  Disruption,
  DisruptionCreateInput,
  GraphEdge,
  GraphNode,
  RippleResponse,
  SuggestedDependency,
  Trip,
  TripResilienceResponse,
  PresenceUser,
  RoleType,
} from "@/lib/types";
import {
  addBooking,
  createDependency,
  createTrip,
  deleteBooking,
  deleteDependency,
  getTripGraph,
  listActiveDisruptions,
  listTrips,
  resolveDisruption,
  triggerDisruption,
  updateBooking,
  applyRecoveryOption,
  getTripResilience,
  sendPresenceHeartbeat,
  setCurrentUserSession,
  previewTripInvite,
  acceptTripInvite,
  seedDemoTrip,
  seedStressTrip,
  triggerSampleDisruption,
} from "@/lib/api";
import { TripHeader } from "@/components/TripHeader";
import { DemoControlBar } from "@/components/DemoControlBar";
import { GraphView } from "@/components/GraphView";
import { ListView } from "@/components/ListView";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import { BookingModal } from "@/components/BookingModal";
import { DependencyModal } from "@/components/DependencyModal";
import { TripCreateModal } from "@/components/TripCreateModal";
import { SuggestedDependenciesBanner } from "@/components/SuggestedDependenciesBanner";
import { GraphSkeleton } from "@/components/GraphSkeleton";
import { EmptyTripState } from "@/components/EmptyTripState";
import { ToastContainer, ToastMessage } from "@/components/ToastNotification";
import { TriggerDisruptionModal } from "@/components/TriggerDisruptionModal";
import { ImpactSummaryPanel } from "@/components/ImpactSummaryPanel";
import { TripDashboardModal } from "@/components/TripDashboardModal";
import { ShareModal } from "@/components/ShareModal";
import { ActivityFeedDrawer } from "@/components/ActivityFeedDrawer";

export default function Home() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [suggestedDependencies, setSuggestedDependencies] = useState<SuggestedDependency[]>([]);

  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [editingNode, setEditingNode] = useState<GraphNode | null>(null);

  // Modal open states
  const [isTripCreateOpen, setIsTripCreateOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isDependencyModalOpen, setIsDependencyModalOpen] = useState(false);
  const [depOriginNodeId, setDepOriginNodeId] = useState<string | null>(null);

  // Disruption and Ripple states
  const [activeDisruptions, setActiveDisruptions] = useState<Disruption[]>([]);
  const [isDisruptionModalOpen, setIsDisruptionModalOpen] = useState(false);
  const [isImpactPanelOpen, setIsImpactPanelOpen] = useState(false);
  const [latestRippleResponse, setLatestRippleResponse] = useState<RippleResponse | null>(null);
  const [isReverseRippling, setIsReverseRippling] = useState(false);
  const [reverseStepIndex, setReverseStepIndex] = useState(-1);

  // Phase 4: Resilience, Presence, and Realtime sync states
  const [resilience, setResilience] = useState<TripResilienceResponse | null>(null);
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const [pulsingNodeId, setPulsingNodeId] = useState<string | null>(null);
  const [isAtRiskFilterActive, setIsAtRiskFilterActive] = useState<boolean>(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState<boolean>(false);

  // Phase 5: Multi-Traveler Collaboration states
  const [currentRole, setCurrentRole] = useState<RoleType>("owner");
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isActivityDrawerOpen, setIsActivityDrawerOpen] = useState(false);
  const [latestEventTimestamp, setLatestEventTimestamp] = useState<string>("");

  const handleRoleChange = (role: RoleType) => {
    setCurrentRole(role);
    const name =
      role === "owner"
        ? "Aisha (Owner)"
        : role === "editor"
        ? "Charlie (Editor)"
        : "Bob (Viewer)";
    const email =
      role === "owner"
        ? "aisha@slacktravel.demo"
        : role === "editor"
        ? "charlie@editor.com"
        : "bob@viewer.com";
    setCurrentUserSession(name, email, role);
    clientNameRef.current = name;
    addToast(`Switched active traveler: ${name} [${role.toUpperCase()}]`, "info");
  };

  // Unique collaborator identity for presence (stable across session)
  const clientIdRef = useRef<string>("");
  const clientNameRef = useRef<string>("");
  const avatarColorRef = useRef<string>("");

  useEffect(() => {
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const colors = ["#2B5B84", "#885434", "#2D6A4F", "#6D3A6D", "#B45309", "#047857"];
    const chosenColor = colors[Math.floor(Math.random() * colors.length)];
    const chosenName = "Aisha (Owner)";

    clientIdRef.current = `client_${Date.now()}_${randomSuffix}`;
    clientNameRef.current = chosenName;
    avatarColorRef.current = chosenColor;
    setCurrentUserSession("Aisha (Owner)", "aisha@slacktravel.demo", "owner");
  }, []);

  // Handle invite link from URL query param (?invite=<token>)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const inviteToken = url.searchParams.get("invite");
    if (inviteToken) {
      previewTripInvite(inviteToken)
        .then(async (preview) => {
          if (preview.trip_id) {
            await acceptTripInvite(inviteToken, {
              name: preview.name || "Invited Traveler",
              email: preview.email || "traveler@example.com",
            });
            handleRoleChange(preview.role);
            addToast(
              `Joined '${preview.trip_name}' as ${preview.role.toUpperCase()}!`,
              "success"
            );
            const allTrips = await listTrips();
            setTrips(allTrips);
            const found = allTrips.find((t) => t.id === preview.trip_id);
            if (found) setCurrentTrip(found);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Fit to screen callback ref
  const fitGraphRef = useRef<(() => void) | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (
    message: string,
    type: "success" | "info" | "warning" | "error" = "success"
  ) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load trips list
  const loadTrips = useCallback(async () => {
    try {
      setIsLoading(true);
      const fetchedTrips = await listTrips();
      setTrips(fetchedTrips);
      if (fetchedTrips.length > 0) {
        setCurrentTrip((prev) => {
          if (prev && fetchedTrips.some((t) => t.id === prev.id)) {
            return prev;
          }
          return fetchedTrips[0];
        });
      } else {
        setCurrentTrip(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trips");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load resilience score and thin connections
  const loadResilience = useCallback(async (tripId: string) => {
    try {
      const res = await getTripResilience(tripId);
      setResilience(res);
    } catch {
      // ignore
    }
  }, []);

  // Silent graph re-render for incoming realtime broadcasts (no skeleton flicker or zoom reset)
  const loadGraphSilent = useCallback(async (tripId: string) => {
    try {
      const [graphData, disruptions, res] = await Promise.all([
        getTripGraph(tripId),
        listActiveDisruptions(tripId).catch(() => []),
        getTripResilience(tripId).catch(() => null),
      ]);
      setNodes(graphData.nodes);
      setEdges(graphData.edges);
      setActiveDisruptions(disruptions);
      if (res) setResilience(res);
      setSelectedNode((prev) => {
        if (!prev) return null;
        return graphData.nodes.find((n) => n.id === prev.id) || null;
      });
    } catch {
      // ignore
    }
  }, []);

  // Load graph and active disruptions for selected trip
  const loadGraph = useCallback(async (tripId: string) => {
    try {
      setIsLoadingGraph(true);
      const [graphData, disruptions, res] = await Promise.all([
        getTripGraph(tripId),
        listActiveDisruptions(tripId).catch(() => []),
        getTripResilience(tripId).catch(() => null),
      ]);
      setNodes(graphData.nodes);
      setEdges(graphData.edges);
      setActiveDisruptions(disruptions);
      if (res) setResilience(res);
      if (disruptions.length === 0) {
        setLatestRippleResponse(null);
      }
      setSelectedNode((prev) => {
        if (!prev) return null;
        return graphData.nodes.find((n) => n.id === prev.id) || null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trip graph");
    } finally {
      setIsLoadingGraph(false);
    }
  }, []);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  useEffect(() => {
    if (currentTrip) {
      loadGraph(currentTrip.id);
      loadResilience(currentTrip.id);
    } else {
      setNodes([]);
      setEdges([]);
      setSelectedNode(null);
      setActiveDisruptions([]);
      setLatestRippleResponse(null);
      setResilience(null);
      setActiveUsers([]);
    }
  }, [currentTrip, loadGraph, loadResilience]);

  // Phase 4: Realtime Event Stream (SSE) & Presence Heartbeat Hook
  useEffect(() => {
    if (!currentTrip) return;

    const tripId = currentTrip.id;

    // Presence heartbeat
    const sendHeartbeat = () => {
      if (!clientIdRef.current) return;
      sendPresenceHeartbeat(tripId, {
        client_id: clientIdRef.current,
        client_name: clientNameRef.current,
        avatar_color: avatarColorRef.current,
      })
        .then((resp) => {
          if (resp?.active_users) setActiveUsers(resp.active_users);
        })
        .catch(() => {});
    };

    sendHeartbeat();
    const heartbeatTimer = setInterval(sendHeartbeat, 10000);

    // Realtime Server-Sent Events stream
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const sseUrl = `${apiBase}/trips/${tripId}/events`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "CONNECTED") return;

        if (data.type === "PRESENCE_UPDATED" && data.payload?.active_users) {
          setActiveUsers(data.payload.active_users);
          return;
        }

        if (
          data.type === "ACTIVITY_LOGGED" ||
          data.type === "MEMBER_INVITED" ||
          data.type === "MEMBER_JOINED" ||
          data.type === "MEMBER_REMOVED"
        ) {
          setLatestEventTimestamp(Date.now().toString());
        }

        // Silent re-render for incoming mutation: refresh graph data with NO TOAST
        loadGraphSilent(tripId);

        // Highlight affected node with subtle visual pulse ring
        const affectedNodeId =
          data.payload?.booking_id ||
          data.payload?.target_booking_id ||
          null;

        if (affectedNodeId) {
          setPulsingNodeId(affectedNodeId);
          setTimeout(() => {
            setPulsingNodeId((curr) => (curr === affectedNodeId ? null : curr));
          }, 2500);
        }
      } catch {
        // ignore parse error
      }
    };

    return () => {
      clearInterval(heartbeatTimer);
      eventSource.close();
    };
  }, [currentTrip, loadGraphSilent]);

  // Trip operations
  const handleCreateTrip = async (name: string) => {
    const newTrip = await createTrip(name);
    setTrips((prev) => [newTrip, ...prev]);
    setCurrentTrip(newTrip);
    addToast(`Created trip: ${newTrip.name}`);
  };

  const handleSelectTrip = (tripId: string) => {
    const found = trips.find((t) => t.id === tripId);
    if (found) {
      setCurrentTrip(found);
      setSelectedNode(null);
      setSuggestedDependencies([]);
      setLatestRippleResponse(null);
    }
  };

  // Disruption operations
  const handleTriggerDisruption = async (input: DisruptionCreateInput) => {
    if (!currentTrip) return;
    try {
      const response = await triggerDisruption(currentTrip.id, input);
      setLatestRippleResponse(response);
      const newDisruption: Disruption = {
        id: response.disruption_id,
        trip_id: currentTrip.id,
        booking_id: response.disrupted_booking_id,
        disruption_type: response.disruption_type,
        delay_minutes: response.delay_minutes,
        description: response.description,
        triggered_at: new Date().toISOString(),
        resolved: false,
      };
      setActiveDisruptions((prev) => [
        newDisruption,
        ...prev.filter((d) => d.id !== response.disruption_id),
      ]);

      // Apply recomputed graph directly from response
      if (response.updated_graph) {
        setNodes(response.updated_graph.nodes);
        setEdges(response.updated_graph.edges);
      } else {
        const graphData = await getTripGraph(currentTrip.id);
        setNodes(graphData.nodes);
        setEdges(graphData.edges);
      }

      // Open impact summary panel immediately
      setIsImpactPanelOpen(true);

      const typeLabel =
        input.disruption_type === "delay"
          ? `+${input.delay_minutes}m delay`
          : input.disruption_type;
      addToast(`Disruption triggered (${typeLabel}). Ripple wave computed.`, "info");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to trigger disruption");
    }
  };

  const handleResolveDisruption = async (disruptionId: string) => {
    if (!currentTrip) return;
    try {
      // Reversal animation: step ripple backwards before clearing
      if (latestRippleResponse && latestRippleResponse.ripple_path.length > 0) {
        for (let i = latestRippleResponse.ripple_path.length - 1; i >= 0; i--) {
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
      }

      const res = await resolveDisruption(disruptionId);
      setNodes(res.reverted_graph.nodes);
      setEdges(res.reverted_graph.edges);
      setActiveDisruptions((prev) => prev.filter((d) => d.id !== disruptionId));
      setLatestRippleResponse(null);
      setIsImpactPanelOpen(false);
      addToast("Disruption resolved. Graph reverted cleanly to baseline schedule.", "success");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resolve disruption");
    }
  };

  // Phase 3: Apply Ranked Recovery Option with Staggered Reverse Ripple
  const handleApplyRecovery = async (candidateId: string) => {
    if (!currentTrip) return;
    try {
      const res = await applyRecoveryOption(candidateId);

      // Replay reverse ripple with staggered timing (280ms per step, matching Phase 2 forward ripple)
      const reversePath = latestRippleResponse?.ripple_path
        ? [...latestRippleResponse.ripple_path].reverse()
        : [];

      if (reversePath.length > 0) {
        setIsReverseRippling(true);
        for (let i = 0; i < reversePath.length; i++) {
          setReverseStepIndex(i);
          await new Promise((resolve) => setTimeout(resolve, 280));
        }
        setIsReverseRippling(false);
        setReverseStepIndex(-1);
      }

      // In the SAME render tick: update nodes, edges, active disruptions, clear ripple response
      setNodes(res.updated_graph.nodes);
      setEdges(res.updated_graph.edges);
      setActiveDisruptions((prev) => prev.filter((d) => d.id !== res.disruption_id));
      setLatestRippleResponse(null);
      setIsImpactPanelOpen(false);

      // Toast confirms connection restoration with slack
      addToast(res.confirmation_message || res.toast_message || "Recovery option applied.", "success");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to apply recovery option");
      throw err;
    }
  };

  // Booking operations
  const handleSaveBooking = async (input: BookingCreateInput) => {
    if (!currentTrip) return;

    if (editingNode) {
      await updateBooking(editingNode.id, input);
      setEditingNode(null);
      await loadGraph(currentTrip.id);
      addToast(`Updated booking: ${input.title}`);
    } else {
      const res = await addBooking(currentTrip.id, input);
      if (res.suggested_dependencies && res.suggested_dependencies.length > 0) {
        setSuggestedDependencies((prev) => [...prev, ...res.suggested_dependencies]);
        addToast(
          `Added booking "${input.title}". Found ${res.suggested_dependencies.length} auto-suggestion(s).`
        );
      } else {
        addToast(`Added booking: ${input.title}`);
      }
      await loadGraph(currentTrip.id);
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    if (!currentTrip) return;
    const target = nodes.find((n) => n.id === bookingId);
    await deleteBooking(bookingId);
    if (selectedNode?.id === bookingId) {
      setSelectedNode(null);
    }
    await loadGraph(currentTrip.id);
    addToast(`Deleted booking: ${target?.title || "Booking"}`);
  };

  // Dependency operations
  const handleCreateDependency = async (input: DependencyCreateInput) => {
    if (!currentTrip) return;
    await createDependency(currentTrip.id, input);
    await loadGraph(currentTrip.id);
    addToast(`Added dependency edge (min buffer: ${input.min_buffer_minutes}m)`);
  };

  const handleDeleteDependency = async (depId: string) => {
    if (!currentTrip) return;
    await deleteDependency(depId);
    await loadGraph(currentTrip.id);
    addToast("Removed dependency edge", "info");
  };

  // Suggestion accept / reject
  const handleAcceptSuggestion = async (sugg: SuggestedDependency) => {
    if (!currentTrip) return;
    try {
      await createDependency(currentTrip.id, {
        from_booking_id: sugg.from,
        to_booking_id: sugg.to,
        min_buffer_minutes: sugg.suggested_min_buffer_minutes,
        dependency_type: sugg.dependency_type || "temporal",
      });
      setSuggestedDependencies((prev) =>
        prev.filter((s) => !(s.from === sugg.from && s.to === sugg.to))
      );
      await loadGraph(currentTrip.id);
      addToast(`Accepted dependency edge (+${sugg.suggested_min_buffer_minutes}m buffer)`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to accept dependency");
    }
  };

  const handleRejectSuggestion = (sugg: SuggestedDependency) => {
    setSuggestedDependencies((prev) =>
      prev.filter((s) => !(s.from === sugg.from && s.to === sugg.to))
    );
    addToast("Dismissed suggested dependency", "info");
  };

  // Seed demo itinerary for testing verification scenario
  // Phase 6: Seed demo itinerary (Alpine Odyssey: 7 bookings, 1 tight layover +15m, 1 overlapping pair)
  const handleSeedDemoTrip = async () => {
    try {
      setIsLoadingGraph(true);
      const res = await seedDemoTrip();
      setTrips((prev) => [res.trip, ...prev.filter((t) => t.id !== res.trip.id)]);
      setCurrentTrip(res.trip);
      await loadGraph(res.trip.id);
      setResilience(res.resilience);
      setActiveDisruptions([]);
      setLatestRippleResponse(null);
      addToast(
        "Loaded Demo Trip: Alpine Odyssey (7 bookings, 1 tight connection +15m, 1 overlapping pair)",
        "success"
      );
      setTimeout(() => {
        fitGraphRef.current?.();
      }, 200);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to seed demo trip");
    } finally {
      setIsLoadingGraph(false);
    }
  };

  // Phase 6: Guided 1-Click Trigger Sample Disruption (Flight LX 354 +60m delay)
  const handleTriggerSampleDisruption = async () => {
    try {
      let trip = currentTrip;
      // If current trip is not Alpine Odyssey, auto-seed it first so judge sees the pitch scenario
      if (!trip || !trip.name.includes("Alpine Odyssey")) {
        const demoRes = await seedDemoTrip();
        setTrips((prev) => [demoRes.trip, ...prev.filter((t) => t.id !== demoRes.trip.id)]);
        setCurrentTrip(demoRes.trip);
        trip = demoRes.trip;
        await loadGraph(demoRes.trip.id);
      }

      setIsLoadingGraph(true);
      const response = await triggerSampleDisruption(
        trip.id,
        60,
        "Air traffic flow restriction & thunderstorm holding pattern at Zurich (ZRH)"
      );

      setLatestRippleResponse(response);
      const newDisruption: Disruption = {
        id: response.disruption_id,
        trip_id: trip.id,
        booking_id: response.disrupted_booking_id,
        disruption_type: response.disruption_type,
        delay_minutes: response.delay_minutes,
        description: response.description,
        triggered_at: new Date().toISOString(),
        resolved: false,
      };
      setActiveDisruptions([newDisruption]);

      // Apply recomputed graph directly from response
      if (response.updated_graph) {
        setNodes(response.updated_graph.nodes);
        setEdges(response.updated_graph.edges);
      } else {
        const graphData = await getTripGraph(trip.id);
        setNodes(graphData.nodes);
        setEdges(graphData.edges);
      }

      // Re-fetch resilience score to reflect dropped state
      try {
        const resData = await getTripResilience(trip.id);
        setResilience(resData);
      } catch {
        // fallback
      }

      // Open impact summary panel immediately
      setIsImpactPanelOpen(true);
      addToast(
        "Flight LX 354 delayed +60m. Shuttle connection violated (-45m slack). Resilience score dropped to Critical.",
        "warning"
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to trigger sample disruption");
    } finally {
      setIsLoadingGraph(false);
    }
  };

  // Phase 6: Seed 16-Booking Stress Test Trip across 5 days
  const handleSeedStressTrip = async () => {
    try {
      setIsLoadingGraph(true);
      const res = await seedStressTrip();
      setTrips((prev) => [res.trip, ...prev.filter((t) => t.id !== res.trip.id)]);
      setCurrentTrip(res.trip);
      await loadGraph(res.trip.id);
      addToast(
        `Loaded 16-Booking Stress Test: ${res.trip.name} (5 days, ${res.dependencies_count} connections)`,
        "success"
      );
      setTimeout(() => {
        fitGraphRef.current?.();
      }, 300);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to seed stress test trip");
    } finally {
      setIsLoadingGraph(false);
    }
  };

  const violatedEdges = edges.filter((e) => e.status === "violated");
  const tightEdges = edges.filter((e) => e.status === "tight");

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF7F2]">
      {/* Top Header */}
      <TripHeader
        currentTrip={currentTrip}
        trips={trips}
        onSelectTrip={handleSelectTrip}
        onOpenCreateTrip={() => setIsTripCreateOpen(true)}
        onOpenAddBooking={() => {
          setEditingNode(null);
          setIsBookingModalOpen(true);
        }}
        onOpenAddDependency={() => {
          setDepOriginNodeId(null);
          setIsDependencyModalOpen(true);
        }}
        onOpenTriggerDisruption={() => setIsDisruptionModalOpen(true)}
        activeDisruptionsCount={activeDisruptions.length}
        onOpenImpactPanel={() => setIsImpactPanelOpen(true)}
        onFitToScreen={() => fitGraphRef.current?.()}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        totalBookings={nodes.length}
        violatedCount={violatedEdges.length}
        tightCount={tightEdges.length}
        resilience={resilience}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        activeUsers={activeUsers}
        currentClientId={clientIdRef.current}
        showAtRiskOnly={isAtRiskFilterActive}
        onToggleAtRiskOnly={() => setIsAtRiskFilterActive((prev) => !prev)}
        currentRole={currentRole}
        onChangeRole={handleRoleChange}
        onOpenShare={() => setIsShareModalOpen(true)}
        onOpenActivity={() => setIsActivityDrawerOpen(true)}
      />

      {/* Phase 6: Judge Demo Pitch Bar */}
      <DemoControlBar
        currentTrip={currentTrip}
        resilience={resilience}
        activeDisruptionsCount={activeDisruptions.length}
        onLoadDemoTrip={handleSeedDemoTrip}
        onTriggerSampleDisruption={handleTriggerSampleDisruption}
        onLoadStressTrip={handleSeedStressTrip}
        onOpenLiveWeather={() => setIsDisruptionModalOpen(true)}
        isLoading={isLoadingGraph}
      />

      {/* Stable Auto-Suggestions Panel/Banner directly above graph */}
      <SuggestedDependenciesBanner
        suggestions={suggestedDependencies}
        nodes={nodes}
        onAccept={handleAcceptSuggestion}
        onReject={handleRejectSuggestion}
      />

      {/* Main Workspace */}
      <main className="relative flex-1">
        {/* Error message banner */}
        {error && (
          <div className="mx-6 my-2 border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-2 text-xs text-[#991B1B] flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold underline ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* Global Empty State: No Trips exist yet */}
        {!currentTrip && !isLoading ? (
          <div className="mx-auto flex max-w-lg flex-col items-center justify-center pt-24 pb-16 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center border border-[#221F1A] bg-[#221F1A] text-[#FAF7F2] mb-4">
              <Compass className="h-6 w-6" />
            </div>
            <h1 className="font-serif-heading text-3xl font-bold tracking-tight text-[#221F1A]">
              Slack
            </h1>
            <p className="mt-2 text-sm text-[#6E685D] max-w-sm">
              A trip is not a list of bookings, it is a dependency graph where buffer time is edge slack.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
              <button
                onClick={() => setIsTripCreateOpen(true)}
                className="w-full flex items-center justify-center gap-2 border border-[#221F1A] bg-[#221F1A] px-4 py-2 text-xs font-medium text-[#FAF7F2] hover:bg-[#38332B]"
              >
                <Plus className="h-4 w-4" />
                <span>Create New Trip</span>
              </button>
              <button
                onClick={handleSeedDemoTrip}
                className="w-full flex items-center justify-center gap-2 border border-[#CEC4B5] bg-[#FFFFFF] px-4 py-2 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2]"
              >
                <Sparkles className="h-4 w-4 text-[#D97706]" />
                <span>Seed Demo Trip</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="h-[calc(100vh-69px)] w-full">
            {/* Loading State: Lightweight Graph Skeleton */}
            {isLoadingGraph ? (
              <GraphSkeleton />
            ) : nodes.length === 0 ? (
              /* Empty Trip State: Inviting notebook placeholder */
              <EmptyTripState
                tripName={currentTrip?.name || "Trip"}
                onAddBooking={() => {
                  setEditingNode(null);
                  setIsBookingModalOpen(true);
                }}
                onSeedDemo={handleSeedDemoTrip}
              />
            ) : viewMode === "graph" ? (
              /* Time-Anchored D3 SVG Graph */
              <GraphView
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNode?.id || null}
                onSelectNode={(node) => setSelectedNode(node)}
                suggestedDependencies={suggestedDependencies}
                disruptedBookingId={
                  latestRippleResponse?.disrupted_booking_id ||
                  (activeDisruptions[0]?.booking_id || null)
                }
                ripplePath={latestRippleResponse?.ripple_path || []}
                perNodeImpact={latestRippleResponse?.per_node_impact || []}
                onFitToScreenRef={(fn) => {
                  fitGraphRef.current = fn;
                }}
                isReverseRippling={isReverseRippling}
                reverseStepIndex={reverseStepIndex}
                pulsingNodeId={pulsingNodeId}
                showAtRiskOnly={isAtRiskFilterActive}
              />
            ) : (
              /* Chronological List View */
              <div className="h-full overflow-y-auto">
                <ListView
                  nodes={nodes}
                  edges={edges}
                  onSelectNode={(node) => setSelectedNode(node)}
                  onEditNode={(node) => {
                    setEditingNode(node);
                    setIsBookingModalOpen(true);
                  }}
                  onDeleteNode={handleDeleteBooking}
                />
              </div>
            )}

            {/* Restructured Node Detail Slide-in Panel */}
            <NodeDetailPanel
              node={selectedNode}
              allNodes={nodes}
              edges={edges}
              onClose={() => setSelectedNode(null)}
              onEdit={(node) => {
                setEditingNode(node);
                setIsBookingModalOpen(true);
              }}
              onDelete={handleDeleteBooking}
              onAddDependencyFrom={(fromId) => {
                setDepOriginNodeId(fromId);
                setIsDependencyModalOpen(true);
              }}
              onDeleteDependency={handleDeleteDependency}
            />

            {/* Disruption Impact Summary & Ranked Recovery Slide-in Panel */}
            <ImpactSummaryPanel
              isOpen={isImpactPanelOpen}
              onClose={() => setIsImpactPanelOpen(false)}
              tripId={currentTrip?.id || ""}
              disruption={latestRippleResponse || (activeDisruptions[0] || null)}
              impacts={latestRippleResponse?.per_node_impact || []}
              disruptedBookingTitle={
                nodes.find(
                  (n) =>
                    n.id ===
                    (latestRippleResponse?.disrupted_booking_id ||
                      activeDisruptions[0]?.booking_id)
                )?.title || "Disrupted Booking"
              }
              onResolve={handleResolveDisruption}
              onApplyRecovery={handleApplyRecovery}
            />
          </div>
        )}
      </main>

      {/* Modals */}
      <TripCreateModal
        isOpen={isTripCreateOpen}
        onClose={() => setIsTripCreateOpen(false)}
        onCreateTrip={handleCreateTrip}
      />

      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => {
          setIsBookingModalOpen(false);
          setEditingNode(null);
        }}
        onSubmit={handleSaveBooking}
        editingNode={editingNode}
      />

      <DependencyModal
        isOpen={isDependencyModalOpen}
        onClose={() => {
          setIsDependencyModalOpen(false);
          setDepOriginNodeId(null);
        }}
        onSubmit={handleCreateDependency}
        nodes={nodes}
        initialFromNodeId={depOriginNodeId}
      />

      {/* Disruption Trigger Modal */}
      <TriggerDisruptionModal
        isOpen={isDisruptionModalOpen}
        onClose={() => setIsDisruptionModalOpen(false)}
        onSubmit={handleTriggerDisruption}
        nodes={nodes}
      />

      {/* Phase 4 & 6: Trip Resilience Dashboard Modal */}
      <TripDashboardModal
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        trips={trips}
        currentTripId={currentTrip?.id || null}
        onSelectTrip={handleSelectTrip}
        onOpenCreateTrip={() => setIsTripCreateOpen(true)}
        onSeedDemoTrip={handleSeedDemoTrip}
        onSeedStressTrip={handleSeedStressTrip}
      />

      {/* Phase 5: Share Itinerary & Manage Members Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        trip={currentTrip}
        onMemberUpdated={() => setLatestEventTimestamp(Date.now().toString())}
      />

      {/* Phase 5: Reverse-Chronological Activity Feed Drawer */}
      <ActivityFeedDrawer
        isOpen={isActivityDrawerOpen}
        onClose={() => setIsActivityDrawerOpen(false)}
        trip={currentTrip}
        latestEventTimestamp={latestEventTimestamp}
      />

      {/* Auto-Dismissing Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

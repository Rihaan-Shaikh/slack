"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
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
  AuthUser,
} from "@/lib/types";
import {
  addBooking,
  createDependency,
  createTrip,
  deleteBooking,
  deleteDependency,
  getTrip,
  getTripGraph,
  listActiveDisruptions,
  listTrips,
  resolveDisruption,
  triggerDisruption,
  updateBooking,
  applyRecoveryOption,
  getTripResilience,
  sendPresenceHeartbeat,
  previewTripInvite,
  acceptTripInvite,
  seedDemoTrip,
  seedStressTrip,
  triggerSampleDisruption,
  logoutUser,
} from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import { TripHeader } from "@/components/TripHeader";
import { DemoControlBar } from "@/components/DemoControlBar";
import { GraphView } from "@/components/GraphView";
import { ListView } from "@/components/ListView";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import { BookingModal } from "@/components/BookingModal";
import { DependencyModal } from "@/components/DependencyModal";
import { TripCreateModal } from "@/components/TripCreateModal";
import { GraphSkeleton } from "@/components/GraphSkeleton";
import { EmptyTripState } from "@/components/EmptyTripState";
import { ToastContainer, ToastMessage } from "@/components/ToastNotification";
import { TriggerDisruptionModal } from "@/components/TriggerDisruptionModal";
import { ImpactSummaryPanel } from "@/components/ImpactSummaryPanel";
import { ShareModal } from "@/components/ShareModal";
import { ActivityFeedDrawer } from "@/components/ActivityFeedDrawer";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function TripWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const tripIdParam = Array.isArray(params?.tripId) ? params.tripId[0] : (params?.tripId as string);

  // App & Trip State
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

  // Phase 5: Multi-Traveler Collaboration states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isActivityDrawerOpen, setIsActivityDrawerOpen] = useState(false);
  const [latestEventTimestamp, setLatestEventTimestamp] = useState<string>("");

  // Phase 1: Real Auth Identity
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const isViewer = false;

  // Phase 2: Pitch mode (hidden by default)
  const [isPitchMode, setIsPitchMode] = useState(false);

  // Unique collaborator identity for presence (stable across session)
  const clientIdRef = useRef<string>("");
  const clientNameRef = useRef<string>("");
  const avatarColorRef = useRef<string>("");

  // Fit to screen callback ref
  const fitGraphRef = useRef<(() => void) | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toast notifications with deduplication
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const lastToastRef = useRef<{ msg: string; time: number }>({ msg: "", time: 0 });

  const addToast = useCallback(
    (message: string, type: "success" | "info" | "warning" | "error" = "success") => {
      const now = Date.now();
      if (lastToastRef.current.msg === message && now - lastToastRef.current.time < 1500) {
        return;
      }
      lastToastRef.current = { msg: message, time: now };

      const id = `${now}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    router.push("/login");
  };

  // Setup user and presence identities
  useEffect(() => {
    const user = getAuthUser();
    if (user) {
      setCurrentUser(user);
      clientNameRef.current = user.display_name;
    }
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const colors = ["#2B5B84", "#885434", "#2D6A4F", "#6D3A6D", "#B45309", "#047857"];
    const chosenColor = colors[Math.floor(Math.random() * colors.length)];
    clientIdRef.current = `client_${Date.now()}_${randomSuffix}`;
    avatarColorRef.current = chosenColor;
  }, []);

  // Handle URL invite acceptance
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
            addToast(`Joined '${preview.trip_name}' as ${preview.role.toUpperCase()}!`, "success");
            router.replace(`/trips/${preview.trip_id}`);
          }
        })
        .catch(() => {});
    }
  }, [addToast, router]);

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

  // Silent re-render for incoming realtime events
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
      // background silent update
    }
  }, []);

  // Initial Trip Loading
  useEffect(() => {
    if (!tripIdParam) return;

    let isMounted = true;
    setIsLoading(true);

    Promise.all([listTrips(), getTrip(tripIdParam)])
      .then(([allTrips, trip]) => {
        if (!isMounted) return;
        setTrips(allTrips);
        setCurrentTrip(trip);
        setIsLoading(false);
        loadGraph(trip.id);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Trip not found");
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [tripIdParam, loadGraph]);

  // Realtime Presence Heartbeat & Server-Sent Events stream
  useEffect(() => {
    if (!currentTrip) return;
    const tripId = currentTrip.id;

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

        const affectedNodeId =
          data.payload?.booking_id || data.payload?.target_booking_id || null;

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

  // Trip selection switcher
  const handleSelectTrip = (targetTripId: string) => {
    router.push(`/trips/${targetTripId}`);
  };

  const handleCreateTrip = async (name: string) => {
    try {
      const newTrip = await createTrip(name);
      addToast(`Created trip: ${newTrip.name}`, "success");
      router.push(`/trips/${newTrip.id}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to create trip", "error");
    }
  };

  // Disruption Handlers
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

      // Apply recomputed graph directly from response if present, or reload
      if (response.updated_graph) {
        setNodes(response.updated_graph.nodes);
        setEdges(response.updated_graph.edges);
      } else {
        await loadGraph(currentTrip.id);
      }

      const typeLabel = response.disruption_type.toUpperCase();
      addToast(`Disruption triggered (${typeLabel}). Ripple wave computed.`, "info");
      setIsImpactPanelOpen(true);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to trigger disruption", "error");
    }
  };

  const handleResolveDisruption = async (disruptionId: string) => {
    if (!currentTrip) return;
    try {
      const res = await resolveDisruption(disruptionId);
      setActiveDisruptions((prev) => prev.filter((d) => d.id !== disruptionId));
      if (res.reverted_graph) {
        setNodes(res.reverted_graph.nodes);
        setEdges(res.reverted_graph.edges);
      } else {
        await loadGraph(currentTrip.id);
      }
      setLatestRippleResponse(null);
      setIsImpactPanelOpen(false);
      addToast("Disruption resolved. Graph reverted cleanly to baseline schedule.", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to resolve disruption", "error");
    }
  };

  const handleApplyRecovery = async (candidateId: string) => {
    try {
      const res = await applyRecoveryOption(candidateId);
      if (currentTrip) {
        await loadGraph(currentTrip.id);
      }
      setLatestRippleResponse(null);
      setIsImpactPanelOpen(false);
      addToast(res.confirmation_message || "Recovery option applied.", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to apply recovery option", "error");
    }
  };

  // Booking operations
  const handleSaveBooking = async (input: BookingCreateInput) => {
    if (!currentTrip) return;
    try {
      if (editingNode) {
        await updateBooking(editingNode.id, input);
        setEditingNode(null);
        await loadGraph(currentTrip.id);
        addToast(`Updated booking: ${input.title}`, "success");
      } else {
        const res = await addBooking(currentTrip.id, input);
        if (res.suggested_dependencies && res.suggested_dependencies.length > 0) {
          setSuggestedDependencies((prev) => [...prev, ...res.suggested_dependencies]);
          addToast(
            `Added booking "${input.title}". Found ${res.suggested_dependencies.length} auto-suggestion(s).`,
            "info"
          );
        } else {
          addToast(`Added booking: ${input.title}`, "success");
        }
        await loadGraph(currentTrip.id);
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save booking", "error");
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    if (!currentTrip) return;
    const target = nodes.find((n) => n.id === bookingId);
    try {
      await deleteBooking(bookingId);
      if (selectedNode?.id === bookingId) {
        setSelectedNode(null);
      }
      await loadGraph(currentTrip.id);
      addToast(`Deleted booking: ${target?.title || "Booking"}`, "info");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to delete booking", "error");
    }
  };

  // Dependency operations
  const handleAddDependency = async (input: DependencyCreateInput) => {
    if (!currentTrip) return;
    try {
      await createDependency(currentTrip.id, input);
      await loadGraph(currentTrip.id);
      addToast(`Added dependency edge (min buffer: ${input.min_buffer_minutes}m)`, "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to add dependency", "error");
    }
  };

  const handleDeleteEdge = async (edgeId: string) => {
    try {
      await deleteDependency(edgeId);
      if (currentTrip) {
        await loadGraph(currentTrip.id);
      }
      addToast("Removed dependency edge", "info");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to remove dependency", "error");
    }
  };

  // Auto-suggestion acceptance
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
      addToast(`Accepted dependency edge (+${sugg.suggested_min_buffer_minutes}m buffer)`, "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to accept dependency", "error");
    }
  };

  const handleRejectSuggestion = (sugg: SuggestedDependency) => {
    setSuggestedDependencies((prev) =>
      prev.filter((s) => !(s.from === sugg.from && s.to === sugg.to))
    );
    addToast("Dismissed suggested dependency", "info");
  };

  // Demo Pitch Actions
  const handleSeedDemoTrip = async () => {
    try {
      setIsLoadingGraph(true);
      const res = await seedDemoTrip(false); // create fresh sequentially numbered demo trip
      setTrips((prev) => [res.trip, ...prev.filter((t) => t.id !== res.trip.id)]);
      setCurrentTrip(res.trip);
      await loadGraph(res.trip.id);
      addToast(`Loaded Demo Trip: ${res.trip.name}`, "success");
      router.push(`/trips/${res.trip.id}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to seed demo trip", "error");
    } finally {
      setIsLoadingGraph(false);
    }
  };

  const handleTriggerSampleDisruption = async () => {
    try {
      if (!currentTrip) return;
      setIsLoadingGraph(true);
      const ripple = await triggerSampleDisruption(
        currentTrip.id,
        60,
        "Thunderstorm ground stop at Zurich (ZRH) +60m"
      );
      setLatestRippleResponse(ripple);
      await loadGraph(currentTrip.id);
      addToast("Disruption simulated: Swiss Flight LX 354 delayed +60m.", "warning");
      setIsImpactPanelOpen(true);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to trigger sample disruption", "error");
    } finally {
      setIsLoadingGraph(false);
    }
  };

  const handleSeedStressTrip = async () => {
    try {
      setIsLoadingGraph(true);
      const res = await seedStressTrip();
      setTrips((prev) => [res.trip, ...prev.filter((t) => t.id !== res.trip.id)]);
      setCurrentTrip(res.trip);
      await loadGraph(res.trip.id);
      addToast("Loaded 16-Booking Stress Test: Grand European Tour", "success");
      router.push(`/trips/${res.trip.id}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to seed stress test trip", "error");
    } finally {
      setIsLoadingGraph(false);
    }
  };

  const violatedCount = edges.filter((e) => e.status === "violated").length;
  const tightCount = edges.filter((e) => e.status === "tight").length;

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col bg-[#FAF7F2]">
        <div className="h-14 border-b border-[#E5DFD5] bg-[#FFFFFF] px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-serif-heading font-bold">Slack</span>
          </div>
        </div>
        <div className="flex-1 p-6">
          <GraphSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#FAF7F2] font-sans antialiased">
      {/* Streamlined Primary Header */}
      <TripHeader
        currentTrip={currentTrip}
        trips={trips}
        onSelectTrip={handleSelectTrip}
        onOpenCreateTrip={() => setIsTripCreateOpen(true)}
        onOpenAddBooking={() => {
          setEditingNode(null);
          setIsBookingModalOpen(true);
        }}
        onOpenAddDependency={() => setIsDependencyModalOpen(true)}
        onOpenTriggerDisruption={() => setIsDisruptionModalOpen(true)}
        activeDisruptionsCount={activeDisruptions.length}
        onOpenImpactPanel={() => setIsImpactPanelOpen(true)}
        onFitToScreen={() => fitGraphRef.current?.()}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        totalBookings={nodes.length}
        violatedCount={violatedCount}
        tightCount={tightCount}
        resilience={resilience}
        activeUsers={activeUsers}
        currentClientId={clientIdRef.current}
        showAtRiskOnly={isAtRiskFilterActive}
        onToggleAtRiskOnly={() => setIsAtRiskFilterActive((prev) => !prev)}
        isViewer={isViewer}
        onOpenShare={() => setIsShareModalOpen(true)}
        onOpenActivity={() => setIsActivityDrawerOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        isPitchMode={isPitchMode}
        onTogglePitchMode={() => setIsPitchMode((prev) => !prev)}
      />

      {/* Phase 6: Judge Demo Pitch Bar (Only rendered when pitch mode is toggled on) */}
      {isPitchMode && (
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
      )}

      {/* Main Workspace Area with Error Boundary — exactly 1 header row precedes this */}
      <main className="relative flex-1 overflow-hidden">
        {/* Inline Non-Blocking Suggestion Chip (surfaced near nodes without pushing canvas height) */}
        {suggestedDependencies.length > 0 && !selectedNode && (
          <div className="absolute top-3 left-4 z-20 flex items-center gap-2 border border-[#F59E0B] bg-[#FFFBEB]/95 backdrop-blur-xs px-3 py-1.5 shadow-sm text-xs text-[#92400E]">
            <span className="flex h-2 w-2 rounded-full bg-[#D97706] animate-pulse" />
            <span className="font-semibold">
              {suggestedDependencies.length} Suggested Connection{suggestedDependencies.length > 1 ? "s" : ""}
            </span>
            <span className="text-[11px] text-[#B45309] hidden sm:inline">
              (click pulsing node to review)
            </span>
            <button
              onClick={() => {
                const targetNode = nodes.find(
                  (n) => n.id === suggestedDependencies[0].from || n.id === suggestedDependencies[0].to
                );
                if (targetNode) setSelectedNode(targetNode);
              }}
              className="ml-1 text-[11px] font-bold text-[#B45309] underline hover:text-[#78350F]"
            >
              Review
            </button>
          </div>
        )}

        {error && (
          <div className="mx-6 my-2 border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-2 text-xs text-[#991B1B] flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold underline ml-4">
              Dismiss
            </button>
          </div>
        )}

        <ErrorBoundary
          fallbackTitle="Graph Canvas Rendering Error"
          fallbackDescription="A problem occurred while rendering the interactive travel dependency graph."
          onReset={() => currentTrip && loadGraph(currentTrip.id)}
        >
          {nodes.length === 0 && !isLoadingGraph ? (
            <EmptyTripState
              tripName={currentTrip?.name || "Trip"}
              onAddBooking={() => {
                setEditingNode(null);
                setIsBookingModalOpen(true);
              }}
              onSeedDemo={handleSeedDemoTrip}
            />
          ) : viewMode === "graph" ? (
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
              showAtRiskOnly={isAtRiskFilterActive}
              pulsingNodeId={pulsingNodeId}
            />
          ) : (
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
          )}
        </ErrorBoundary>

        {/* Node Detail Slide-over Panel */}
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
          onAddDependencyFrom={(fromId: string) => {
            setDepOriginNodeId(fromId);
            setIsDependencyModalOpen(true);
          }}
          onDeleteDependency={handleDeleteEdge}
          suggestedDependencies={suggestedDependencies}
          onAcceptSuggestion={handleAcceptSuggestion}
          onRejectSuggestion={handleRejectSuggestion}
        />
      </main>

      {/* Modals & Slideouts */}
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
        onSubmit={handleAddDependency}
        nodes={nodes}
        initialFromNodeId={depOriginNodeId}
      />

      <TriggerDisruptionModal
        isOpen={isDisruptionModalOpen}
        onClose={() => setIsDisruptionModalOpen(false)}
        onSubmit={handleTriggerDisruption}
        nodes={nodes}
      />

      <TripCreateModal
        isOpen={isTripCreateOpen}
        onClose={() => setIsTripCreateOpen(false)}
        onCreateTrip={handleCreateTrip}
      />

      <ImpactSummaryPanel
        isOpen={isImpactPanelOpen}
        onClose={() => {
          setIsImpactPanelOpen(false);
        }}
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
        onError={(msg) => addToast(msg, "error")}
      />

      {currentTrip && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          trip={currentTrip}
          onMemberUpdated={() => setLatestEventTimestamp(Date.now().toString())}
        />
      )}

      {currentTrip && (
        <ActivityFeedDrawer
          isOpen={isActivityDrawerOpen}
          onClose={() => setIsActivityDrawerOpen(false)}
          trip={currentTrip}
          latestEventTimestamp={latestEventTimestamp}
        />
      )}

      {/* Persistent Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

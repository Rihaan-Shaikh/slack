"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { RippleResponse } from "@/lib/types";
import { previewTripInvite, acceptTripInvite, logoutUser } from "@/lib/api";
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
import { ToastMessage } from "@/components/ToastNotification";
import { TriggerDisruptionModal } from "@/components/TriggerDisruptionModal";
import { ImpactSummaryPanel } from "@/components/ImpactSummaryPanel";
import { ShareModal } from "@/components/ShareModal";
import { ActivityFeedDrawer } from "@/components/ActivityFeedDrawer";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import { useTripState } from "@/hooks/useTripState";
import { useDisruptionFlow } from "@/hooks/useDisruptionFlow";
import { usePresence } from "@/hooks/usePresence";

export default function TripWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const tripIdParam = Array.isArray(params?.tripId) ? params.tripId[0] : (params?.tripId as string);

  // Toast notifications
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

  const [latestRippleResponse, setLatestRippleResponse] = useState<RippleResponse | null>(null);

  const {
    trips, currentTrip, nodes, edges, suggestedDependencies, viewMode, setViewMode,
    selectedNode, setSelectedNode, editingNode, setEditingNode,
    isTripCreateOpen, setIsTripCreateOpen, isBookingModalOpen, setIsBookingModalOpen,
    isDependencyModalOpen, setIsDependencyModalOpen, depOriginNodeId, setDepOriginNodeId,
    activeDisruptions, setActiveDisruptions, resilience, setResilience,
    isLoading, isLoadingGraph, setIsLoadingGraph, error, setError,
    isAtRiskFilterActive, setIsAtRiskFilterActive,
    loadGraph, loadGraphSilent, handleSelectTrip, handleCreateTrip,
    handleSaveBooking, handleDeleteBooking, handleAddDependency, handleDeleteEdge,
    handleAcceptSuggestion, handleRejectSuggestion, handleSeedDemoTrip, handleSeedStressTrip
  } = useTripState(tripIdParam, addToast, setLatestRippleResponse);

  const {
    isDisruptionModalOpen, setIsDisruptionModalOpen,
    isImpactPanelOpen, setIsImpactPanelOpen,
    isReverseRippling, setIsReverseRippling,
    reverseStepIndex, setReverseStepIndex,
    handleTriggerDisruption, handleResolveDisruption,
    handleApplyRecovery, handleTriggerSampleDisruption
  } = useDisruptionFlow(
    currentTrip, setActiveDisruptions, loadGraph, addToast, setIsLoadingGraph, 
    () => {}, () => {}, latestRippleResponse, setLatestRippleResponse
  );

  const {
    activeUsers, pulsingNodeId, setPulsingNodeId,
    isShareModalOpen, setIsShareModalOpen,
    isActivityDrawerOpen, setIsActivityDrawerOpen,
    latestEventTimestamp, setLatestEventTimestamp,
    currentUser, clientIdRef
  } = usePresence(currentTrip, loadGraphSilent);

  const [isPitchMode, setIsPitchMode] = useState(false);
  const isViewer = false;
  const fitGraphRef = useRef<(() => void) | null>(null);

  const handleLogout = async () => {
    await logoutUser();
    router.push("/login");
  };

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

  const violatedCount = edges.filter((e) => e.status === "violated").length;
  const tightCount = edges.filter((e) => e.status === "tight").length;

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col bg-[var(--background)]">
        <div className="h-14 border-b border-[var(--border)] bg-[var(--card)] px-6 flex items-center justify-between">
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
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--background)] font-sans antialiased">
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
        currentClientId={clientIdRef.current || ""}
        showAtRiskOnly={isAtRiskFilterActive}
        onToggleAtRiskOnly={() => setIsAtRiskFilterActive((prev) => !prev)}
        isViewer={isViewer}
        onOpenShare={() => setIsShareModalOpen(true)}
        onOpenActivity={() => setIsActivityDrawerOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
        isPitchMode={isPitchMode}
        onTogglePitchMode={() => setIsPitchMode((p) => !p)}
        toasts={toasts}
      />

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

      <main className="relative flex-1 overflow-hidden">
        {suggestedDependencies.length > 0 && !selectedNode && (
          <div className="absolute top-3 left-4 z-20 flex items-center gap-2 border border-[#F59E0B] bg-[#FFFBEB]/95 backdrop-blur-xs px-3 py-1.5 shadow-sm text-xs text-[#92400E]">
            <span className="flex h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
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
    </div>
  );
}

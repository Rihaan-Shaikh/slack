import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Trip, GraphNode, GraphEdge, SuggestedDependency, Disruption,
  BookingCreateInput, DependencyCreateInput, TripResilienceResponse
} from "@/lib/types";
import {
  listTrips, getTrip, getTripGraph, listActiveDisruptions, getTripResilience,
  createTrip, addBooking, updateBooking, deleteBooking, createDependency,
  deleteDependency, seedDemoTrip, seedStressTrip
} from "@/lib/api";
import { ToastMessage } from "@/components/ToastNotification";

export function useTripState(tripIdParam: string, addToast: (msg: string, type: "success" | "info" | "warning" | "error") => void, setLatestRippleResponse: any) {
  const router = useRouter();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [suggestedDependencies, setSuggestedDependencies] = useState<SuggestedDependency[]>([]);

  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [editingNode, setEditingNode] = useState<GraphNode | null>(null);

  const [isTripCreateOpen, setIsTripCreateOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isDependencyModalOpen, setIsDependencyModalOpen] = useState(false);
  const [depOriginNodeId, setDepOriginNodeId] = useState<string | null>(null);

  const [activeDisruptions, setActiveDisruptions] = useState<Disruption[]>([]);
  const [resilience, setResilience] = useState<TripResilienceResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAtRiskFilterActive, setIsAtRiskFilterActive] = useState<boolean>(false);

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
  }, [setLatestRippleResponse]);

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

  return {
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
  };
}

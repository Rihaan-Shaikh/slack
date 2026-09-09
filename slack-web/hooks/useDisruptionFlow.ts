import { useState } from "react";
import { Disruption, DisruptionCreateInput, RippleResponse, Trip } from "@/lib/types";
import { triggerDisruption, resolveDisruption, applyRecoveryOption, triggerSampleDisruption } from "@/lib/api";

export function useDisruptionFlow(
  currentTrip: Trip | null, 
  setActiveDisruptions: React.Dispatch<React.SetStateAction<Disruption[]>>,
  loadGraph: (tripId: string) => Promise<void>,
  addToast: (msg: string, type: "success" | "info" | "warning" | "error") => void,
  setIsLoadingGraph: (v: boolean) => void,
  setNodes: any,
  setEdges: any,
  latestRippleResponse: RippleResponse | null,
  setLatestRippleResponse: any
) {
  const [isDisruptionModalOpen, setIsDisruptionModalOpen] = useState(false);
  const [isImpactPanelOpen, setIsImpactPanelOpen] = useState(false);
  const [isReverseRippling, setIsReverseRippling] = useState(false);
  const [reverseStepIndex, setReverseStepIndex] = useState(-1);

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

  return {
    isDisruptionModalOpen, setIsDisruptionModalOpen,
    isImpactPanelOpen, setIsImpactPanelOpen,
    isReverseRippling, setIsReverseRippling,
    reverseStepIndex, setReverseStepIndex,
    handleTriggerDisruption, handleResolveDisruption,
    handleApplyRecovery, handleTriggerSampleDisruption
  };
}

"use client";

import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Percent,
  Check,
  Zap,
} from "lucide-react";
import {
  Disruption,
  NodeImpact,
  RecoveryCandidate,
  RecoveryOptionsResponse,
  RippleResponse,
} from "@/lib/types";
import { getRecoveryOptions } from "@/lib/api";

interface ImpactSummaryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  disruption: Disruption | RippleResponse | null;
  impacts: NodeImpact[];
  disruptedBookingTitle: string;
  onResolve: (disruptionId: string) => Promise<void>;
  onApplyRecovery: (candidateId: string) => Promise<void>;
  onError?: (message: string) => void;
}

// Circular Score Ring component
const ScoreRing: React.FC<{ score: number; isRecommended: boolean }> = ({
  score,
  isRecommended,
}) => {
  const radius = 18;
  const strokeWidth = 3;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const color =
    score >= 75
      ? "#059669" // emerald
      : score >= 50
      ? "var(--accent)" // amber
      : "#DC2626"; // crimson

  return (
    <div className="relative flex items-center justify-center h-12 w-12 flex-shrink-0">
      <svg className="h-12 w-12 transform -rotate-90" viewBox="0 0 44 44">
        <circle
          cx="22"
          cy="22"
          r={radius}
          stroke="var(--border)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx="22"
          cy="22"
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[12px] font-bold text-[var(--foreground)]">{score}</span>
        <span className="text-[7px] uppercase font-bold text-[#8E887D] -mt-0.5">pts</span>
      </div>
    </div>
  );
};

export const ImpactSummaryPanel: React.FC<ImpactSummaryPanelProps> = ({
  isOpen,
  onClose,
  tripId,
  disruption,
  impacts,
  disruptedBookingTitle,
  onResolve,
  onApplyRecovery,
  onError,
}) => {
  // Panel mode: "blast_radius" or "recovery_options"
  const [activeTab, setActiveTab] = useState<"blast_radius" | "recovery_options">("blast_radius");
  const [candidates, setCandidates] = useState<RecoveryCandidate[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [expandedMathId, setExpandedMathId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Reset tab when disruption changes
  const disruptionId = disruption
    ? "id" in disruption
      ? disruption.id
      : disruption.disruption_id
    : null;

  useEffect(() => {
    setActiveTab("blast_radius");
    setCandidates([]);
    setSelectedCandidateId(null);
    setExpandedMathId(null);
    setOptionsError(null);
  }, [disruptionId]);

  if (!isOpen || !disruption || !disruptionId) return null;

  const delayMinutes = disruption.delay_minutes;
  const disruptionType = disruption.disruption_type;

  const missedList = impacts.filter((i) => i.severity === "missed");
  const atRiskList = impacts.filter((i) => i.severity === "at_risk");
  const unaffectedList = impacts.filter((i) => i.severity === "unaffected");

  const summaryLine =
    disruptionType === "delay"
      ? `${disruptedBookingTitle} delayed ${delayMinutes} minutes`
      : disruptionType === "cancellation"
      ? `${disruptedBookingTitle} cancelled`
      : `${disruptedBookingTitle} disrupted (${disruptionType})`;

  // Handle switching to recovery options
  const handleOpenRecoveryOptions = async () => {
    setActiveTab("recovery_options");
    if (candidates.length === 0 && !isLoadingOptions) {
      setIsLoadingOptions(true);
      setOptionsError(null);
      try {
        const res: RecoveryOptionsResponse = await getRecoveryOptions(tripId, disruptionId);
        setCandidates(res.candidates);
        // Pre-select recommended option
        const rec = res.candidates.find((c) => c.is_recommended);
        if (rec) {
          setSelectedCandidateId(rec.id);
        } else if (res.candidates.length > 0) {
          setSelectedCandidateId(res.candidates[0].id);
        }
      } catch (err) {
        setOptionsError(err instanceof Error ? err.message : "Failed to generate recovery options");
      } finally {
        setIsLoadingOptions(false);
      }
    }
  };

  const handleApplyClick = async (candidateId: string) => {
    try {
      setIsApplying(true);
      await onApplyRecovery(candidateId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to apply recovery option";
      if (onError) onError(msg);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <aside
      className="fixed top-0 right-0 z-40 h-full w-[460px] border-l border-[var(--border-strong)] bg-[var(--card)] p-6 overflow-y-auto flex flex-col justify-between shadow-none transition-all duration-300"
      aria-label="Disruption & Recovery Panel"
    >
      <div>
        {/* Header with Title & Navigation */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            {activeTab === "recovery_options" ? (
              <button
                onClick={() => setActiveTab("blast_radius")}
                className="flex h-6 w-6 items-center justify-center border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--border)] transition-colors"
                title="Back to Blast Radius"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="flex h-6 w-6 items-center justify-center bg-[#B91C1C] text-[var(--background)]">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="font-serif-heading text-lg font-bold text-[var(--foreground)]">
              {activeTab === "blast_radius" ? "Disruption Blast Radius" : "Ranked Recovery Engine"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1 border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:border-[var(--foreground)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Close panel"
          >
            <X className="h-3.5 w-3.5" />
            <span>Close</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: BLAST RADIUS VIEW                                                  */}
        {/* ========================================================================= */}
        {activeTab === "blast_radius" && (
          <div className="animate-in fade-in duration-200">
            {/* Primary Disruption Banner */}
            <div className="mt-4 border-2 border-[#B91C1C] bg-[#FEE2E2] p-3 text-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#991B1B]">
                Triggered Disruption Event
              </div>
              <div className="font-serif-heading text-base font-bold text-[#991B1B] mt-0.5">
                {summaryLine}
              </div>
              {disruption.description && (
                <p className="mt-1 text-[11px] text-[#7F1D1D]">{disruption.description}</p>
              )}
            </div>

            {/* Quick Blast Radius Count */}
            <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted-foreground)] px-1">
              <span>Evaluated downstream connections:</span>
              <div className="flex items-center gap-2 font-medium">
                {missedList.length > 0 && (
                  <span className="text-[#991B1B] font-bold">{missedList.length} missed</span>
                )}
                {atRiskList.length > 0 && (
                  <span className="text-[#92400E] font-bold">{atRiskList.length} at risk</span>
                )}
                {unaffectedList.length > 0 && (
                  <span className="text-[#334155]">{unaffectedList.length} unaffected</span>
                )}
              </div>
            </div>

            {/* MISSED Section */}
            <div className="mt-5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#991B1B] mb-2">
                <span className="inline-block h-2 w-2 rounded-full bg-[#B91C1C]" />
                <span>Missed Bookings ({missedList.length})</span>
              </div>

              {missedList.length === 0 ? (
                <p className="border border-[var(--border)] bg-[var(--background)] p-2.5 text-xs text-[#8E887D] italic">
                  No connections are classified as completely missed.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {missedList.map((item) => (
                    <div
                      key={item.booking_id}
                      className="border-2 border-dashed border-[#B91C1C] bg-[#FFF5F5] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-serif-heading text-sm font-bold text-[var(--foreground)]">
                          {item.booking_title}
                        </span>
                        <span className="rounded-full border border-[#B91C1C] bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-bold text-[#991B1B] uppercase">
                          Missed ({item.new_slack_minutes}m)
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-[#7F1D1D] leading-relaxed">
                        {item.human_explanation}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AT RISK Section */}
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#92400E] mb-2">
                <span className="inline-block h-2 w-2 rounded-full bg-[#C05621]" />
                <span>At Risk Bookings ({atRiskList.length})</span>
              </div>

              {atRiskList.length === 0 ? (
                <p className="border border-[var(--border)] bg-[var(--background)] p-2.5 text-xs text-[#8E887D] italic">
                  No connections are at critical risk.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {atRiskList.map((item) => (
                    <div
                      key={item.booking_id}
                      className="border-2 border-solid border-[#C05621] bg-[#FFFBF0] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-serif-heading text-sm font-bold text-[var(--foreground)]">
                          {item.booking_title}
                        </span>
                        <span className="rounded-full border border-[var(--accent)] bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#92400E] uppercase">
                          At Risk (+{item.new_slack_minutes}m)
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-[#78350F] leading-relaxed">
                        {item.human_explanation}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* UNAFFECTED Section */}
            {unaffectedList.length > 0 && (
              <div className="mt-5 border-t border-[var(--border)] pt-3 text-xs text-[#8E887D]">
                <span className="font-medium text-[var(--foreground)]">{unaffectedList.length}</span> downstream
                booking(s) outside the blast radius remain safely scheduled.
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: RANKED RECOVERY OPTIONS VIEW                                       */}
        {/* ========================================================================= */}
        {activeTab === "recovery_options" && (
          <div className="animate-in fade-in duration-200 mt-4 space-y-4">
            <div className="border border-[var(--border)] bg-[var(--background)] p-3 text-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                Recovery Target
              </div>
              <div className="font-serif-heading text-sm font-bold text-[var(--foreground)] mt-0.5">
                Deterministic Fixes for Broken Connections
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                Scored by mathematical weights (Cost: 35%, Time: 30%, Itinerary: 20%, Refund: 15%) + Groq human rationale.
              </p>
            </div>

            {/* Loading Skeleton: Three pulsing outline cards */}
            {isLoadingOptions && (
              <div className="space-y-3.5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="border border-[var(--border-strong)] bg-[var(--card)] p-4 skeleton-pulse space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-4 w-24 bg-[var(--border)] rounded-none" />
                      <div className="h-9 w-9 rounded-full bg-[var(--border)]" />
                    </div>
                    <div className="h-4 w-3/4 bg-[var(--border)] rounded-none" />
                    <div className="flex gap-2">
                      <div className="h-5 w-16 bg-[var(--border)] rounded-none" />
                      <div className="h-5 w-16 bg-[var(--border)] rounded-none" />
                      <div className="h-5 w-20 bg-[var(--border)] rounded-none" />
                    </div>
                    <div className="h-3 w-full bg-[var(--border)] rounded-none" />
                  </div>
                ))}
              </div>
            )}

            {/* Error state */}
            {optionsError && (
              <div className="border border-[#B91C1C] bg-[#FEE2E2] p-3 text-xs text-[#991B1B]">
                {optionsError}
              </div>
            )}

            {/* 3 Identical Cards */}
            {!isLoadingOptions && candidates.length > 0 && (
              <div className="space-y-3.5">
                {candidates.map((cand) => {
                  const isSelected = selectedCandidateId === cand.id;
                  const isMathExpanded = expandedMathId === cand.id;

                  const typeColor =
                    cand.candidate_type === "rebook"
                      ? { bg: "#EBF3F9", text: "#1E3E5B", border: "#2B5B84" }
                      : cand.candidate_type === "shift"
                      ? { bg: "#FBF1E8", text: "#633B22", border: "#885434" }
                      : { bg: "#FFF5F5", text: "#991B1B", border: "#B91C1C" };

                  return (
                    <div
                      key={cand.id}
                      onClick={() => setSelectedCandidateId(cand.id)}
                      className={`relative border p-4 cursor-pointer transition-all duration-150 ${
                        isSelected
                          ? "border-[var(--foreground)] bg-[var(--card)] shadow-sm ring-1 ring-[var(--foreground)]"
                          : "border-[var(--border-strong)] bg-[var(--background)] hover:border-[#8E887D]"
                      }`}
                    >
                      {/* Quiet Recommended Ribbon - Never size or border differences */}
                      {cand.is_recommended && (
                        <div className="absolute -top-2.5 right-4 bg-[#FEF3C7] border border-[var(--accent)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#92400E] shadow-none">
                          ★ Recommended
                        </div>
                      )}

                      {/* Card Header: Type Badge & Score Ring */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border"
                              style={{
                                backgroundColor: typeColor.bg,
                                color: typeColor.text,
                                borderColor: typeColor.border,
                              }}
                            >
                              {cand.candidate_type}
                            </span>
                            <span className="text-[11px] font-bold text-[var(--foreground)]">
                              {cand.title}
                            </span>
                          </div>

                          {/* Numeric Badges Row */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {/* Cost Pill */}
                            <span className="inline-flex items-center gap-1 border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-semibold text-[#4A453C]">
                              <DollarSign className="h-2.5 w-2.5 text-[var(--muted-foreground)]" />
                              {cand.cost_delta > 0
                                ? `+$${cand.cost_delta.toFixed(2)}`
                                : cand.cost_delta < 0
                                ? `-$${Math.abs(cand.cost_delta).toFixed(2)}`
                                : "$0.00 fee"}
                            </span>

                            {/* Time Delta Pill */}
                            <span className="inline-flex items-center gap-1 border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-semibold text-[#4A453C]">
                              <Clock className="h-2.5 w-2.5 text-[var(--muted-foreground)]" />
                              {cand.time_delta_minutes > 0
                                ? `+${cand.time_delta_minutes}m buffer`
                                : `${cand.time_delta_minutes}m`}
                            </span>

                            {/* Itinerary Altered Pill */}
                            <span className="inline-flex items-center gap-1 border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-semibold text-[#4A453C]">
                              <Percent className="h-2.5 w-2.5 text-[var(--muted-foreground)]" />
                              {cand.itinerary_altered_percent.toFixed(0)}% altered
                            </span>

                            {/* Refund Badge */}
                            {cand.refund_amount > 0 && (
                              <span className="inline-flex items-center gap-1 border border-[#059669] bg-[#ECFDF5] px-1.5 py-0.5 text-[10px] font-bold text-[#065F46]">
                                Refund ${cand.refund_amount.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Score Ring */}
                        <ScoreRing score={cand.score} isRecommended={cand.is_recommended} />
                      </div>

                      {/* One Sentence Human Rationale from Groq / Fallback */}
                      <p className="mt-2 text-xs text-[var(--foreground)] leading-relaxed italic border-l-2 border-[var(--border-strong)] pl-2.5">
                        &ldquo;{cand.human_explanation}&rdquo;
                      </p>

                      {/* Inline Expandable "See the Math" Section */}
                      <div className="mt-3 border-t border-[var(--border)] pt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedMathId(isMathExpanded ? null : cand.id);
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                        >
                          {isMathExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                          <span>{isMathExpanded ? "Hide the math" : "See the math"}</span>
                        </button>

                        {isMathExpanded && (
                          <div className="mt-2.5 border border-[var(--border)] bg-[var(--card)] p-2.5 text-[11px] space-y-2 text-[#4A453C]">
                            <div className="font-mono text-[10px] text-[var(--muted-foreground)] border-b border-[var(--border)] pb-1">
                              {cand.scoring_breakdown.formula_explanation}
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                              <div className="flex justify-between">
                                <span>Cost (w=35%):</span>
                                <span className="font-mono font-bold">{cand.scoring_breakdown.cost_score} pts</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Time (w=30%):</span>
                                <span className="font-mono font-bold">{cand.scoring_breakdown.time_score} pts</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Itinerary (w=20%):</span>
                                <span className="font-mono font-bold">{cand.scoring_breakdown.itinerary_score} pts</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Refund (w=15%):</span>
                                <span className="font-mono font-bold">{cand.scoring_breakdown.refund_score} pts</span>
                              </div>
                            </div>
                            <div className="border-t border-[var(--border)] pt-1 flex justify-between font-bold text-xs text-[var(--foreground)]">
                              <span>Deterministic Score Sum:</span>
                              <span className="font-mono">{cand.score} / 100</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action Button inside card */}
                      <div className="mt-3 flex items-center justify-between pt-1">
                        <div className="text-[10px] text-[#8E887D]">
                          {isSelected ? "Selected for execution" : "Click to select"}
                        </div>
                        <button
                          type="button"
                          disabled={isApplying}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplyClick(cand.id);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                            cand.is_recommended
                              ? "bg-[var(--foreground)] text-[var(--background)] hover:bg-[#38332B]"
                              : "border border-[var(--foreground)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                          }`}
                        >
                          <Zap className="h-3 w-3" />
                          <span>{isApplying && selectedCandidateId === cand.id ? "Applying..." : "Apply"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* FOOTER ACTIONS                                                            */}
      {/* ========================================================================= */}
      <div className="mt-6 border-t border-[var(--border)] pt-4 flex flex-col gap-2">
        {activeTab === "blast_radius" ? (
          <>
            {/* Step 2 Requirement: "Show recovery options" button right here at bottom of blast radius */}
            <button
              onClick={handleOpenRecoveryOptions}
              className="flex items-center justify-center gap-2 border border-[var(--foreground)] bg-[var(--foreground)] px-4 py-2.5 text-xs font-medium text-[var(--background)] hover:bg-[#38332B] transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Show Recovery Options</span>
            </button>
            <button
              onClick={() => onResolve(String(disruptionId))}
              className="flex items-center justify-center gap-2 border border-[var(--border-strong)] bg-[var(--background)] px-4 py-2 text-xs font-medium text-[#4A453C] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Quick Reset Schedule</span>
            </button>
          </>
        ) : (
          <>
            {selectedCandidateId && (
              <button
                disabled={isApplying}
                onClick={() => handleApplyClick(selectedCandidateId)}
                className="flex items-center justify-center gap-2 border border-[var(--foreground)] bg-[var(--foreground)] px-4 py-2.5 text-xs font-medium text-[var(--background)] hover:bg-[#38332B] transition-colors"
              >
                <Check className="h-3.5 w-3.5 text-[#059669]" />
                <span>
                  {isApplying ? "Applying Recovery Mutation..." : "Apply Selected Recovery"}
                </span>
              </button>
            )}
            <button
              onClick={() => setActiveTab("blast_radius")}
              className="flex items-center justify-center border border-[var(--border-strong)] bg-[var(--card)] px-4 py-2 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-colors"
            >
              Back to Blast Radius
            </button>
          </>
        )}
      </div>
    </aside>
  );
};

"use client";

import React from "react";
import { X, Edit, Trash2, Clock, MapPin, DollarSign, ShieldAlert, Plus, ArrowRight } from "lucide-react";
import { GraphEdge, GraphNode } from "@/lib/types";

interface NodeDetailPanelProps {
  node: GraphNode | null;
  allNodes: GraphNode[];
  edges: GraphEdge[];
  onClose: () => void;
  onEdit: (node: GraphNode) => void;
  onDelete: (nodeId: string) => void;
  onAddDependencyFrom: (fromNodeId: string) => void;
  onDeleteDependency: (edgeId: string) => void;
}

const TYPE_BADGES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  flight: { bg: "#EBF3F9", text: "#2B5B84", border: "#B8D5EA", label: "Flight" },
  hotel: { bg: "#FBF1E8", text: "#885434", border: "#E9CEBC", label: "Hotel" },
  transfer: { bg: "#EDF7F2", text: "#2D6A4F", border: "#BCDCCB", label: "Transfer" },
  activity: { bg: "#F7EEF6", text: "#6D3A6D", border: "#DECADC", label: "Activity" },
};

const EDGE_STYLES: Record<
  string,
  {
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    borderStyle: string;
  }
> = {
  violated: {
    badgeBg: "#FEE2E2",
    badgeBorder: "#B91C1C",
    badgeText: "#991B1B",
    borderStyle: "border-dashed border-[#B91C1C] border-2",
  },
  tight: {
    badgeBg: "#FEF3C7",
    badgeBorder: "#D97706",
    badgeText: "#92400E",
    borderStyle: "border-solid border-[#C05621] border-2",
  },
  safe: {
    badgeBg: "#F1F5F9",
    badgeBorder: "#CBD5E1",
    badgeText: "#334155",
    borderStyle: "border-solid border-[#CBD5E1] border",
  },
};

// Defensive style resolver: ensures safe positive slack (>30m) never renders in violated crimson
function resolveEdgeStyle(status: string, slackMinutes?: number) {
  const effectiveStatus =
    slackMinutes !== undefined
      ? slackMinutes < 0
        ? "violated"
        : slackMinutes <= 30
        ? "tight"
        : "safe"
      : status;
  return EDGE_STYLES[effectiveStatus] || EDGE_STYLES.safe;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  node,
  allNodes,
  edges,
  onClose,
  onEdit,
  onDelete,
  onAddDependencyFrom,
  onDeleteDependency,
}) => {
  if (!node) return null;

  const typeBadge = TYPE_BADGES[node.type] || TYPE_BADGES.activity;
  const incomingEdges = edges.filter((e) => e.to === node.id);
  const outgoingEdges = edges.filter((e) => e.from === node.id);

  const formatFullDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return isoStr;
    }
  };

  const formatTimeOnly = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  // Duration in hours & minutes
  const startMs = new Date(node.start_time).getTime();
  const endMs = new Date(node.end_time).getTime();
  const durationMin = Math.round((endMs - startMs) / 60000);
  const durationHours = Math.floor(durationMin / 60);
  const durationRemainingMin = durationMin % 60;
  const durationStr =
    durationHours > 0
      ? `${durationHours}h ${durationRemainingMin > 0 ? `${durationRemainingMin}m` : ""}`
      : `${durationMin}m`;

  return (
    <aside className="fixed top-0 right-0 z-40 h-full w-[420px] border-l border-[#CEC4B5] bg-[#FFFFFF] p-6 overflow-y-auto flex flex-col justify-between">
      <div>
        {/* Header with Type & Close */}
        <div className="flex items-center justify-between">
          <span
            className="inline-block border px-2 py-0.5 text-[11px] font-semibold tracking-wide"
            style={{
              backgroundColor: typeBadge.bg,
              color: typeBadge.text,
              borderColor: typeBadge.border,
            }}
          >
            {typeBadge.label}
          </span>
          <button
            onClick={onClose}
            className="flex items-center gap-1 border border-[#CEC4B5] bg-[#FFFFFF] px-2.5 py-1 text-xs text-[#6E685D] hover:border-[#221F1A] hover:text-[#221F1A] hover:bg-[#FAF7F2] transition-colors"
            aria-label="Close detail panel"
          >
            <X className="h-3.5 w-3.5" />
            <span>Close</span>
          </button>
        </div>

        {/* Booking Title */}
        <h2 className="mt-3 font-serif-heading text-2xl font-bold leading-tight text-[#221F1A]">
          {node.title}
        </h2>

        {/* Time Range Prominently Displayed */}
        <div className="mt-2.5 pb-4 text-xs text-[#6E685D]">
          <div className="font-semibold text-[#221F1A] text-sm">
            {formatTimeOnly(node.start_time)} - {formatTimeOnly(node.end_time)}
            <span className="ml-2 font-normal text-[#8E887D]">({durationStr})</span>
          </div>
          <div className="mt-0.5 text-[#8E887D]">{formatFullDate(node.start_time)}</div>
        </div>

        {/* Labeled Section 1: Schedule and Location */}
        <div className="border-t border-[#E5DFD5] pt-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#8E887D] mb-2">
            Schedule and Location
          </div>
          <div className="space-y-1.5 text-xs text-[#221F1A]">
            {node.location && (
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#8E887D] mt-0.5" />
                <span>{node.location}</span>
              </div>
            )}
            {node.metadata?.pickup && (
              <div className="text-xs text-[#6E685D] pl-5">
                Pickup: <span className="font-medium text-[#221F1A]">{String(node.metadata.pickup)}</span>
              </div>
            )}
            {node.metadata?.dropoff && (
              <div className="text-xs text-[#6E685D] pl-5">
                Dropoff: <span className="font-medium text-[#221F1A]">{String(node.metadata.dropoff)}</span>
              </div>
            )}
            {node.metadata?.terminal && (
              <div className="text-xs text-[#6E685D] pl-5">
                Terminal: <span className="font-medium text-[#221F1A]">{String(node.metadata.terminal)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Labeled Section 2: Vendor and Cost */}
        <div className="border-t border-[#E5DFD5] pt-3.5 mt-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#8E887D] mb-2">
            Vendor and Cost
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[#8E887D] block">Provider / Vendor</span>
              <span className="font-medium text-[#221F1A]">
                {node.vendor || "Standard booking"}
              </span>
            </div>
            <div>
              <span className="text-[#8E887D] block">Recorded Cost</span>
              <span className="font-medium text-[#221F1A]">
                {node.cost != null ? `$${node.cost.toFixed(2)}` : "Not specified"}
              </span>
            </div>
            {node.metadata?.flight_number && (
              <div className="col-span-2">
                <span className="text-[#8E887D] block">Flight Identifier</span>
                <span className="font-medium text-[#221F1A]">{String(node.metadata.flight_number)}</span>
              </div>
            )}
            {node.metadata?.room_type && (
              <div className="col-span-2">
                <span className="text-[#8E887D] block">Room Category</span>
                <span className="font-medium text-[#221F1A]">{String(node.metadata.room_type)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Labeled Section 3: Cancellation Policy */}
        <div className="border-t border-[#E5DFD5] pt-3.5 mt-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#8E887D] mb-1.5">
            Cancellation Policy
          </div>
          <p className="text-xs text-[#6E685D]">
            {node.cancellation_policy || "Standard cancellation terms apply."}
          </p>
        </div>

        {/* Labeled Section 4: Connections & Dependencies */}
        <div className="border-t border-[#E5DFD5] pt-3.5 mt-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8E887D]">
              Connections &amp; Dependencies
            </div>
            <button
              onClick={() => onAddDependencyFrom(node.id)}
              className="flex items-center gap-1 border border-[#CEC4B5] bg-[#FFFFFF] px-2 py-0.5 text-[11px] font-medium text-[#221F1A] hover:bg-[#F3ECE2] hover:border-[#221F1A] transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add Connection
            </button>
          </div>

          {/* Upstream & Downstream list */}
          <div className="space-y-2 text-xs">
            {incomingEdges.length === 0 && outgoingEdges.length === 0 && (
              <p className="text-xs text-[#8E887D] italic">
                No active dependencies connected to this booking.
              </p>
            )}

            {incomingEdges.map((edge) => {
              const src = allNodes.find((n) => n.id === edge.from);
              const style = resolveEdgeStyle(edge.status, edge.slack_minutes);
              return (
                <div
                  key={edge.id}
                  className={`p-2 bg-[#FFFFFF] ${style.borderStyle} flex items-center justify-between`}
                >
                  <div>
                    <div className="text-[11px] text-[#8E887D]">Preceding (Incoming):</div>
                    <div className="font-semibold text-[#221F1A]">{src?.title || "Booking"}</div>
                    <div className="text-[11px] text-[#6E685D]">
                      Gap: {edge.actual_gap_minutes}m (Min: {edge.min_buffer_minutes}m)
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                      style={{
                        backgroundColor: style.badgeBg,
                        borderColor: style.badgeBorder,
                        color: style.badgeText,
                      }}
                    >
                      {edge.slack_minutes >= 0 ? `+${edge.slack_minutes}` : edge.slack_minutes}m ({edge.status})
                    </span>
                    <button
                      onClick={() => onDeleteDependency(edge.id)}
                      className="text-[#991B1B] hover:text-[#7F1D1D] p-1"
                      title="Remove edge"
                      aria-label="Remove edge"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {outgoingEdges.map((edge) => {
              const dest = allNodes.find((n) => n.id === edge.to);
              const style = resolveEdgeStyle(edge.status, edge.slack_minutes);
              return (
                <div
                  key={edge.id}
                  className={`p-2 bg-[#FFFFFF] ${style.borderStyle} flex items-center justify-between`}
                >
                  <div>
                    <div className="text-[11px] text-[#8E887D]">Downstream (Outgoing):</div>
                    <div className="font-semibold text-[#221F1A]">{dest?.title || "Booking"}</div>
                    <div className="text-[11px] text-[#6E685D]">
                      Gap: {edge.actual_gap_minutes}m (Min: {edge.min_buffer_minutes}m)
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                      style={{
                        backgroundColor: style.badgeBg,
                        borderColor: style.badgeBorder,
                        color: style.badgeText,
                      }}
                    >
                      {edge.slack_minutes >= 0 ? `+${edge.slack_minutes}` : edge.slack_minutes}m ({edge.status})
                    </span>
                    <button
                      onClick={() => onDeleteDependency(edge.id)}
                      className="text-[#991B1B] hover:text-[#7F1D1D] p-1"
                      title="Remove edge"
                      aria-label="Remove edge"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Labeled Section 5: Highlighted Upstream & Downstream Slack Row at Bottom */}
      <div className="mt-6 border-t border-[#E5DFD5] pt-4">
        <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
          {/* Upstream Slack Card */}
          <div className="border border-[#CEC4B5] bg-[#FAF7F2] p-2.5">
            <span className="text-[10px] text-[#8E887D] uppercase font-bold block mb-1">
              Upstream Slack
            </span>
            {incomingEdges.length > 0 ? (
              <div className="space-y-1">
                {incomingEdges.map((e) => {
                  const style = resolveEdgeStyle(e.status, e.slack_minutes);
                  return (
                    <span
                      key={e.id}
                      className="inline-block font-bold text-xs px-2 py-0.5 border mr-1"
                      style={{
                        backgroundColor: style.badgeBg,
                        borderColor: style.badgeBorder,
                        color: style.badgeText,
                      }}
                    >
                      {e.slack_minutes >= 0 ? `+${e.slack_minutes}` : e.slack_minutes}m ({e.status})
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="text-[#8E887D] italic">No upstream dependency</span>
            )}
          </div>

          {/* Downstream Slack Card */}
          <div className="border border-[#CEC4B5] bg-[#FAF7F2] p-2.5">
            <span className="text-[10px] text-[#8E887D] uppercase font-bold block mb-1">
              Downstream Slack
            </span>
            {outgoingEdges.length > 0 ? (
              <div className="space-y-1">
                {outgoingEdges.map((e) => {
                  const style = resolveEdgeStyle(e.status, e.slack_minutes);
                  return (
                    <span
                      key={e.id}
                      className="inline-block font-bold text-xs px-2 py-0.5 border mr-1"
                      style={{
                        backgroundColor: style.badgeBg,
                        borderColor: style.badgeBorder,
                        color: style.badgeText,
                      }}
                    >
                      {e.slack_minutes >= 0 ? `+${e.slack_minutes}` : e.slack_minutes}m ({e.status})
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="text-[#8E887D] italic">No downstream dependency</span>
            )}
          </div>
        </div>

        {/* Action Buttons with strict button hierarchy */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onEdit(node)}
            className="flex-1 flex items-center justify-center gap-1.5 border border-[#221F1A] bg-[#221F1A] px-3 py-2 text-xs font-medium text-[#FAF7F2] hover:bg-[#38332B] transition-colors"
          >
            <Edit className="h-3.5 w-3.5" />
            <span>Edit Booking</span>
          </button>
          <button
            onClick={() => onDelete(node.id)}
            className="flex items-center justify-center gap-1.5 border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs font-medium text-[#991B1B] hover:bg-[#FECACA] transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

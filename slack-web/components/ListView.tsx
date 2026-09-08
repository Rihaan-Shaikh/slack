"use client";

import React from "react";
import { Clock, MapPin, DollarSign, Edit, Trash2, ArrowRight } from "lucide-react";
import { GraphEdge, GraphNode } from "@/lib/types";

interface ListViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelectNode: (node: GraphNode) => void;
  onEditNode: (node: GraphNode) => void;
  onDeleteNode: (nodeId: string) => void;
}

const TYPE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  flight: { bg: "#EBF3F9", text: "#2B5B84", border: "#B8D5EA", label: "Flight" },
  hotel: { bg: "#FBF1E8", text: "#885434", border: "#E9CEBC", label: "Hotel" },
  transfer: { bg: "#EDF7F2", text: "#2D6A4F", border: "#BCDCCB", label: "Transfer" },
  activity: { bg: "#F7EEF6", text: "#6D3A6D", border: "#DECADC", label: "Activity" },
};

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  safe: { bg: "#EDF7F2", text: "#2D6A4F", border: "#BCDCCB" },
  tight: { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
  violated: { bg: "#FEE2E2", text: "#991B1B", border: "#FCA5A5" },
};

function resolveStatusBadge(status: string, slackMinutes?: number) {
  const effectiveStatus =
    slackMinutes !== undefined
      ? slackMinutes < 0
        ? "violated"
        : slackMinutes <= 30
        ? "tight"
        : "safe"
      : status;
  return STATUS_BADGES[effectiveStatus] || STATUS_BADGES.safe;
}

export const ListView: React.FC<ListViewProps> = ({
  nodes,
  edges,
  onSelectNode,
  onEditNode,
  onDeleteNode,
}) => {
  // Sort nodes chronologically by start_time
  const sortedNodes = [...nodes].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const formatDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  if (sortedNodes.length === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center border border-dashed border-[#CEC4B5] bg-[#FFFFFF] p-8 text-center">
        <p className="font-serif-heading text-lg font-medium text-[#221F1A]">No bookings added yet</p>
        <p className="mt-1 text-xs text-[#6E685D]">
          Add your first flight, hotel, transfer, or activity to begin constructing your trip graph.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-6 px-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif-heading text-xl font-bold text-[#221F1A]">
          Chronological Itinerary
        </h2>
        <span className="text-xs text-[#6E685D]">
          {sortedNodes.length} {sortedNodes.length === 1 ? "booking" : "bookings"} in sequence
        </span>
      </div>

      <div className="space-y-3">
        {sortedNodes.map((node, index) => {
          const typeStyle = TYPE_STYLES[node.type] || TYPE_STYLES.activity;

          // Find outgoing edges from this node
          const outgoingEdges = edges.filter((e) => e.from === node.id);

          return (
            <div
              key={node.id}
              className="border border-[#E5DFD5] bg-[#FFFFFF] p-4 transition-colors hover:border-[#CEC4B5]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {/* Sequence number */}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-[#E5DFD5] bg-[#FAF7F2] text-xs font-semibold text-[#6E685D]">
                    {index + 1}
                  </span>

                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="border px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: typeStyle.bg,
                          color: typeStyle.text,
                          borderColor: typeStyle.border,
                        }}
                      >
                        {typeStyle.label}
                      </span>
                      <h3
                        onClick={() => onSelectNode(node)}
                        className="cursor-pointer font-serif-heading text-base font-semibold text-[#221F1A] hover:underline"
                      >
                        {node.title}
                      </h3>
                      {node.vendor && (
                        <span className="text-xs text-[#8E887D]">by {node.vendor}</span>
                      )}
                    </div>

                    {/* Time & Location */}
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[#6E685D]">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-[#8E887D]" />
                        <span>
                          {formatDateTime(node.start_time)} - {formatDateTime(node.end_time)}
                        </span>
                      </div>
                      {node.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-[#8E887D]" />
                          <span>{node.location}</span>
                        </div>
                      )}
                      {node.cost != null && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5 text-[#8E887D]" />
                          <span>${node.cost.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onEditNode(node)}
                    className="flex items-center gap-1 border border-[#E5DFD5] bg-[#FAF7F2] px-2.5 py-1 text-xs text-[#6E685D] hover:border-[#221F1A] hover:text-[#221F1A] transition-colors"
                  >
                    <Edit className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => onDeleteNode(node.id)}
                    className="flex items-center gap-1 border border-[#E5DFD5] bg-[#FAF7F2] px-2.5 py-1 text-xs text-[#B91C1C] hover:border-[#B91C1C] hover:bg-[#FEE2E2] transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Outgoing edges / buffer to downstream bookings */}
              {outgoingEdges.length > 0 && (
                <div className="mt-3 border-t border-[#F3ECE2] pt-2.5">
                  <div className="text-[11px] font-medium text-[#8E887D] mb-1.5">
                    Downstream Connections &amp; Slack:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {outgoingEdges.map((edge) => {
                      const targetNode = nodes.find((n) => n.id === edge.to);
                      const badge = resolveStatusBadge(edge.status, edge.slack_minutes);
                      return (
                        <div
                          key={edge.id}
                          className="flex items-center gap-2 border px-2.5 py-1 text-xs"
                          style={{
                            backgroundColor: badge.bg,
                            borderColor: badge.border,
                            color: badge.text,
                          }}
                        >
                          <span className="font-medium">
                            To: {targetNode?.title || "Booking"}
                          </span>
                          <ArrowRight className="h-3 w-3 opacity-60" />
                          <span>
                            Gap: {edge.actual_gap_minutes}m (Min: {edge.min_buffer_minutes}m)
                          </span>
                          <span className="font-bold">
                            {edge.slack_minutes >= 0 ? `+${edge.slack_minutes}` : edge.slack_minutes}m slack
                          </span>
                          <span className="uppercase text-[10px] font-bold tracking-wider">
                            ({edge.status})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

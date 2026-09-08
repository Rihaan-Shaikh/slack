"use client";

import React, { useState, useEffect } from "react";
import { X, ArrowRight } from "lucide-react";
import { DependencyCreateInput, DependencyType, GraphNode } from "@/lib/types";

interface DependencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DependencyCreateInput) => Promise<void>;
  nodes: GraphNode[];
  initialFromNodeId?: string | null;
}

export const DependencyModal: React.FC<DependencyModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  nodes,
  initialFromNodeId,
}) => {
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [minBuffer, setMinBuffer] = useState<number>(30);
  const [depType, setDepType] = useState<DependencyType>("temporal");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialFromNodeId) {
      setFromId(initialFromNodeId);
      // Pick first available node that isn't fromId
      const candidate = nodes.find((n) => n.id !== initialFromNodeId);
      if (candidate) setToId(candidate.id);
    } else if (nodes.length >= 2) {
      setFromId(nodes[0].id);
      setToId(nodes[1].id);
    }
    setError(null);
  }, [initialFromNodeId, nodes, isOpen]);

  if (!isOpen) return null;

  const fromNode = nodes.find((n) => n.id === fromId);
  const toNode = nodes.find((n) => n.id === toId);

  // Compute preview gap
  let previewGap: number | null = null;
  if (fromNode && toNode) {
    const fromEnd = new Date(fromNode.end_time).getTime();
    const toStart = new Date(toNode.start_time).getTime();
    previewGap = Math.round((toStart - fromEnd) / (1000 * 60));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromId || !toId) {
      setError("Both origin and destination bookings must be selected");
      return;
    }
    if (fromId === toId) {
      setError("Cannot create a dependency edge to the same booking");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        from_booking_id: fromId,
        to_booking_id: toId,
        min_buffer_minutes: Number(minBuffer),
        dependency_type: depType,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create dependency");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#221F1A]/40 p-4">
      <div className="w-full max-w-md border border-[#CEC4B5] bg-[#FFFFFF] p-6">
        <div className="flex items-center justify-between border-b border-[#E5DFD5] pb-3">
          <h2 className="font-serif-heading text-lg font-bold text-[#221F1A]">
            Add Dependency Edge
          </h2>
          <button onClick={onClose} className="p-1 text-[#6E685D] hover:text-[#221F1A]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 border border-[#FCA5A5] bg-[#FEE2E2] p-2 text-xs text-[#991B1B]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[#221F1A] mb-1">From Booking (Origin)</label>
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  [{n.type}] {n.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-center text-[#8E887D]">
            <ArrowRight className="h-4 w-4" />
          </div>

          <div>
            <label className="block font-medium text-[#221F1A] mb-1">To Booking (Downstream)</label>
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id} disabled={n.id === fromId}>
                  [{n.type}] {n.title}
                </option>
              ))}
            </select>
          </div>

          {previewGap != null && (
            <div className="bg-[#FAF7F2] p-2.5 border border-[#E5DFD5] text-[11px] text-[#6E685D]">
              <span className="font-medium text-[#221F1A]">Temporal Gap:</span> {previewGap} minutes between arrival and departure.
              {previewGap < minBuffer && (
                <span className="block mt-1 font-semibold text-[#B91C1C]">
                  Warning: Real gap ({previewGap}m) is less than minimum buffer ({minBuffer}m). This edge will be Violated.
                </span>
              )}
            </div>
          )}

          <div>
            <label className="block font-medium text-[#221F1A] mb-1">
              Minimum Required Buffer (minutes) *
            </label>
            <input
              type="number"
              min="0"
              step="5"
              value={minBuffer}
              onChange={(e) => setMinBuffer(parseInt(e.target.value) || 0)}
              className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
              required
            />
            <span className="text-[10px] text-[#8E887D]">
              The slack value on the edge will be (actual gap minus this buffer).
            </span>
          </div>

          <div>
            <label className="block font-medium text-[#221F1A] mb-1">Dependency Type</label>
            <select
              value={depType}
              onChange={(e) => setDepType(e.target.value as DependencyType)}
              className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
            >
              <option value="temporal">Temporal (Time sequence)</option>
              <option value="location">Location (Physical transit)</option>
              <option value="prerequisite">Prerequisite (Logical sequence)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#E5DFD5] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="border border-[#CEC4B5] px-3.5 py-1.5 font-medium text-[#6E685D] hover:text-[#221F1A]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="border border-[#221F1A] bg-[#221F1A] px-4 py-1.5 font-medium text-[#FAF7F2] hover:bg-[#38332B] disabled:opacity-50"
            >
              {isSubmitting ? "Adding..." : "Add Dependency Edge"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

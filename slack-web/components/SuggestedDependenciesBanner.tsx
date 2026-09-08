"use client";

import React from "react";
import { Sparkles, Check, X } from "lucide-react";
import { GraphNode, SuggestedDependency } from "@/lib/types";

interface SuggestedDependenciesBannerProps {
  suggestions: SuggestedDependency[];
  nodes: GraphNode[];
  onAccept: (suggestion: SuggestedDependency) => void;
  onReject: (suggestion: SuggestedDependency) => void;
}

export const SuggestedDependenciesBanner: React.FC<SuggestedDependenciesBannerProps> = ({
  suggestions,
  nodes,
  onAccept,
  onReject,
}) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="border-b border-[#E5DFD5] bg-[#FFFBF5] px-6 py-2.5">
      <div className="mx-auto flex max-w-7xl flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#D97706]">
          <Sparkles className="h-4 w-4" />
          <span>Dependency Auto-Suggestions ({suggestions.length} pending)</span>
          <span className="text-[11px] font-normal text-[#8E887D]">
            - Relevant nodes are highlighted with an amber pulsing outline on the graph.
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {suggestions.map((sugg, index) => {
            const fromNode = nodes.find((n) => n.id === sugg.from);
            const toNode = nodes.find((n) => n.id === sugg.to);

            const fromTitle = fromNode ? fromNode.title : "Origin Booking";
            const toTitle = toNode ? toNode.title : "Downstream Booking";

            return (
              <div
                key={`${sugg.from}-${sugg.to}-${index}`}
                className="flex flex-wrap items-center justify-between gap-3 border border-[#E5DFD5] bg-[#FFFFFF] px-4 py-2 text-xs"
              >
                <div className="flex items-center gap-2 text-[#221F1A]">
                  <span className="font-semibold text-[#885434]">Suggest:</span>
                  <span className="font-medium underline underline-offset-2">{fromTitle}</span>
                  <span className="text-[#8E887D]">to</span>
                  <span className="font-medium underline underline-offset-2">{toTitle}</span>
                  <span className="text-[#6E685D]">
                    - buffer {sugg.suggested_min_buffer_minutes} minutes
                  </span>
                  <span className="text-[11px] text-[#8E887D] italic">({sugg.reason})</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onAccept(sugg)}
                    className="flex items-center gap-1.5 border border-[#221F1A] bg-[#221F1A] px-3 py-1 text-xs font-medium text-[#FAF7F2] hover:bg-[#38332B] transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept Edge
                  </button>
                  <button
                    onClick={() => onReject(sugg)}
                    className="flex items-center gap-1.5 border border-[#CEC4B5] bg-[#FFFFFF] px-3 py-1 text-xs font-medium text-[#6E685D] hover:text-[#221F1A] hover:border-[#221F1A] transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

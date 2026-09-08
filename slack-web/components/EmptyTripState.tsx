"use client";

import React from "react";
import { Plus, Sparkles, Calendar, ArrowRight } from "lucide-react";

interface EmptyTripStateProps {
  tripName: string;
  onAddBooking: () => void;
  onSeedDemo: () => void;
}

export const EmptyTripState: React.FC<EmptyTripStateProps> = ({
  tripName,
  onAddBooking,
  onSeedDemo,
}) => {
  return (
    <div className="flex h-full min-h-[550px] w-full flex-col items-center justify-center bg-[#FAF7F2] p-8 text-center">
      <div className="mx-auto max-w-lg border border-[#CEC4B5] bg-[#FFFFFF] p-8">
        {/* Notebook-styled Header Icon */}
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center border border-[#221F1A] bg-[#FAF7F2] text-[#221F1A]">
          <Calendar className="h-6 w-6 text-[#221F1A]" />
        </div>

        {/* Title */}
        <h2 className="font-serif-heading text-2xl font-bold text-[#221F1A]">
          {tripName}
        </h2>
        <p className="mt-1 text-xs text-[#8E887D]">Empty Itinerary Graph</p>

        {/* Notebook horizontal ruled lines placeholder */}
        <div className="my-6 space-y-3 px-4">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-[#2B5B84]" />
            <div className="h-px flex-1 border-b border-dashed border-[#E5DFD5]" />
            <span className="text-[11px] font-mono text-[#A39E93]">Flight</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-[#2D6A4F]" />
            <div className="h-px flex-1 border-b border-dashed border-[#E5DFD5]" />
            <span className="text-[11px] font-mono text-[#A39E93]">Transfer</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-[#885434]" />
            <div className="h-px flex-1 border-b border-dashed border-[#E5DFD5]" />
            <span className="text-[11px] font-mono text-[#A39E93]">Hotel</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-[#6D3A6D]" />
            <div className="h-px flex-1 border-b border-dashed border-[#E5DFD5]" />
            <span className="text-[11px] font-mono text-[#A39E93]">Activity</span>
          </div>
        </div>

        <p className="text-xs text-[#6E685D] leading-relaxed max-w-md mx-auto">
          Every booking you record becomes a node in your timeline graph. Temporal buffers between bookings
          are modeled as weighted edges with slack metrics to guard against travel disruptions.
        </p>

        {/* Action Buttons with clear visible labels */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onAddBooking}
            className="w-full sm:w-auto flex items-center justify-center gap-2 border border-[#221F1A] bg-[#221F1A] px-4 py-2 text-xs font-medium text-[#FAF7F2] hover:bg-[#38332B] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add First Booking</span>
          </button>
          <button
            onClick={onSeedDemo}
            className="w-full sm:w-auto flex items-center justify-center gap-2 border border-[#CEC4B5] bg-[#FAF7F2] px-4 py-2 text-xs font-medium text-[#221F1A] hover:bg-[#E5DFD5] transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#D97706]" />
            <span>Seed Multi-City Demo</span>
          </button>
        </div>
      </div>
    </div>
  );
};

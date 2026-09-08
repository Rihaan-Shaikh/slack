"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Zap,
  Layers,
  CloudRain,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  Info,
} from "lucide-react";
import { Trip, TripResilienceResponse } from "@/lib/types";

interface DemoControlBarProps {
  currentTrip: Trip | null;
  resilience: TripResilienceResponse | null;
  activeDisruptionsCount: number;
  onLoadDemoTrip: () => Promise<void>;
  onTriggerSampleDisruption: () => Promise<void>;
  onLoadStressTrip: () => Promise<void>;
  onOpenLiveWeather: () => void;
  isLoading?: boolean;
}

export const DemoControlBar: React.FC<DemoControlBarProps> = ({
  currentTrip,
  resilience,
  activeDisruptionsCount,
  onLoadDemoTrip,
  onTriggerSampleDisruption,
  onLoadStressTrip,
  onOpenLiveWeather,
  isLoading = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isAlpineDemo = currentTrip?.name.includes("Alpine Odyssey");
  const isStressDemo = currentTrip?.name.includes("Grand European");

  return (
    <div className="border-b border-[#CEC4B5] bg-[#FFFFFF] transition-all">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2">
        {/* Left: Demo Pitch Mode Pill & Step Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 border border-[#221F1A] bg-[#221F1A] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#FAF7F2]">
            <Sparkles className="h-3.5 w-3.5 text-[#D97706]" />
            <span>Judge Demo Pitch Mode</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-[#6E685D]">
            <span className="font-medium">3-Click Pitch Arc:</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                !currentTrip || !isAlpineDemo
                  ? "bg-[#F3ECE2] text-[#221F1A] ring-1 ring-[#221F1A]"
                  : "text-[#8E887D] line-through"
              }`}
            >
              1. Load Demo
            </span>
            <ArrowRight className="h-3 w-3 text-[#CEC4B5]" />
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                isAlpineDemo && activeDisruptionsCount === 0
                  ? "bg-[#FEE2E2] text-[#991B1B] ring-1 ring-[#B91C1C]"
                  : activeDisruptionsCount > 0
                  ? "text-[#8E887D] line-through"
                  : "text-[#8E887D]"
              }`}
            >
              2. Trigger LX 354
            </span>
            <ArrowRight className="h-3 w-3 text-[#CEC4B5]" />
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                activeDisruptionsCount > 0
                  ? "bg-[#ECFDF5] text-[#065F46] ring-1 ring-[#059669] animate-pulse"
                  : "text-[#8E887D]"
              }`}
            >
              3. Apply Recovery
            </span>
          </div>
        </div>

        {/* Right: 1-Click Guided Action Buttons */}
        <div className="flex items-center gap-2">
          {/* 1-Click Load Demo Trip Button */}
          <button
            onClick={onLoadDemoTrip}
            disabled={isLoading}
            className="flex items-center gap-1.5 border border-[#221F1A] bg-[#221F1A] px-3 py-1 text-xs font-semibold text-[#FAF7F2] hover:bg-[#38332B] disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
            title="Seed multi-city trip: 7 bookings, 1 tight layover (+15m), 1 overlapping pair"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#FCD34D]" />
            <span>Load Demo Trip</span>
          </button>

          {/* 1-Click Trigger Sample Disruption Button */}
          <button
            onClick={onTriggerSampleDisruption}
            disabled={isLoading || !currentTrip}
            className="flex items-center gap-1.5 border border-[#B91C1C] bg-[#FFF5F5] px-3 py-1 text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2] hover:border-[#991B1B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Pre-filled Flight LX 354 (+60m delay): triggers ripple, breaks shuttle connection (-45m), drops score to Critical"
          >
            <Zap className="h-3.5 w-3.5 text-[#DC2626]" />
            <span>Trigger Sample Disruption</span>
          </button>

          {/* Collapsible More Options: Stress Test & Live Weather */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1 border border-[#CEC4B5] bg-[#FAF7F2] px-2 py-1 text-xs text-[#6E685D] hover:text-[#221F1A] transition-colors"
            title="Show additional stress test and weather tools"
          >
            <span className="text-[11px] font-medium hidden md:inline">Tools</span>
            {isCollapsed ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Tools Drawer (Stress Test & Live Open-Meteo Weather) */}
      {isCollapsed && (
        <div className="border-t border-[#F3ECE2] bg-[#FAF7F2] px-6 py-2.5">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[#6E685D]">
              <Info className="h-3.5 w-3.5 text-[#8E887D]" />
              <span>
                Stress-test graph layout or inject authentic Open-Meteo real-time airport telemetry:
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {/* 16-Booking Stress Test Button */}
              <button
                onClick={onLoadStressTrip}
                disabled={isLoading}
                className="flex items-center gap-1.5 border border-[#CEC4B5] bg-[#FFFFFF] px-2.5 py-1 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2] hover:border-[#221F1A] disabled:opacity-50 transition-colors cursor-pointer"
                title="Seed 16 bookings across 5 days to stress-test the D3 measure-then-fit layout"
              >
                <Layers className="h-3.5 w-3.5 text-[#2B5B84]" />
                <span>16-Booking Stress Test (5 Days)</span>
              </button>

              {/* Live Weather Disruption Button */}
              <button
                onClick={onOpenLiveWeather}
                disabled={isLoading || !currentTrip}
                className="flex items-center gap-1.5 border border-[#CEC4B5] bg-[#FFFFFF] px-2.5 py-1 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2] hover:border-[#221F1A] disabled:opacity-50 transition-colors cursor-pointer"
                title="Fetch real-time weather from Open-Meteo REST API (Zurich, Geneva, London, Paris, Milan)"
              >
                <CloudRain className="h-3.5 w-3.5 text-[#0284C7]" />
                <span>Live Open-Meteo Weather</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

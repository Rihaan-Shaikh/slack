"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  GitBranch,
  List as ListIcon,
  Compass,
  AlertTriangle,
  Maximize2,
  LayoutGrid,
  ShieldAlert,
  Filter,
  Users,
  History,
  LogOut,
  MoreHorizontal,
  Settings,
  Presentation,
  Check,
} from "lucide-react";
import { Trip, TripResilienceResponse, PresenceUser, AuthUser } from "@/lib/types";
import { PresenceAvatars } from "./PresenceAvatars";

interface TripHeaderProps {
  currentTrip: Trip | null;
  trips: Trip[];
  onSelectTrip: (tripId: string) => void;
  onOpenCreateTrip: () => void;
  onOpenAddBooking: () => void;
  onOpenAddDependency: () => void;
  onOpenTriggerDisruption: () => void;
  activeDisruptionsCount: number;
  onOpenImpactPanel?: () => void;
  onFitToScreen?: () => void;
  viewMode: "graph" | "list";
  onChangeViewMode: (mode: "graph" | "list") => void;
  totalBookings: number;
  violatedCount: number;
  tightCount: number;
  resilience?: TripResilienceResponse | null;
  onOpenDashboard?: () => void;
  activeUsers?: PresenceUser[];
  currentClientId?: string;
  showAtRiskOnly?: boolean;
  onToggleAtRiskOnly?: () => void;
  isViewer?: boolean;
  onOpenShare?: () => void;
  onOpenActivity?: () => void;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
  // Phase 2: Pitch mode toggle in overflow menu
  isPitchMode?: boolean;
  onTogglePitchMode?: () => void;
}

export const TripHeader: React.FC<TripHeaderProps> = ({
  currentTrip,
  trips,
  onSelectTrip,
  onOpenCreateTrip,
  onOpenAddBooking,
  onOpenAddDependency,
  onOpenTriggerDisruption,
  activeDisruptionsCount,
  onOpenImpactPanel,
  onFitToScreen,
  viewMode,
  onChangeViewMode,
  totalBookings,
  violatedCount,
  tightCount,
  resilience,
  onOpenDashboard,
  activeUsers = [],
  currentClientId = "",
  showAtRiskOnly = false,
  onToggleAtRiskOnly,
  isViewer = false,
  onOpenShare,
  onOpenActivity,
  currentUser,
  onLogout,
  isPitchMode = false,
  onTogglePitchMode,
}) => {
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close overflow dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(event.target as Node)) {
        setIsOverflowOpen(false);
      }
    }
    if (isOverflowOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOverflowOpen]);

  return (
    <header className="h-14 border-b border-[#E5DFD5] bg-[#FAF7F2] px-4 sm:px-6 flex items-center justify-between select-none z-30 relative">
      {/* Left: Dashboard link & Trip Selector */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 group shrink-0"
          title="Return to Trip Health Dashboard"
        >
          <div className="flex h-8 w-8 items-center justify-center border border-[#221F1A] bg-[#221F1A] text-[#FAF7F2] group-hover:bg-[#38332B] transition-colors">
            <Compass className="h-4 w-4" />
          </div>
          <span className="font-serif-heading text-lg font-bold tracking-tight text-[#221F1A] hidden md:inline">
            Slack
          </span>
        </Link>

        <div className="h-4 w-px bg-[#E5DFD5] shrink-0" />

        {/* Trip dropdown selector */}
        <div className="flex items-center gap-1.5 min-w-0">
          <select
            id="trip-header-select"
            value={currentTrip?.id || ""}
            onChange={(e) => onSelectTrip(e.target.value)}
            className="border border-[#CEC4B5] bg-[#FFFFFF] px-2.5 py-1 text-xs font-bold text-[#221F1A] focus:border-[#221F1A] focus:outline-none max-w-[160px] sm:max-w-[220px] truncate"
          >
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {currentTrip && (
            <Link
              href={`/trips/${currentTrip.id}/settings`}
              className="p-1.5 border border-[#CEC4B5] bg-[#FFFFFF] text-[#6E685D] hover:text-[#221F1A] hover:bg-[#F3ECE2] transition-colors shrink-0"
              title="Trip Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {/* Impact Analysis Drawer Button */}
        {activeDisruptionsCount > 0 && onOpenImpactPanel && (
          <button
            onClick={onOpenImpactPanel}
            className="flex items-center gap-1.5 border border-[#991B1B] bg-[#FFF5F5] px-2 py-1 text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2] transition-colors shrink-0"
            title="View active disruptions and impacted bookings"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {activeDisruptionsCount} Impact{activeDisruptionsCount > 1 ? "s" : ""}
            </span>
          </button>
        )}
      </div>

      {/* Center: View Mode Toggle (Graph / List) */}
      <div className="flex border border-[#CEC4B5] bg-[#FFFFFF] p-0.5 shrink-0 mx-2">
        <button
          onClick={() => onChangeViewMode("graph")}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
            viewMode === "graph"
              ? "bg-[#221F1A] text-[#FAF7F2]"
              : "text-[#6E685D] hover:text-[#221F1A]"
          }`}
        >
          <GitBranch className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Graph</span>
        </button>
        <button
          onClick={() => onChangeViewMode("list")}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
            viewMode === "list"
              ? "bg-[#221F1A] text-[#FAF7F2]"
              : "text-[#6E685D] hover:text-[#221F1A]"
          }`}
        >
          <ListIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">List</span>
        </button>
      </div>

      {/* Right: Primary Actions + Overflow Menu + User profile */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Primary Action: Add Booking */}
        <button
          onClick={onOpenAddBooking}
          disabled={isViewer}
          className="flex items-center gap-1.5 border border-[#221F1A] bg-[#221F1A] px-3 py-1.5 text-xs font-medium text-[#FAF7F2] hover:bg-[#38332B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          title={isViewer ? "Viewer role: read-only" : "Add new booking"}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Booking</span>
        </button>

        {/* Primary Action: Trigger Disruption */}
        <button
          onClick={onOpenTriggerDisruption}
          disabled={totalBookings === 0 || isViewer}
          className="flex items-center gap-1.5 border border-[#B91C1C] bg-[#FFF5F5] px-3 py-1.5 text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2] hover:border-[#991B1B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          title={
            isViewer
              ? "Viewer role: read-only (server enforced)"
              : "Simulate a flight delay or cancellation to compute ripple impact"
          }
        >
          <AlertTriangle className="h-3.5 w-3.5 text-[#B91C1C]" />
          <span className="hidden sm:inline">Disruption</span>
        </button>

        {/* Primary Action: Share */}
        {onOpenShare && (
          <button
            onClick={onOpenShare}
            disabled={isViewer}
            className="flex items-center gap-1 border border-[#CEC4B5] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            title={isViewer ? "Viewer role: read-only" : "Share trip with collaborators"}
          >
            <Users className="h-3.5 w-3.5 text-[#2B5B84]" />
            <span className="hidden sm:inline">Share</span>
          </button>
        )}

        {/* Secondary Overflow Menu ("⋯") */}
        <div className="relative shrink-0" ref={overflowRef}>
          <button
            onClick={() => setIsOverflowOpen((prev) => !prev)}
            aria-label="More actions"
            className={`p-1.5 border transition-colors ${
              isOverflowOpen
                ? "border-[#221F1A] bg-[#221F1A] text-[#FAF7F2]"
                : "border-[#CEC4B5] bg-[#FFFFFF] text-[#6E685D] hover:bg-[#F3ECE2] hover:text-[#221F1A]"
            }`}
            title="More actions and views"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>

          {isOverflowOpen && (
            <div className="absolute right-0 mt-1.5 w-56 border border-[#CEC4B5] bg-[#FFFFFF] py-1 shadow-lg z-50 text-xs text-[#221F1A]">
              {/* Add Dependency */}
              <button
                onClick={() => {
                  setIsOverflowOpen(false);
                  onOpenAddDependency();
                }}
                disabled={totalBookings < 2 || isViewer}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#F3ECE2] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5 text-[#6E685D]" />
                <span>Add Dependency Edge</span>
              </button>

              {/* Fit to Screen */}
              {viewMode === "graph" && onFitToScreen && (
                <button
                  onClick={() => {
                    setIsOverflowOpen(false);
                    onFitToScreen();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#F3ECE2]"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-[#6E685D]" />
                  <span>Fit Graph to Screen</span>
                </button>
              )}

              {/* At-Risk Filter Toggle */}
              {onToggleAtRiskOnly && totalBookings > 0 && (
                <button
                  onClick={() => {
                    setIsOverflowOpen(false);
                    onToggleAtRiskOnly();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#F3ECE2]"
                >
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-[#6E685D]" />
                    <span>Filter: At-Risk Only</span>
                  </div>
                  {showAtRiskOnly && <Check className="h-3.5 w-3.5 text-[#15803D]" />}
                </button>
              )}

              {/* Activity Drawer */}
              {onOpenActivity && (
                <button
                  onClick={() => {
                    setIsOverflowOpen(false);
                    onOpenActivity();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#F3ECE2]"
                >
                  <History className="h-3.5 w-3.5 text-[#885434]" />
                  <span>Activity History Log</span>
                </button>
              )}

              {/* Presence Avatars inside overflow */}
              {activeUsers.length > 0 && (
                <div className="px-3 py-2 border-t border-[#E5DFD5]">
                  <div className="text-[10px] uppercase font-bold text-[#8E887D] mb-1">
                    Collaborators ({activeUsers.length})
                  </div>
                  <PresenceAvatars
                    activeUsers={activeUsers}
                    currentClientId={currentClientId}
                  />
                </div>
              )}

              <div className="my-1 border-t border-[#E5DFD5]" />

              {/* Judge Demo Pitch Mode Toggle */}
              {onTogglePitchMode && (
                <button
                  onClick={() => {
                    setIsOverflowOpen(false);
                    onTogglePitchMode();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#F3ECE2]"
                >
                  <div className="flex items-center gap-2">
                    <Presentation className="h-3.5 w-3.5 text-[#885434]" />
                    <span>Judge Demo Pitch Mode</span>
                  </div>
                  {isPitchMode ? (
                    <span className="text-[9px] bg-[#DCFCE7] text-[#15803D] font-bold px-1 py-0.5 border border-[#86EFAC]">
                      ON
                    </span>
                  ) : (
                    <span className="text-[9px] text-[#8E887D] font-bold">OFF</span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* User Profile & Logout */}
        {currentUser && (
          <div className="flex items-center gap-2 border-l border-[#E5DFD5] pl-2.5 ml-0.5 shrink-0">
            <div className="text-right hidden xl:block">
              <div className="text-xs font-semibold text-[#221F1A] leading-tight truncate max-w-[110px]">
                {currentUser.display_name}
              </div>
              <div className="text-[10px] text-[#8E887D] leading-tight">
                {isViewer ? "Viewer" : "Active"}
              </div>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                id="sign-out-btn"
                title="Sign out"
                className="flex items-center gap-1 border border-[#CEC4B5] bg-[#FFFFFF] p-1.5 text-[#6E685D] hover:bg-[#FEE2E2] hover:text-[#991B1B] hover:border-[#FCA5A5] transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

"use client";

import React from "react";
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
  Lock,
} from "lucide-react";
import { Trip, TripResilienceResponse, PresenceUser, RoleType } from "@/lib/types";
import { ResilienceRing } from "./ResilienceRing";
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
  // Phase 4 Props
  resilience?: TripResilienceResponse | null;
  onOpenDashboard?: () => void;
  activeUsers?: PresenceUser[];
  currentClientId?: string;
  showAtRiskOnly?: boolean;
  onToggleAtRiskOnly?: () => void;
  // Phase 5 Collaboration Props
  currentRole?: RoleType;
  onChangeRole?: (role: RoleType) => void;
  onOpenShare?: () => void;
  onOpenActivity?: () => void;
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
  currentRole = "owner",
  onChangeRole,
  onOpenShare,
  onOpenActivity,
}) => {
  const isViewer = currentRole === "viewer";
  const thinConnectionsCount = resilience?.thin_connections?.length || (violatedCount + tightCount);

  return (
    <header className="border-b border-[#E5DFD5] bg-[#FAF7F2] px-6 py-3.5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        {/* Left: Brand & Trip Selector & Dashboard Button */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center border border-[#221F1A] bg-[#221F1A] text-[#FAF7F2]">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <span className="font-serif-heading text-xl font-bold tracking-tight text-[#221F1A]">
                Slack
              </span>
              <span className="ml-2 text-xs text-[#6E685D] tracking-wide hidden sm:inline">
                Disruption Recovery Engine
              </span>
            </div>
          </div>

          <div className="h-6 w-px bg-[#E5DFD5]" />

          {/* Trip Dropdown and Dashboard trigger */}
          <div className="flex items-center gap-2">
            <select
              value={currentTrip?.id || ""}
              onChange={(e) => onSelectTrip(e.target.value)}
              className="border border-[#CEC4B5] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#221F1A] focus:outline-none focus:border-[#221F1A]"
            >
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            {onOpenDashboard && (
              <button
                onClick={onOpenDashboard}
                className="flex items-center gap-1.5 border border-[#CEC4B5] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2] hover:border-[#221F1A] transition-colors"
                title="View Resilience and Health across all trips"
              >
                <LayoutGrid className="h-3.5 w-3.5 text-[#6E685D]" />
                <span>Dashboard</span>
              </button>
            )}

            <button
              onClick={onOpenCreateTrip}
              className="flex items-center gap-1 border border-[#CEC4B5] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2] hover:border-[#221F1A] transition-colors"
              title="Create a new trip"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden md:inline">New Trip</span>
            </button>
          </div>
        </div>

        {/* Center: Resilience Ring & At-Risk Warnings */}
        <div className="flex items-center gap-3 text-xs">
          {/* Phase 4 Resilience Ring */}
          {resilience && (
            <div
              className="flex items-center gap-2 border border-[#CEC4B5] bg-[#FFFFFF] px-2.5 py-1"
              title={`Resilience Score: ${resilience.score}/100 (${resilience.grade}). ${resilience.safe_edges} safe, ${resilience.tight_edges} tight, ${resilience.violated_edges} violated edges.`}
            >
              <ResilienceRing
                score={resilience.score}
                grade={resilience.grade}
                size="sm"
                showLabel={false}
              />
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[11px] font-bold text-[#221F1A]">
                    {resilience.score}
                  </span>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider ${
                      resilience.grade === "Critical"
                        ? "text-[#DC2626]"
                        : resilience.grade === "Caution"
                        ? "text-[#D97706]"
                        : "text-[#059669]"
                    }`}
                  >
                    {resilience.grade}
                  </span>
                </div>
                <span className="text-[9px] text-[#8E887D]">Resilience</span>
              </div>
            </div>
          )}

          {/* Phase 4: Proactive At-Risk Warning & Filter Button (PROOF POINT: caught before disruption) */}
          {thinConnectionsCount > 0 && onToggleAtRiskOnly && (
            <button
              onClick={onToggleAtRiskOnly}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold border transition-all cursor-pointer ${
                showAtRiskOnly
                  ? "border-[#221F1A] bg-[#221F1A] text-[#FAF7F2]"
                  : "border-[#FCD34D] bg-[#FFFBEB] text-[#92400E] hover:bg-[#FEF3C7]"
              }`}
              title="Filter graph to view only tight and violated connections"
            >
              <ShieldAlert
                className={`h-3.5 w-3.5 ${
                  showAtRiskOnly ? "text-[#FCD34D]" : "text-[#D97706]"
                }`}
              />
              <span>
                {showAtRiskOnly
                  ? "Showing At-Risk Only"
                  : `View at-risk connections (${thinConnectionsCount})`}
              </span>
              {showAtRiskOnly && (
                <span className="ml-1 text-[10px] underline opacity-80">
                  (Reset)
                </span>
              )}
            </button>
          )}

          {/* Active Disruption Button */}
          {activeDisruptionsCount > 0 && (
            <button
              onClick={onOpenImpactPanel}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] font-semibold text-xs hover:bg-[#FECACA] transition-colors cursor-pointer"
              title="Click to view disruption ripple impact"
            >
              <span className="inline-block h-2 w-2 rounded-full bg-[#B91C1C] animate-pulse" />
              <span>
                {activeDisruptionsCount} Active{" "}
                {activeDisruptionsCount === 1 ? "Disruption" : "Disruptions"}
              </span>
            </button>
          )}
        </div>

        {/* Right: View Toggles, Actions, and Collaborator Presence Avatars */}
        <div className="flex items-center gap-2.5">
          {/* Phase 5 Role Switcher for Demoing Multi-Traveler Access */}
          {onChangeRole && (
            <div className="flex items-center gap-1 border border-[#CEC4B5] bg-[#FFFFFF] px-2 py-1 text-xs">
              <span className="text-[10px] uppercase font-bold text-[#8E887D]">Role:</span>
              <select
                value={currentRole}
                onChange={(e) => onChangeRole(e.target.value as RoleType)}
                className="bg-transparent font-medium text-[#221F1A] focus:outline-none cursor-pointer"
                title="Switch account identity to test multi-traveler collaboration and viewer restrictions"
              >
                <option value="owner">Aisha (Owner)</option>
                <option value="editor">Charlie (Editor)</option>
                <option value="viewer">Bob (Viewer - Read-only)</option>
              </select>
              {isViewer && <Lock className="h-3 w-3 text-[#D97706]" />}
            </div>
          )}

          {/* Phase 5 Share Trip Button */}
          {onOpenShare && (
            <button
              onClick={onOpenShare}
              className="flex items-center gap-1.5 border border-[#221F1A] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#221F1A] hover:bg-[#F3ECE2] hover:border-[#221F1A] transition-colors cursor-pointer"
              title="Invite collaborators & manage permissions"
            >
              <Users className="h-3.5 w-3.5 text-[#2B5B84]" />
              <span>Share</span>
            </button>
          )}

          {/* Phase 5 Activity Feed Button */}
          {onOpenActivity && (
            <button
              onClick={onOpenActivity}
              className="flex items-center gap-1.5 border border-[#CEC4B5] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2] transition-colors cursor-pointer"
              title="View reverse-chronological trip activity feed"
            >
              <History className="h-3.5 w-3.5 text-[#6E685D]" />
              <span className="hidden sm:inline">Activity</span>
            </button>
          )}

          {/* Phase 4 Presence Avatars */}
          <PresenceAvatars
            activeUsers={activeUsers}
            currentClientId={currentClientId}
          />

          {/* View Mode Toggle */}
          <div className="flex border border-[#CEC4B5] bg-[#FFFFFF] p-0.5">
            <button
              onClick={() => onChangeViewMode("graph")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors ${
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
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-[#221F1A] text-[#FAF7F2]"
                  : "text-[#6E685D] hover:text-[#221F1A]"
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>

          {/* Fit to Screen control */}
          {viewMode === "graph" && onFitToScreen && (
            <button
              onClick={onFitToScreen}
              className="flex items-center gap-1 border border-[#CEC4B5] bg-[#FFFFFF] p-1.5 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2] hover:border-[#221F1A] transition-colors"
              title="Fit graph to viewport"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Trigger Disruption Control */}
          <button
            onClick={onOpenTriggerDisruption}
            disabled={totalBookings === 0 || isViewer}
            className="flex items-center gap-1.5 border border-[#B91C1C] bg-[#FFF5F5] px-3 py-1.5 text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2] hover:border-[#991B1B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={
              isViewer
                ? "Viewer role has read-only access (mutations restricted)"
                : "Simulate a flight delay or cancellation to compute ripple impact"
            }
          >
            <AlertTriangle className="h-3.5 w-3.5 text-[#B91C1C]" />
            <span className="hidden sm:inline">Trigger Disruption</span>
          </button>

          {/* Secondary Action: Add Dependency */}
          <button
            onClick={onOpenAddDependency}
            disabled={totalBookings < 2 || isViewer}
            className="hidden lg:flex items-center gap-1.5 border border-[#CEC4B5] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2] hover:border-[#221F1A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={isViewer ? "Viewer role has read-only access" : "Add dependency edge"}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Dependency</span>
          </button>

          {/* Primary Action: Add Booking */}
          <button
            onClick={onOpenAddBooking}
            disabled={isViewer}
            className="flex items-center gap-1.5 border border-[#221F1A] bg-[#221F1A] px-3 py-1.5 text-xs font-medium text-[#FAF7F2] hover:bg-[#38332B] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={isViewer ? "Viewer role has read-only access" : "Add new booking"}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Booking</span>
          </button>
        </div>
      </div>
    </header>
  );
};

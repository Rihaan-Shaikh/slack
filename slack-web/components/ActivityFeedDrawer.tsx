"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  X,
  History,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  UserPlus,
  GitBranch,
  Trash2,
  Clock,
} from "lucide-react";
import { ActivityFeedItem, Trip } from "@/lib/types";
import { getTripActivity } from "@/lib/api";

interface ActivityFeedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip | null;
  latestEventTimestamp?: string;
}

export const ActivityFeedDrawer: React.FC<ActivityFeedDrawerProps> = ({
  isOpen,
  onClose,
  trip,
  latestEventTimestamp,
}) => {
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchActivity = useCallback(async () => {
    if (!trip) return;
    try {
      setIsLoading(true);
      const res = await getTripActivity(trip.id, 50);
      setActivities(res.activities);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [trip]);

  useEffect(() => {
    if (isOpen && trip) {
      fetchActivity();
    }
  }, [isOpen, trip, fetchActivity, latestEventTimestamp]);

  if (!isOpen || !trip) return null;

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffSecs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (diffSecs < 10) return "Just now";
      if (diffSecs < 60) return `${diffSecs}s ago`;
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return new Date(isoString).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "BOOKING_CREATED":
        return <Calendar className="h-3.5 w-3.5 text-[#059669]" />;
      case "BOOKING_UPDATED":
        return <Clock className="h-3.5 w-3.5 text-[#2563EB]" />;
      case "BOOKING_DELETED":
        return <Trash2 className="h-3.5 w-3.5 text-[#DC2626]" />;
      case "DEPENDENCY_CREATED":
      case "DEPENDENCY_DELETED":
        return <GitBranch className="h-3.5 w-3.5 text-[#475569]" />;
      case "DISRUPTION_TRIGGERED":
        return <AlertTriangle className="h-3.5 w-3.5 text-[#D97706]" />;
      case "DISRUPTION_RESOLVED":
        return <CheckCircle2 className="h-3.5 w-3.5 text-[#059669]" />;
      case "RECOVERY_APPLIED":
        return <Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />;
      case "MEMBER_INVITED":
      case "MEMBER_JOINED":
      case "MEMBER_REMOVED":
        return <UserPlus className="h-3.5 w-3.5 text-[#0D9488]" />;
      default:
        return <History className="h-3.5 w-3.5 text-[#6E685D]" />;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-[#221F1A] bg-[#FAF7F2] shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E5DFD5] p-4 bg-[#F3ECE2]">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center bg-[#221F1A] text-[#FAF7F2]">
            <History className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-serif-heading text-sm font-bold text-[#221F1A]">
              Activity Feed
            </h2>
            <p className="text-[10px] text-[#6E685D] truncate max-w-[200px]">{trip.name}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-[#6E685D] hover:text-[#221F1A] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Feed Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && activities.length === 0 && (
          <div className="py-8 text-center text-xs text-[#8E887D]">Loading activity history...</div>
        )}

        {!isLoading && activities.length === 0 && (
          <div className="py-8 text-center text-xs text-[#8E887D]">
            No activity recorded yet for this trip.
          </div>
        )}

        {activities.map((item, idx) => (
          <div
            key={item.id || idx}
            className="flex items-start gap-2.5 border border-[#E5DFD5] bg-[#FFFFFF] p-2.5 shadow-2xs text-xs"
          >
            <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#F3ECE2] shrink-0">
              {getActionIcon(item.action_type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="font-bold text-[#221F1A] truncate">{item.actor_name}</span>
                <span className="text-[10px] font-mono text-[#8E887D] shrink-0">
                  {formatRelativeTime(item.created_at)}
                </span>
              </div>
              <p className="text-[#475569] text-[11px] leading-snug">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-[#E5DFD5] p-3 bg-[#FAF7F2] text-center">
        <span className="text-[10px] text-[#8E887D] flex items-center justify-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#059669] animate-pulse" />
          Live event synchronization active
        </span>
      </div>
    </div>
  );
};

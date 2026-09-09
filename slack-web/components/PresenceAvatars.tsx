"use client";

import React, { useState } from "react";
import { Users } from "lucide-react";
import { PresenceUser } from "@/lib/types";

interface PresenceAvatarsProps {
  activeUsers: PresenceUser[];
  currentClientId: string;
}

export const PresenceAvatars: React.FC<PresenceAvatarsProps> = ({
  activeUsers,
  currentClientId,
}) => {
  const [hoveredUser, setHoveredUser] = useState<PresenceUser | null>(null);

  if (activeUsers.length === 0) return null;

  return (
    <div className="relative flex items-center">
      <div className="flex items-center -space-x-2">
        {activeUsers.slice(0, 4).map((user) => {
          const isMe = user.client_id === currentClientId;
          const initials = user.client_name
            ? user.client_name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .substring(0, 2)
                .toUpperCase()
            : "U";

          return (
            <div
              key={user.client_id}
              onMouseEnter={() => setHoveredUser(user)}
              onMouseLeave={() => setHoveredUser(null)}
              className="relative cursor-pointer transition-transform hover:scale-110 hover:z-20"
              title={`${user.client_name}${isMe ? " (You)" : ""}`}
            >
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--background)] text-[10px] font-bold text-white shadow-xs"
                style={{ backgroundColor: user.avatar_color || "var(--foreground)" }}
              >
                {initials}
              </div>

              {/* Active green indicator dot */}
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-[var(--background)] bg-[#10B981]" />
            </div>
          );
        })}

        {activeUsers.length > 4 && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--background)] bg-[var(--border)] text-[10px] font-bold text-[var(--muted-foreground)] shadow-xs">
            +{activeUsers.length - 4}
          </div>
        )}
      </div>

      {/* Floating tooltip on hover */}
      {hoveredUser && (
        <div className="pointer-events-none absolute right-0 top-9 z-30 whitespace-nowrap border border-[var(--foreground)] bg-[var(--card)] px-2.5 py-1.5 text-xs shadow-md">
          <div className="font-medium text-[var(--foreground)]">
            {hoveredUser.client_name}
            {hoveredUser.client_id === currentClientId && (
              <span className="ml-1 text-[10px] text-[#059669] font-bold">(You)</span>
            )}
          </div>
          <div className="text-[10px] text-[var(--muted-foreground)]">
            Viewing trip • Live sync active
          </div>
        </div>
      )}
    </div>
  );
};

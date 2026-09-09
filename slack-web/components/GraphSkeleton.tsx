"use client";

import React from "react";

export const GraphSkeleton: React.FC = () => {
  return (
    <div className="relative h-full w-full bg-[var(--background)] overflow-hidden">
      {/* Background timeline grid */}
      <div className="absolute inset-0 pointer-events-none">
        <svg width="100%" height="100%" className="opacity-20">
          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="var(--border)" strokeWidth="0.5"/>
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Faint day separators */}
          <line x1="33%" y1="0" x2="33%" y2="100%" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="66%" y1="0" x2="66%" y2="100%" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="4 4" />
        </svg>
      </div>

      <div className="absolute top-6 left-6 text-xs text-[#8E887D] font-mono skeleton-pulse">
        Computing NetworkX DAG & edge slack...
      </div>

      {/* Simulated time-anchored layout */}
      <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-64 flex items-center">
        {/* Track 0 */}
        <div className="absolute w-full border-t border-[var(--border)] top-16" />
        {/* Track 1 */}
        <div className="absolute w-full border-t border-[var(--border)] top-32" />
        {/* Track 2 */}
        <div className="absolute w-full border-t border-[var(--border)] top-48" />

        {/* Nodes simulating time spacing */}
        <div className="absolute left-[15%] top-16 -translate-x-1/2 -translate-y-1/2">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--border-strong)] bg-[var(--card)] skeleton-pulse" />
          <div className="mt-2 h-2.5 w-16 bg-[var(--border)] skeleton-pulse" />
        </div>

        <div className="absolute left-[25%] top-32 -translate-x-1/2 -translate-y-1/2">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--border-strong)] bg-[var(--card)] skeleton-pulse" />
          <div className="mt-2 h-2.5 w-20 bg-[var(--border)] skeleton-pulse" />
        </div>

        <div className="absolute left-[50%] top-16 -translate-x-1/2 -translate-y-1/2">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--border-strong)] bg-[var(--card)] skeleton-pulse" />
          <div className="mt-2 h-2.5 w-16 bg-[var(--border)] skeleton-pulse" />
        </div>

        <div className="absolute left-[65%] top-48 -translate-x-1/2 -translate-y-1/2">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--border-strong)] bg-[var(--card)] skeleton-pulse" />
          <div className="mt-2 h-2.5 w-16 bg-[var(--border)] skeleton-pulse" />
        </div>
        
        <div className="absolute left-[85%] top-32 -translate-x-1/2 -translate-y-1/2">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--border-strong)] bg-[var(--card)] skeleton-pulse" />
          <div className="mt-2 h-2.5 w-12 bg-[var(--border)] skeleton-pulse" />
        </div>

        {/* Edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <path d="M 15% 64 Q 20% 64 25% 128" fill="none" stroke="var(--border)" strokeWidth="2" className="skeleton-pulse" />
          <path d="M 25% 128 Q 37.5% 128 50% 64" fill="none" stroke="var(--border)" strokeWidth="2" className="skeleton-pulse" />
          <path d="M 50% 64 Q 57.5% 64 65% 192" fill="none" stroke="var(--border)" strokeWidth="2" className="skeleton-pulse" />
          <path d="M 65% 192 Q 75% 192 85% 128" fill="none" stroke="var(--border)" strokeWidth="2" className="skeleton-pulse" />
        </svg>
      </div>
    </div>
  );
};

"use client";

import React from "react";

export const GraphSkeleton: React.FC = () => {
  return (
    <div className="relative h-full w-full bg-[#FAF7F2] p-8 flex flex-col justify-between overflow-hidden">
      {/* Top faint timeline labels */}
      <div className="flex items-center justify-between border-b border-[#E5DFD5] pb-3 text-xs text-[#8E887D]">
        <div className="h-4 w-28 bg-[#E5DFD5] skeleton-pulse" />
        <div className="h-4 w-32 bg-[#E5DFD5] skeleton-pulse" />
        <div className="h-4 w-28 bg-[#E5DFD5] skeleton-pulse" />
      </div>

      {/* Center timeline graph placeholder */}
      <div className="relative my-auto flex items-center justify-around w-full py-16">
        {/* Faint connecting line */}
        <div className="absolute top-1/2 left-16 right-16 -translate-y-1/2 border-t-2 border-dashed border-[#E5DFD5]" />

        {/* 4 skeleton nodes */}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="relative z-10 flex flex-col items-center gap-2">
            <div className="h-16 w-16 rounded-full border-2 border-[#E5DFD5] bg-[#FFFFFF] skeleton-pulse flex items-center justify-center">
              <div className="h-4 w-8 bg-[#F3ECE2]" />
            </div>
            <div className="h-3 w-20 bg-[#E5DFD5] skeleton-pulse" />
            <div className="h-2.5 w-14 bg-[#F3ECE2] skeleton-pulse" />
          </div>
        ))}
      </div>

      {/* Bottom status text */}
      <div className="flex items-center justify-between border-t border-[#E5DFD5] pt-3 text-xs text-[#8E887D]">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#D97706] skeleton-pulse" />
          <span>Computing NetworkX dependency graph and edge slack...</span>
        </div>
        <div className="h-3 w-24 bg-[#E5DFD5] skeleton-pulse" />
      </div>
    </div>
  );
};

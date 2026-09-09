"use client";

import React from "react";

interface ResilienceRingProps {
  score: number; // 0 to 100
  grade?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export const ResilienceRing: React.FC<ResilienceRingProps> = ({
  score,
  grade,
  size = "md",
  showLabel = false,
}) => {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  // Dimensions based on size
  const config = {
    sm: { dimension: 28, strokeWidth: 3, radius: 11, fontSize: "9px" },
    md: { dimension: 36, strokeWidth: 3.5, radius: 14, fontSize: "11px" },
    lg: { dimension: 52, strokeWidth: 4.5, radius: 21, fontSize: "15px" },
  }[size];

  const circumference = 2 * Math.PI * config.radius;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  // Colors according to grade
  let strokeColor = "#059669"; // Emerald (Robust)
  let badgeBg = "#ECFDF5";
  let badgeText = "#065F46";
  let badgeBorder = "#A7F3D0";

  if (clampedScore < 50) {
    strokeColor = "#DC2626"; // Red (Critical)
    badgeBg = "#FEF2F2";
    badgeText = "#991B1B";
    badgeBorder = "#FECACA";
  } else if (clampedScore < 80) {
    strokeColor = "var(--accent)"; // Amber (Caution)
    badgeBg = "#FFFBEB";
    badgeText = "#92400E";
    badgeBorder = "#FDE68A";
  }

  return (
    <div className="inline-flex items-center gap-2">
      <div
        className="relative inline-flex items-center justify-center select-none"
        style={{ width: config.dimension, height: config.dimension }}
      >
        <svg
          width={config.dimension}
          height={config.dimension}
          className="-rotate-90 transform"
        >
          {/* Background circle track */}
          <circle
            cx={config.dimension / 2}
            cy={config.dimension / 2}
            r={config.radius}
            stroke="var(--border)"
            strokeWidth={config.strokeWidth}
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx={config.dimension / 2}
            cy={config.dimension / 2}
            r={config.radius}
            stroke={strokeColor}
            strokeWidth={config.strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="none"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        {/* Centered score number */}
        <span
          className="absolute font-mono font-bold tracking-tighter"
          style={{
            fontSize: config.fontSize,
            color: strokeColor,
          }}
        >
          {clampedScore}
        </span>
      </div>

      {showLabel && grade && (
        <span
          className="px-1.5 py-0.5 text-[10px] font-semibold border rounded-none uppercase tracking-wider"
          style={{
            backgroundColor: badgeBg,
            color: badgeText,
            borderColor: badgeBorder,
          }}
        >
          {grade}
        </span>
      )}
    </div>
  );
};

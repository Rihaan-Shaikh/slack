"use client";

import React from "react";

export function HelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#221F1A]/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] p-6 shadow-xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">×</button>
        <h2 className="font-serif-heading text-2xl font-bold mb-4">How it works</h2>
        <div className="space-y-4 text-sm text-[var(--muted-foreground)] leading-relaxed">
          <p>
            <strong>Slack</strong> is the buffer time between your bookings. If you have a flight landing at 10:00 and a train leaving at 12:00, your slack is 2 hours.
          </p>
          <p>
            When a delay happens, our <strong>Ripple Engine</strong> simulates how that delay pushes into your slack. If it eats up all your slack, downstream bookings are marked at-risk or missed.
          </p>
          <p>
            To fix it, the <strong>Recovery Engine</strong> suggests options to rebook, shift, or drop the affected bookings, preserving as much of your original itinerary as possible.
          </p>
        </div>
      </div>
    </div>
  );
}

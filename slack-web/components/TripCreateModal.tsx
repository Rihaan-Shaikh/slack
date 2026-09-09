"use client";

import React, { useState } from "react";
import { Compass, X } from "lucide-react";

interface TripCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTrip: (name: string) => Promise<void>;
}

export const TripCreateModal: React.FC<TripCreateModalProps> = ({
  isOpen,
  onClose,
  onCreateTrip,
}) => {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a trip name");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onCreateTrip(name.trim());
      setName("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--foreground)]/40 p-4">
      <div className="w-full max-w-md border border-[var(--border-strong)] bg-[var(--card)] p-6">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center bg-[var(--foreground)] text-[var(--background)]">
              <Compass className="h-4 w-4" />
            </div>
            <span className="font-serif-heading text-lg font-bold text-[var(--foreground)]">
              Create New Trip
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 border border-[#FCA5A5] bg-[#FEE2E2] p-2 text-xs text-[#991B1B]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[var(--foreground)] mb-1">
              Trip Itinerary Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. London & Paris Summer 2026"
              className="w-full border border-[var(--border-strong)] p-2 text-xs text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
              required
              autoFocus
            />
            <p className="mt-1 text-[11px] text-[#8E887D]">
              A trip graph will be created to track dependencies and slack between your bookings.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="border border-[var(--border-strong)] px-3.5 py-1.5 font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="border border-[var(--foreground)] bg-[var(--foreground)] px-4 py-1.5 font-medium text-[var(--background)] hover:bg-[#38332B] disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Create Trip"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

"use client";

import React, { useEffect, useState } from "react";
import { X, Compass, Plus, AlertTriangle, ArrowRight, ShieldCheck, CheckCircle } from "lucide-react";
import { Trip, TripResilienceResponse } from "@/lib/types";
import { getTripResilience } from "@/lib/api";
import { ResilienceRing } from "./ResilienceRing";

interface TripDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  trips: Trip[];
  currentTripId: string | null;
  onSelectTrip: (tripId: string) => void;
  onOpenCreateTrip: () => void;
  onSeedDemoTrip?: () => Promise<void>;
  onSeedStressTrip?: () => Promise<void>;
}

export const TripDashboardModal: React.FC<TripDashboardModalProps> = ({
  isOpen,
  onClose,
  trips,
  currentTripId,
  onSelectTrip,
  onOpenCreateTrip,
  onSeedDemoTrip,
  onSeedStressTrip,
}) => {
  const [resilienceMap, setResilienceMap] = useState<Record<string, TripResilienceResponse>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || trips.length === 0) return;

    let isMounted = true;
    setIsLoading(true);

    Promise.all(
      trips.map((t) =>
        getTripResilience(t.id)
          .then((res) => ({ id: t.id, res }))
          .catch(() => null)
      )
    ).then((results) => {
      if (!isMounted) return;
      const newMap: Record<string, TripResilienceResponse> = {};
      results.forEach((item) => {
        if (item) {
          newMap[item.id] = item.res;
        }
      });
      setResilienceMap(newMap);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, trips]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#221F1A]/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col border border-[#221F1A] bg-[#FAF7F2] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5DFD5] bg-[#FFFFFF] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-[#221F1A] bg-[#221F1A] text-[#FAF7F2]">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif-heading text-xl font-bold text-[#221F1A]">
                Trip Health & Resilience Dashboard
              </h2>
              <p className="text-xs text-[#6E685D]">
                Proactive connection risk monitoring across all trips
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onSeedDemoTrip && (
              <button
                onClick={async () => {
                  await onSeedDemoTrip();
                  onClose();
                }}
                className="hidden sm:flex items-center gap-1.5 border border-[#221F1A] bg-[#221F1A] px-2.5 py-1.5 text-xs font-semibold text-[#FAF7F2] hover:bg-[#38332B]"
                title="Seed Alpine Odyssey demo trip"
              >
                <Compass className="h-3.5 w-3.5 text-[#FCD34D]" />
                <span>Load Demo Trip</span>
              </button>
            )}
            {onSeedStressTrip && (
              <button
                onClick={async () => {
                  await onSeedStressTrip();
                  onClose();
                }}
                className="hidden md:flex items-center gap-1.5 border border-[#CEC4B5] bg-[#FFFFFF] px-2.5 py-1.5 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2]"
                title="Seed 16-booking stress trip"
              >
                <span>16-Booking Stress</span>
              </button>
            )}
            <button
              onClick={() => {
                onClose();
                onOpenCreateTrip();
              }}
              className="flex items-center gap-1.5 border border-[#CEC4B5] bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Trip</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-[#6E685D] hover:bg-[#F3ECE2] hover:text-[#221F1A]"
              aria-label="Close dashboard"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {trips.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#6E685D]">
              <Compass className="mx-auto h-8 w-8 text-[#CEC4B5] mb-2" />
              <p className="font-semibold text-[#221F1A]">No trips recorded yet</p>
              <p className="text-xs text-[#8E887D] mt-1 mb-4">
                Seed a complete realistic scenario or create a blank trip to begin.
              </p>
              <div className="flex items-center justify-center gap-2">
                {onSeedDemoTrip && (
                  <button
                    onClick={async () => {
                      await onSeedDemoTrip();
                      onClose();
                    }}
                    className="border border-[#221F1A] bg-[#221F1A] px-3.5 py-1.5 text-xs font-semibold text-[#FAF7F2] hover:bg-[#38332B]"
                  >
                    Load Demo Trip
                  </button>
                )}
                <button
                  onClick={() => {
                    onClose();
                    onOpenCreateTrip();
                  }}
                  className="border border-[#CEC4B5] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-medium text-[#221F1A] hover:bg-[#F3ECE2]"
                >
                  Create Custom Trip
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {trips.map((trip) => {
                const res = resilienceMap[trip.id];
                const isSelected = trip.id === currentTripId;
                const thinConns = res?.thin_connections || [];
                const hasThinLayover = thinConns.length > 0;

                return (
                  <div
                    key={trip.id}
                    onClick={() => {
                      onSelectTrip(trip.id);
                      onClose();
                    }}
                    className={`group relative flex cursor-pointer flex-col justify-between border bg-[#FFFFFF] p-5 transition-all hover:border-[#221F1A] hover:shadow-md ${
                      isSelected
                        ? "border-[#221F1A] ring-1 ring-[#221F1A]"
                        : "border-[#CEC4B5]"
                    }`}
                  >
                    <div>
                      {/* Top Row: Trip Name and Resilience Ring */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-serif-heading text-base font-bold text-[#221F1A] group-hover:text-[#D97706] transition-colors">
                              {trip.name}
                            </h3>
                            {isSelected && (
                              <span className="bg-[#221F1A] px-1.5 py-0.5 text-[9px] font-bold text-[#FAF7F2]">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-[#8E887D]">
                            Created {new Date(trip.created_at).toLocaleDateString()}
                          </div>
                        </div>

                        {/* Resilience Ring */}
                        {res ? (
                          <div className="flex flex-col items-end">
                            <ResilienceRing
                              score={res.score}
                              grade={res.grade}
                              size="md"
                              showLabel={true}
                            />
                            <span className="mt-1 text-[9.5px] font-semibold text-[#8E887D]">
                              Resilience
                            </span>
                          </div>
                        ) : (
                          <div className="h-9 w-9 animate-pulse rounded-full bg-[#F3ECE2]" />
                        )}
                      </div>

                      {/* Warning Badge for Thin Connections (PROOF POINT: Proactive without disruptions) */}
                      {hasThinLayover && (
                        <div className="mt-3 flex items-start gap-2 border border-[#FCD34D] bg-[#FFFBEB] p-2.5 text-xs text-[#92400E]">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-[#D97706] mt-0.5" />
                          <div className="flex-1">
                            <div className="font-bold text-[#78350F]">
                              {thinConns[0].status === "violated"
                                ? "Critical Connection Risk"
                                : "Thin Connection Risk Caught"}
                            </div>
                            <div className="text-[11px] text-[#92400E]">
                              {thinConns[0].from_booking_title} →{" "}
                              {thinConns[0].to_booking_title} (
                              {Math.round(thinConns[0].actual_gap_minutes)}m layover,{" "}
                              {Math.round(thinConns[0].slack_minutes)}m slack)
                            </div>
                          </div>
                        </div>
                      )}

                      {!hasThinLayover && res && res.total_edges > 0 && (
                        <div className="mt-3 flex items-center gap-1.5 border border-[#A7F3D0] bg-[#ECFDF5] px-2.5 py-1.5 text-[11px] text-[#065F46]">
                          <CheckCircle className="h-3.5 w-3.5 text-[#059669]" />
                          <span>All connections buffered safely ({res.safe_edges} safe edges)</span>
                        </div>
                      )}
                    </div>

                    {/* Footer Stats & Open Action */}
                    <div className="mt-4 flex items-center justify-between border-t border-[#F3ECE2] pt-3 text-xs text-[#6E685D]">
                      <div className="flex items-center gap-3 text-[11px]">
                        {res && (
                          <>
                            <span>{res.total_edges} connections</span>
                            {res.tight_edges > 0 && (
                              <span className="font-semibold text-[#D97706]">
                                {res.tight_edges} tight
                              </span>
                            )}
                            {res.violated_edges > 0 && (
                              <span className="font-semibold text-[#DC2626]">
                                {res.violated_edges} violated
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-[11px] font-bold text-[#221F1A] group-hover:translate-x-0.5 transition-transform">
                        <span>Open Trip</span>
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

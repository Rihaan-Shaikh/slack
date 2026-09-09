"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, X, CloudRain, RefreshCw } from "lucide-react";
import { DisruptionCreateInput, DisruptionType, GraphNode, AirportWeather } from "@/lib/types";
import { fetchAirportWeather } from "@/lib/api";

interface TriggerDisruptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DisruptionCreateInput) => Promise<void>;
  nodes: GraphNode[];
}

export const TriggerDisruptionModal: React.FC<TriggerDisruptionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  nodes,
}) => {
  const [selectedBookingId, setSelectedBookingId] = useState<string>(
    nodes.length > 0 ? nodes[0].id : ""
  );

  React.useEffect(() => {
    if (isOpen && nodes.length > 0 && (!selectedBookingId || !nodes.some((n) => n.id === selectedBookingId))) {
      setSelectedBookingId(nodes[0].id);
    }
  }, [isOpen, nodes, selectedBookingId]);

  const [disruptionType, setDisruptionType] = useState<DisruptionType>("delay");
  const [delayMinutes, setDelayMinutes] = useState<number>(90);
  const [description, setDescription] = useState<string>(
    "Air traffic flow management delay at departure airport"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live Weather integration
  const [airportWeatherList, setAirportWeatherList] = useState<AirportWeather[]>([]);
  const [selectedAirportCode, setSelectedAirportCode] = useState<string>("ZRH");
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);

  const applyWeatherDelay = (w: AirportWeather) => {
    setDelayMinutes(w.suggested_delay_minutes);
    setDescription(
      `Live Weather Disruption (${w.airport_name}): ${w.weather_description}, ${w.temperature_c}°C, wind ${w.wind_speed_kmh} km/h (gusts ${w.wind_gusts_kmh} km/h). Ground stop delay: ${w.suggested_delay_minutes}m.`
    );
  };

  const loadWeather = async () => {
    try {
      setIsLoadingWeather(true);
      const data = await fetchAirportWeather();
      setAirportWeatherList(data);
      const zrh = data.find((a) => a.airport === "ZRH") || data[0];
      if (zrh) {
        setSelectedAirportCode(zrh.airport);
        applyWeatherDelay(zrh);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoadingWeather(false);
    }
  };

  useEffect(() => {
    if (isOpen && disruptionType === "weather" && airportWeatherList.length === 0) {
      loadWeather();
    }
  }, [isOpen, disruptionType, airportWeatherList.length]);

  const handleSelectAirport = (code: string) => {
    setSelectedAirportCode(code);
    const found = airportWeatherList.find((a) => a.airport === code);
    if (found) {
      applyWeatherDelay(found);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookingId) {
      setError("Please select an affected booking");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        booking_id: selectedBookingId,
        disruption_type: disruptionType,
        delay_minutes: disruptionType === "delay" ? Number(delayMinutes) : 0,
        description: description.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger disruption");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#221F1A]/40 p-4">
      <div className="w-full max-w-md border border-[#CEC4B5] bg-[#FFFFFF] p-6 shadow-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5DFD5] pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center bg-[#B91C1C] text-[#FAF7F2]">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <h2 className="font-serif-heading text-lg font-bold text-[#221F1A]">
              Trigger Disruption
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#6E685D] hover:text-[#221F1A] transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 border border-[#FCA5A5] bg-[#FEE2E2] p-2 text-xs text-[#991B1B]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* Affected Booking Selection */}
          <div>
            <label className="block font-medium text-[#221F1A] mb-1">
              Select Disrupted Booking *
            </label>
            <select
              value={selectedBookingId}
              onChange={(e) => setSelectedBookingId(e.target.value)}
              className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none bg-[#FFFFFF]"
              required
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  [{n.type.toUpperCase()}] {n.title} ({n.start_time.split("T")[1].substring(0, 5)})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-[#8E887D]">
              The engine will recompute downstream edges and ripple impact outward in BFS order.
            </p>
          </div>

          {/* Disruption Type */}
          <div>
            <label className="block font-medium text-[#221F1A] mb-1">Disruption Type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(["delay", "cancellation", "weather", "other"] as DisruptionType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setDisruptionType(t)}
                  className={`border py-1.5 text-center capitalize text-xs font-medium transition-colors ${
                    disruptionType === t
                      ? "border-[#221F1A] bg-[#221F1A] text-[#FAF7F2]"
                      : "border-[#CEC4B5] bg-[#FAF7F2] text-[#6E685D] hover:border-[#221F1A]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Delay Minutes (conditional) */}
          {disruptionType === "delay" && (
            <div>
              <label className="block font-medium text-[#221F1A] mb-1">
                Delay Duration (minutes) *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={delayMinutes}
                  onChange={(e) => setDelayMinutes(parseInt(e.target.value) || 0)}
                  className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
                  required
                />
                <div className="flex gap-1">
                  {[30, 60, 90, 120].map((mins) => (
                    <button
                      type="button"
                      key={mins}
                      onClick={() => setDelayMinutes(mins)}
                      className={`border px-2 py-1.5 text-[10px] font-medium transition-colors ${
                        delayMinutes === mins
                          ? "border-[#B91C1C] bg-[#FEE2E2] text-[#991B1B]"
                          : "border-[#CEC4B5] bg-[#FFFFFF] text-[#6E685D] hover:border-[#221F1A]"
                      }`}
                    >
                      +{mins}m
                    </button>
                  ))}
                </div>
              </div>
              <span className="mt-1 block text-[10px] text-[#8E887D]">
                Derived timing: end time slips by {delayMinutes}m without altering original booking records.
              </span>
            </div>
          )}

          {/* Phase 6: Live Open-Meteo Weather Selector (conditional) */}
          {disruptionType === "weather" && (
            <div className="border border-[#CEC4B5] bg-[#FAF7F2] p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 font-bold text-[#221F1A]">
                  <CloudRain className="h-4 w-4 text-[#0284C7]" />
                  <span>Live Airport Conditions (Open-Meteo Public API)</span>
                </div>
                <button
                  type="button"
                  onClick={loadWeather}
                  disabled={isLoadingWeather}
                  className="flex items-center gap-1 text-[11px] text-[#6E685D] hover:text-[#221F1A]"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingWeather ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {isLoadingWeather && airportWeatherList.length === 0 ? (
                <div className="py-3 text-center text-xs text-[#6E685D]">
                  Querying live Open-Meteo atmospheric telemetry...
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-5 gap-1">
                    {["ZRH", "GVA", "LHR", "CDG", "MXP"].map((code) => {
                      const isSelected = selectedAirportCode === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => handleSelectAirport(code)}
                          className={`border py-1 text-center font-bold text-xs transition-colors ${
                            isSelected
                              ? "border-[#0284C7] bg-[#E0F2FE] text-[#0369A1]"
                              : "border-[#CEC4B5] bg-[#FFFFFF] text-[#6E685D] hover:border-[#221F1A]"
                          }`}
                        >
                          {code}
                        </button>
                      );
                    })}
                  </div>

                  {airportWeatherList.length > 0 && (
                    <div className="border border-[#BAE6FD] bg-[#F0F9FF] p-2 text-xs text-[#0369A1]">
                      {(() => {
                        const currentW = airportWeatherList.find(
                          (a) => a.airport === selectedAirportCode
                        );
                        if (!currentW) return null;
                        return (
                          <div>
                            <div className="flex items-center justify-between font-bold">
                              <span>{currentW.airport_name} ({currentW.city})</span>
                              <span className="font-mono">{currentW.temperature_c}°C</span>
                            </div>
                            <div className="mt-1 text-[11px] text-[#0284C7]">
                              {currentW.weather_description} • Wind: {currentW.wind_speed_kmh} km/h (gusts {currentW.wind_gusts_kmh} km/h) • Precip: {currentW.precipitation_mm}mm
                            </div>
                            <div className="mt-1.5 flex items-center justify-between text-[11px] border-t border-[#BAE6FD] pt-1 text-[#0369A1]">
                              <span>Suggested Ground Stop:</span>
                              <span className="font-bold text-[#DC2626]">+{currentW.suggested_delay_minutes} mins</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Optional Description */}
          <div>
            <label className="block font-medium text-[#221F1A] mb-1">
              Disruption Description / Reason
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Flight AF 1681 delayed due to thunderstorm"
              className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-[#E5DFD5] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="border border-[#CEC4B5] px-3.5 py-1.5 font-medium text-[#6E685D] hover:text-[#221F1A] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="border border-[#B91C1C] bg-[#B91C1C] px-4 py-1.5 font-medium text-[#FAF7F2] hover:bg-[#991B1B] disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? "Simulating Ripple..." : "Simulate Disruption"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

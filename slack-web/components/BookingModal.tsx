"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { BookingCreateInput, BookingType, GraphNode } from "@/lib/types";

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: BookingCreateInput) => Promise<void>;
  editingNode?: GraphNode | null;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingNode,
}) => {
  const [type, setType] = useState<BookingType>("flight");
  const [title, setTitle] = useState("");
  const [vendor, setVendor] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [cost, setCost] = useState<string>("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");

  // Metadata conditional fields
  const [flightNumber, setFlightNumber] = useState("");
  const [terminal, setTerminal] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [roomType, setRoomType] = useState("");
  const [ticketType, setTicketType] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state if editing
  useEffect(() => {
    if (editingNode) {
      setType(editingNode.type);
      setTitle(editingNode.title);
      setVendor(editingNode.vendor || "");
      setLocation(editingNode.location || "");

      // Format ISO string to datetime-local input (YYYY-MM-DDTHH:mm)
      try {
        setStartTime(new Date(editingNode.start_time).toISOString().slice(0, 16));
        setEndTime(new Date(editingNode.end_time).toISOString().slice(0, 16));
      } catch {
        setStartTime("");
        setEndTime("");
      }

      setCost(editingNode.cost != null ? String(editingNode.cost) : "");
      setCancellationPolicy(editingNode.cancellation_policy || "");

      const meta = editingNode.metadata || {};
      setFlightNumber(typeof meta.flight_number === "string" ? meta.flight_number : "");
      setTerminal(typeof meta.terminal === "string" ? meta.terminal : "");
      setPickup(typeof meta.pickup === "string" ? meta.pickup : "");
      setDropoff(typeof meta.dropoff === "string" ? meta.dropoff : "");
      setRoomType(typeof meta.room_type === "string" ? meta.room_type : "");
      setTicketType(typeof meta.ticket_type === "string" ? meta.ticket_type : "");
    } else {
      // Default initial times (now and +2 hours)
      const now = new Date();
      const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      setStartTime(now.toISOString().slice(0, 16));
      setEndTime(inTwoHours.toISOString().slice(0, 16));
      setTitle("");
      setVendor("");
      setLocation("");
      setCost("");
      setCancellationPolicy("");
      setFlightNumber("");
      setTerminal("");
      setPickup("");
      setDropoff("");
      setRoomType("");
      setTicketType("");
    }
    setError(null);
  }, [editingNode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!startTime || !endTime) {
      setError("Start and end times are required");
      return;
    }

    const startIso = new Date(startTime).toISOString();
    const endIso = new Date(endTime).toISOString();

    const metadata: Record<string, string | number | boolean | undefined> = {};
    if (type === "flight") {
      if (flightNumber) metadata.flight_number = flightNumber;
      if (terminal) metadata.terminal = terminal;
    } else if (type === "transfer") {
      if (pickup) metadata.pickup = pickup;
      if (dropoff) metadata.dropoff = dropoff;
    } else if (type === "hotel") {
      if (roomType) metadata.room_type = roomType;
    } else if (type === "activity") {
      if (ticketType) metadata.ticket_type = ticketType;
    }

    const payload: BookingCreateInput = {
      type,
      title: title.trim(),
      vendor: vendor.trim() || undefined,
      location: location.trim() || (type === "transfer" && (pickup || dropoff) ? `${pickup} to ${dropoff}` : undefined),
      start_time: startIso,
      end_time: endIso,
      cost: cost ? parseFloat(cost) : undefined,
      cancellation_policy: cancellationPolicy.trim() || undefined,
      metadata,
    };

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save booking");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#221F1A]/40 p-4">
      <div className="w-full max-w-lg border border-[#CEC4B5] bg-[#FFFFFF] p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5DFD5] pb-3">
          <h2 className="font-serif-heading text-xl font-bold text-[#221F1A]">
            {editingNode ? "Edit Booking" : "Add Itinerary Booking"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[#6E685D] hover:text-[#221F1A]"
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
          {/* Booking Type Select */}
          <div>
            <label className="block font-medium text-[#221F1A] mb-1">Booking Type</label>
            <div className="grid grid-cols-4 gap-2">
              {(["flight", "hotel", "transfer", "activity"] as BookingType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={`border py-1.5 text-center capitalize font-medium transition-colors ${
                    type === t
                      ? "border-[#221F1A] bg-[#221F1A] text-[#FAF7F2]"
                      : "border-[#CEC4B5] bg-[#FAF7F2] text-[#6E685D] hover:border-[#221F1A]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block font-medium text-[#221F1A] mb-1">
              Title / Description *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === "flight"
                  ? "e.g. Flight BA 178 JFK to LHR"
                  : type === "hotel"
                  ? "e.g. Bloomsbury Boutique Hotel"
                  : type === "transfer"
                  ? "e.g. Heathrow Express to Paddington"
                  : "e.g. British Museum Guided Tour"
              }
              className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
              required
            />
          </div>

          {/* Vendor */}
          <div>
            <label className="block font-medium text-[#221F1A] mb-1">
              {type === "flight" ? "Airline / Vendor" : type === "hotel" ? "Hotel Chain / Host" : "Vendor / Operator"}
            </label>
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. British Airways, Marriott, Uber"
              className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
            />
          </div>

          {/* Conditional Fields based on type */}
          {type === "flight" && (
            <div className="grid grid-cols-2 gap-3 border-l-2 border-[#2B5B84] pl-3 py-1 bg-[#F5F8FA]">
              <div>
                <label className="block font-medium text-[#221F1A] mb-1">Flight Number</label>
                <input
                  type="text"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value)}
                  placeholder="e.g. BA178"
                  className="w-full border border-[#CEC4B5] bg-[#FFFFFF] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-[#221F1A] mb-1">Terminal</label>
                <input
                  type="text"
                  value={terminal}
                  onChange={(e) => setTerminal(e.target.value)}
                  placeholder="e.g. Terminal 5"
                  className="w-full border border-[#CEC4B5] bg-[#FFFFFF] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
                />
              </div>
            </div>
          )}

          {type === "transfer" && (
            <div className="grid grid-cols-2 gap-3 border-l-2 border-[#2D6A4F] pl-3 py-1 bg-[#F4F9F6]">
              <div>
                <label className="block font-medium text-[#221F1A] mb-1">Pickup Location</label>
                <input
                  type="text"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="e.g. LHR Terminal 5"
                  className="w-full border border-[#CEC4B5] bg-[#FFFFFF] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-[#221F1A] mb-1">Dropoff Location</label>
                <input
                  type="text"
                  value={dropoff}
                  onChange={(e) => setDropoff(e.target.value)}
                  placeholder="e.g. Paddington Station"
                  className="w-full border border-[#CEC4B5] bg-[#FFFFFF] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
                />
              </div>
            </div>
          )}

          {type === "hotel" && (
            <div className="border-l-2 border-[#885434] pl-3 py-1 bg-[#FAF6F2]">
              <label className="block font-medium text-[#221F1A] mb-1">Room / Accommodation Type</label>
              <input
                type="text"
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                placeholder="e.g. Deluxe King, Suite"
                className="w-full border border-[#CEC4B5] bg-[#FFFFFF] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
              />
            </div>
          )}

          {type === "activity" && (
            <div className="border-l-2 border-[#6D3A6D] pl-3 py-1 bg-[#FAF4FA]">
              <label className="block font-medium text-[#221F1A] mb-1">Ticket / Tour Tier</label>
              <input
                type="text"
                value={ticketType}
                onChange={(e) => setTicketType(e.target.value)}
                placeholder="e.g. Priority Admission, Guided"
                className="w-full border border-[#CEC4B5] bg-[#FFFFFF] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
              />
            </div>
          )}

          {/* Location */}
          <div>
            <label className="block font-medium text-[#221F1A] mb-1">
              {type === "flight" ? "Airport / Route" : type === "hotel" ? "Address / City" : "Location"}
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. London Heathrow Airport, Bloomsbury, Trafalgar Square"
              className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
            />
          </div>

          {/* Time Window */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#221F1A] mb-1">
                {type === "hotel" ? "Check-in Time *" : "Departure / Start Time *"}
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block font-medium text-[#221F1A] mb-1">
                {type === "hotel" ? "Check-out Time *" : "Arrival / End Time *"}
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Cost and Cancellation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#221F1A] mb-1">Cost ($)</label>
              <input
                type="number"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="e.g. 150.00"
                className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-medium text-[#221F1A] mb-1">Cancellation Policy</label>
              <input
                type="text"
                value={cancellationPolicy}
                onChange={(e) => setCancellationPolicy(e.target.value)}
                placeholder="e.g. Refundable until 24h prior"
                className="w-full border border-[#CEC4B5] p-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-[#E5DFD5] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="border border-[#CEC4B5] px-3.5 py-1.5 font-medium text-[#6E685D] hover:text-[#221F1A]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="border border-[#221F1A] bg-[#221F1A] px-4 py-1.5 font-medium text-[#FAF7F2] hover:bg-[#38332B] disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : editingNode ? "Update Booking" : "Add to Graph"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

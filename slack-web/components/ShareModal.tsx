"use client";

import React, { useState, useEffect } from "react";
import { X, Users, Copy, Check, UserPlus, Trash2, Shield, Eye, Edit3, Link as LinkIcon } from "lucide-react";
import { RoleType, Trip, TripMember } from "@/lib/types";
import { inviteTripMember, listTripMembers, removeTripMember } from "@/lib/api";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip | null;
  onMemberUpdated?: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  trip,
  onMemberUpdated,
}) => {
  const [members, setMembers] = useState<TripMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleType>("editor");

  // Invite link generation state
  const [copiedLink, setCopiedLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const fetchMembers = async () => {
    if (!trip) return;
    try {
      setIsLoading(true);
      setError(null);
      const list = await listTripMembers(trip.id);
      setMembers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && trip) {
      fetchMembers();
      setGeneratedLink(null);
      setCopiedLink(false);
    }
  }, [isOpen, trip]);

  if (!isOpen || !trip) return null;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await inviteTripMember(trip.id, {
        name: name.trim(),
        email: email.trim(),
        role,
      });
      setGeneratedLink(res.invite_link);
      setName("");
      setEmail("");
      await fetchMembers();
      if (onMemberUpdated) onMemberUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite collaborator");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = (linkToCopy: string) => {
    navigator.clipboard.writeText(linkToCopy);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this collaborator?")) return;
    try {
      await removeTripMember(trip.id, memberId);
      await fetchMembers();
      if (onMemberUpdated) onMemberUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg border border-[#221F1A] bg-[#FAF7F2] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5DFD5] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center bg-[#221F1A] text-[#FAF7F2]">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-serif-heading text-lg font-bold text-[#221F1A]">
                Share Trip Itinerary
              </h2>
              <p className="text-xs text-[#6E685D]">{trip.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#6E685D] hover:text-[#221F1A] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 border border-[#FCA5A5] bg-[#FEE2E2] p-3 text-xs text-[#991B1B]">
            {error}
          </div>
        )}

        {/* Direct Trip URL */}
        <div className="mt-4 flex items-center justify-between border border-[#E5DFD5] bg-[#FFFFFF] p-2.5 text-xs">
          <div className="min-w-0 pr-2">
            <div className="font-semibold text-[#221F1A]">Permanent Trip URL</div>
            <div className="font-mono text-[11px] text-[#6E685D] truncate max-w-[280px]">
              {typeof window !== "undefined" ? `${window.location.origin}/trips/${trip.id}` : `/trips/${trip.id}`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(`${window.location.origin}/trips/${trip.id}`)}
            className="flex items-center gap-1 border border-[#CEC4B5] bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-semibold text-[#221F1A] hover:bg-[#F3ECE2] transition-colors shrink-0"
          >
            {copiedLink ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
            <span>{copiedLink ? "Copied" : "Copy Link"}</span>
          </button>
        </div>

        {/* Invite Form */}
        <form onSubmit={handleInvite} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#6E685D]">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aisha or Bob"
                required
                className="mt-1 w-full border border-[#CEC4B5] bg-[#FFFFFF] px-3 py-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#6E685D]">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@traveler.com"
                required
                className="mt-1 w-full border border-[#CEC4B5] bg-[#FFFFFF] px-3 py-2 text-xs text-[#221F1A] focus:border-[#221F1A] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#6E685D] mb-1.5">
              Collaboration Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("editor")}
                className={`flex items-start gap-2 border p-2.5 text-left transition-all ${
                  role === "editor"
                    ? "border-[#221F1A] bg-[#FFFFFF] shadow-xs"
                    : "border-[#E5DFD5] bg-[#F3ECE2] opacity-75 hover:opacity-100"
                }`}
              >
                <Edit3 className="h-4 w-4 text-[#2B5B84] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#221F1A]">Editor</div>
                  <div className="text-[10px] text-[#6E685D] leading-tight">
                    Can edit bookings, trigger disruptions & apply recoveries
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRole("viewer")}
                className={`flex items-start gap-2 border p-2.5 text-left transition-all ${
                  role === "viewer"
                    ? "border-[#221F1A] bg-[#FFFFFF] shadow-xs"
                    : "border-[#E5DFD5] bg-[#F3ECE2] opacity-75 hover:opacity-100"
                }`}
              >
                <Eye className="h-4 w-4 text-[#6E685D] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#221F1A]">Viewer</div>
                  <div className="text-[10px] text-[#6E685D] leading-tight">
                    Read-only view of timeline, graph and live sync
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 border border-[#221F1A] bg-[#221F1A] px-4 py-2 text-xs font-semibold text-[#FAF7F2] hover:bg-[#38332B] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Inviting..." : "Send Invite"}</span>
            </button>
          </div>
        </form>

        {/* Generated Invite Link Banner */}
        {generatedLink && (
          <div className="mt-5 border border-[#2B5B84] bg-[#F0F5FA] p-3 text-xs">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-bold text-[#1E3A8A] flex items-center gap-1">
                <LinkIcon className="h-3.5 w-3.5" />
                Shareable Invite Link Generated:
              </span>
              <button
                onClick={() => handleCopy(generatedLink)}
                className="flex items-center gap-1 px-2 py-0.5 border border-[#2B5B84] bg-[#FFFFFF] text-[11px] font-semibold text-[#1E3A8A] hover:bg-[#E0EDFA] transition-colors"
              >
                {copiedLink ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                <span>{copiedLink ? "Copied!" : "Copy Link"}</span>
              </button>
            </div>
            <div className="font-mono text-[11px] text-[#221F1A] truncate bg-[#FFFFFF] border border-[#CBD5E1] p-1.5">
              {generatedLink}
            </div>
          </div>
        )}

        {/* Members List */}
        <div className="mt-6 border-t border-[#E5DFD5] pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6E685D]">
              Current Collaborators ({members.length})
            </h3>
            {isLoading && <span className="text-[11px] text-[#8E887D]">Refreshing...</span>}
          </div>

          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between border border-[#E5DFD5] bg-[#FFFFFF] p-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E5DFD5] text-[11px] font-bold text-[#221F1A]">
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#221F1A]">{m.name}</span>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 border ${
                          m.role === "owner"
                            ? "border-[#221F1A] bg-[#221F1A] text-[#FAF7F2]"
                            : m.role === "editor"
                            ? "border-[#2B5B84] bg-[#F0F5FA] text-[#1E3A8A]"
                            : "border-[#E5DFD5] bg-[#F3ECE2] text-[#6E685D]"
                        }`}
                      >
                        {m.role}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#6E685D]">{m.email}</div>
                  </div>
                </div>

                {m.role !== "owner" && (
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="p-1 text-[#8E887D] hover:text-[#DC2626] transition-colors"
                    title="Remove collaborator"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Compass,
  ArrowLeft,
  Settings,
  Users,
  Trash2,
  Copy,
  Check,
  UserPlus,
  Shield,
  Save,
  AlertTriangle,
} from "lucide-react";
import { Trip, TripMember, RoleType, AuthUser, Disruption } from "@/lib/types";
import {
  getTrip,
  updateTrip,
  deleteTrip,
  listTripMembers,
  inviteTripMember,
  removeTripMember,
  logoutUser,
  listResolvedDisruptions,
} from "@/lib/api";
import { getAuthUser } from "@/lib/auth";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export default function TripSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = Array.isArray(params?.tripId) ? params.tripId[0] : (params?.tripId as string);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripName, setTripName] = useState("");
  const [members, setMembers] = useState<TripMember[]>([]);
  const [resolvedDisruptions, setResolvedDisruptions] = useState<Disruption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleType>("editor");
  const [isInviting, setIsInviting] = useState(false);

  // Copy link state
  const [copiedLink, setCopiedLink] = useState(false);

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const loadData = useCallback(async () => {
    if (!tripId) return;
    try {
      setIsLoading(true);
      const [fetchedTrip, fetchedMembers, fetchedDisruptions] = await Promise.all([
        getTrip(tripId),
        listTripMembers(tripId),
        listResolvedDisruptions(tripId),
      ]);
      setTrip(fetchedTrip);
      setTripName(fetchedTrip.name);
      setMembers(fetchedMembers);
      setResolvedDisruptions(fetchedDisruptions);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to load trip settings", "error");
    } finally {
      setIsLoading(false);
    }
  }, [tripId, addToast]);

  useEffect(() => {
    const user = getAuthUser();
    if (user) setCurrentUser(user);
    loadData();
  }, [loadData]);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripName.trim() || !trip) return;

    try {
      setIsSavingName(true);
      const updated = await updateTrip(trip.id, tripName.trim());
      setTrip(updated);
      addToast(`Updated trip name to "${updated.name}"`, "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to rename trip", "error");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCopyShareLink = () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/trips/${tripId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    addToast("Trip permalink copied to clipboard!", "info");
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim() || !trip) return;

    try {
      setIsInviting(true);
      await inviteTripMember(trip.id, {
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        role: inviteRole,
      });
      addToast(`Invited ${inviteName} (${inviteEmail}) as ${inviteRole}`, "success");
      setInviteEmail("");
      setInviteName("");
      setInviteRole("editor");
      const updatedMembers = await listTripMembers(trip.id);
      setMembers(updatedMembers);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to invite member", "error");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!trip) return;
    if (!window.confirm(`Are you sure you want to remove ${memberName} from this trip?`)) return;

    try {
      await removeTripMember(trip.id, memberId);
      addToast(`Removed ${memberName} from trip`, "info");
      const updatedMembers = await listTripMembers(trip.id);
      setMembers(updatedMembers);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to remove member", "error");
    }
  };

  const handleDeleteTrip = async () => {
    if (!trip) return;
    const confirmName = window.prompt(
      `This action cannot be undone. To permanently delete this trip and all its bookings and connections, please type "${trip.name}" below:`
    );

    if (confirmName !== trip.name) {
      if (confirmName !== null) {
        addToast("Trip name confirmation did not match. Deletion cancelled.", "info");
      }
      return;
    }

    try {
      setIsDeleting(true);
      await deleteTrip(trip.id);
      addToast(`Permanently deleted trip "${trip.name}"`, "success");
      router.replace("/dashboard");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to delete trip", "error");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--foreground)] border-t-transparent mb-3" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Settings Top Header */}
      <header className="border-b border-[var(--border)] bg-[var(--card)] px-6 py-3.5 sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/trips/${tripId}`}
              className="flex items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Workspace</span>
            </Link>
            <div className="h-4 w-px bg-[var(--border)]" />
            <span className="font-serif-heading text-lg font-bold text-[var(--foreground)] truncate max-w-sm">
              {trip?.name || "Trip Settings"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyShareLink}
              className="flex items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-[#15803D]" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLink ? "Link Copied" : "Copy Permlink"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        <div>
          <h1 className="font-serif-heading text-3xl font-bold text-[var(--foreground)]">Trip Settings</h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--muted-foreground)]">
            Manage itinerary general details, traveler collaboration permissions, and security.
          </p>
        </div>

        {/* Section 1: General Details */}
        <section className="border border-[var(--border)] bg-[var(--card)] p-6 shadow-xs">
          <h2 className="font-serif-heading text-lg font-bold text-[var(--foreground)] border-b border-[var(--border)] pb-3 mb-4">
            General Details
          </h2>

          <form onSubmit={handleUpdateName} className="max-w-xl space-y-4">
            <div>
              <label htmlFor="trip-name-input" className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5">
                Trip Name
              </label>
              <input
                id="trip-name-input"
                type="text"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                required
                className="w-full border border-[var(--border-strong)] bg-[var(--background)] px-3.5 py-2 text-sm text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-[11px] text-[#8E887D] flex gap-4">
                <span>Trip ID: <code className="bg-[var(--muted)] px-1 py-0.5 text-[var(--foreground)] font-mono">{tripId}</code></span>
                {trip?.created_at && (
                  <span>Created: {new Date(trip.created_at).toLocaleDateString()}</span>
                )}
              </div>
              <button
                type="submit"
                disabled={isSavingName || tripName === trip?.name}
                className="flex items-center gap-1.5 border border-[var(--foreground)] bg-[var(--foreground)] px-4 py-2 text-xs font-semibold text-[var(--background)] hover:bg-[#38332B] disabled:opacity-40 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{isSavingName ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Section 2: Collaborators & Permissions */}
        <section className="border border-[var(--border)] bg-[var(--card)] p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4">
            <h2 className="font-serif-heading text-lg font-bold text-[var(--foreground)]">
              Collaborators & Permissions
            </h2>
            <span className="text-xs text-[var(--muted-foreground)]">
              {members.length} Collaborator{members.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Members List */}
          <div className="divide-y divide-[var(--border)] border border-[var(--border)] mb-6">
            {members.length === 0 ? (
              <div className="p-4 text-xs text-[#8E887D] text-center">
                No external collaborators invited yet.
              </div>
            ) : (
              members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-3.5 bg-[var(--background)]">
                  <div>
                    <div className="text-xs font-bold text-[var(--foreground)]">{member.name}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">{member.email}</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 border ${
                        member.role === "owner"
                          ? "border-[#86EFAC] bg-[#DCFCE7] text-[#15803D]"
                          : member.role === "editor"
                          ? "border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1]"
                          : "border-[#FDE68A] bg-[#FEF3C7] text-[#92400E]"
                      }`}
                    >
                      {member.role}
                    </span>

                    {member.role !== "owner" && (
                      <button
                        onClick={() => handleRemoveMember(member.id, member.name)}
                        className="p-1 text-[#8E887D] hover:text-[#991B1B] transition-colors"
                        title="Remove collaborator"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Invite Form */}
          <form onSubmit={handleInviteMember} className="border border-[var(--border)] bg-[var(--background)] p-4">
            <h3 className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider mb-3">
              Invite Collaborator
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="invite-name-input" className="block text-[11px] text-[var(--muted-foreground)] mb-1">
                  Traveler Name
                </label>
                <input
                  id="invite-name-input"
                  type="text"
                  placeholder="e.g. Jordan Lee"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                  className="w-full border border-[var(--border-strong)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="invite-email-input" className="block text-[11px] text-[var(--muted-foreground)] mb-1">
                  Email Address
                </label>
                <input
                  id="invite-email-input"
                  type="email"
                  placeholder="traveler@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="w-full border border-[var(--border-strong)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="invite-role-select" className="block text-[11px] text-[var(--muted-foreground)] mb-1">
                  Permission Role
                </label>
                <select
                  id="invite-role-select"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as RoleType)}
                  className="w-full border border-[var(--border-strong)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
                >
                  <option value="editor">Editor (Can edit bookings & simulate)</option>
                  <option value="viewer">Viewer (Read-only, blocked server-side)</option>
                  <option value="owner">Owner (Full administrative rights)</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={isInviting || !inviteEmail || !inviteName}
                className="flex items-center gap-1.5 border border-[var(--foreground)] bg-[var(--foreground)] px-3.5 py-1.5 text-xs font-semibold text-[var(--background)] hover:bg-[#38332B] disabled:opacity-40 transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>{isInviting ? "Inviting..." : "Send Invitation"}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Section 3: Disruption History */}
        <section className="border border-[var(--border)] bg-[var(--card)] p-6 shadow-xs">
          <h2 className="font-serif-heading text-lg font-bold text-[var(--foreground)] border-b border-[var(--border)] pb-3 mb-4">
            Disruption History
          </h2>
          
          <div className="space-y-3">
            {resolvedDisruptions.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">No past disruptions recorded.</p>
            ) : (
              resolvedDisruptions.map((dis) => (
                <div key={dis.id} className="border border-[var(--border-strong)] bg-[var(--background)] p-3 flex justify-between items-center">
                  <div>
                    <span className="text-xs font-bold uppercase text-[var(--muted-foreground)] mr-2">{dis.disruption_type}</span>
                    <span className="text-sm font-semibold">{dis.delay_minutes ? `Delayed by ${dis.delay_minutes}m` : 'Disrupted'}</span>
                  </div>
                  {dis.resolved_at && <span className="text-xs text-[var(--muted-foreground)]">Resolved: {new Date(dis.resolved_at).toLocaleString()}</span>}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Section 4: Danger Zone */}
        <section className="border border-[#FCA5A5] bg-[#FFF5F5] p-6 shadow-xs">
          <div className="flex items-center gap-2 text-[#991B1B] mb-2">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="font-serif-heading text-lg font-bold">Danger Zone</h2>
          </div>
          <p className="text-xs text-[#7F1D1D] mb-4 leading-relaxed">
            Permanently delete this trip along with all of its scheduled bookings, temporal dependency
            edges, and collaborator access logs. This action cannot be reversed.
          </p>

          <button
            onClick={handleDeleteTrip}
            disabled={isDeleting}
            className="flex items-center gap-1.5 border border-[#B91C1C] bg-[#B91C1C] px-4 py-2 text-xs font-semibold text-[var(--card)] hover:bg-[#991B1B] disabled:opacity-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{isDeleting ? "Deleting Trip..." : "Delete This Trip"}</span>
          </button>
        </section>
      </main>

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 border px-4 py-2.5 text-xs shadow-lg max-w-sm ${
              toast.type === "error"
                ? "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B]"
                : toast.type === "info"
                ? "border-[#BAE6FD] bg-[#E0F2FE] text-[#0369A1]"
                : "border-[#86EFAC] bg-[#DCFCE7] text-[#15803D]"
            }`}
          >
            <span>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="font-bold opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

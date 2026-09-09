"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Compass,
  ArrowRight,
  GitBranch,
  ShieldAlert,
  Zap,
  Clock,
  Layers,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { isAuthenticated } from "@/lib/auth";
import { HelpModal } from "@/components/HelpModal";
import { seedDemoTrip } from "@/lib/api";

export default function LandingPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      setAuthed(true);
      router.replace("/dashboard");
    }
  }, [router]);

  const handleLoadDemo = async () => {
    setIsDemoLoading(true);
    try {
      const trip = await seedDemoTrip();
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      console.error(err);
      alert("Failed to load demo trip");
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--border)]">
      {/* Top Navigation */}
      <header className="border-b border-[var(--border)] bg-[var(--card)]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <span className="font-serif-heading text-xl font-bold tracking-tight text-[var(--foreground)]">
                Slack
              </span>
              <span className="ml-2 text-xs text-[var(--muted-foreground)] tracking-wide hidden sm:inline">
                Travel Disruption Recovery Engine
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsHelpOpen(true)}
              className="text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              How it works
            </button>
            <Link
              href="/login"
              className="border border-[var(--border-strong)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="flex items-center gap-1.5 border border-[var(--foreground)] bg-[var(--foreground)] px-4 py-2 text-xs font-semibold text-[var(--background)] hover:bg-[#38332B] transition-colors"
            >
              <span>Get Started</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 border border-[var(--border-strong)] bg-[var(--card)] px-3.5 py-1.5 mb-6 shadow-xs">
            <span className="flex h-2 w-2 rounded-full bg-[#15803D]" />
            <span className="text-xs font-medium text-[var(--muted-foreground)]">
              A Trip is a Directed Acyclic Graph (DAG)
            </span>
          </div>

          <h1 className="font-serif-heading text-4xl sm:text-6xl font-bold tracking-tight text-[var(--foreground)] leading-[1.15]">
            Where Buffer Time is <br className="hidden sm:inline" />
            <span className="text-[#2B5B84] italic">Edge Slack</span>.
          </h1>

          <p className="mt-6 max-w-2xl mx-auto text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed">
            Calendar apps see static dates. Slack models the physical dependencies of travel.
            When delays ripple across flights, transfers, and hotels, our engine simulates cascades
            and computes autonomous recovery.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login"
              className="flex items-center gap-2 border border-[var(--foreground)] bg-[var(--foreground)] px-6 py-3.5 text-sm font-semibold text-[var(--background)] hover:bg-[#38332B] shadow-sm transition-all hover:translate-y-[-1px]"
            >
              <span>Try Interactive Demo</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/signup"
              className="flex items-center gap-2 border border-[var(--border-strong)] bg-[var(--card)] px-6 py-3.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] transition-all"
            >
              <Sparkles className="h-4 w-4 text-[#885434]" />
              <span>Create Free Account</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Interactive Visual Concept Breakdown */}
      <section className="border-y border-[var(--border)] bg-[var(--card)] px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-serif-heading text-2xl sm:text-3xl font-bold text-[var(--foreground)]">
              How Travel Disruption Works as a Graph
            </h2>
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              Linear itineraries fail because connections depend on transfer slack. See how a single
              delayed flight impacts your entire itinerary.
            </p>
          </div>

          {/* Graph Architecture Diagram Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Step 1: Baseline */}
            <div className="border border-[var(--border)] bg-[var(--background)] p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#15803D] bg-[#DCFCE7] px-2 py-0.5 border border-[#86EFAC]">
                    1. Healthy Baseline
                  </span>
                  <Clock className="h-4 w-4 text-[#15803D]" />
                </div>
                <h3 className="font-serif-heading text-lg font-bold text-[var(--foreground)]">
                  Positive Buffer Slack
                </h3>
                <p className="mt-2 text-xs text-[var(--muted-foreground)] leading-relaxed">
                  Flight LX 354 arrives at 09:30. Shuttle departs at 10:15. Gap is 45 mins.
                  Required buffer is 30 mins. Edge slack is <strong className="text-[#15803D]">+15 min</strong>.
                </p>
              </div>

              <div className="mt-6 border border-[var(--border-strong)] bg-[var(--card)] p-4 text-xs font-mono">
                <div className="flex justify-between items-center text-[var(--foreground)]">
                  <span>Swiss Flight LX 354</span>
                  <span className="text-[10px] text-[#15803D] font-bold">ON TIME</span>
                </div>
                <div className="my-2 border-l-2 border-dashed border-[#15803D] pl-3 py-1 text-[var(--muted-foreground)]">
                  Slack: +15m buffer
                </div>
                <div className="flex justify-between items-center text-[var(--foreground)]">
                  <span>Chamonix Shuttle</span>
                  <span className="text-[10px] text-[#15803D] font-bold">CONNECTED</span>
                </div>
              </div>
            </div>

            {/* Step 2: Ripple Wave */}
            <div className="border border-[#B91C1C] bg-[#FFF5F5] p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#991B1B] bg-[#FEE2E2] px-2 py-0.5 border border-[#FCA5A5]">
                    2. Disruption Wave
                  </span>
                  <AlertTriangle className="h-4 w-4 text-[#991B1B]" />
                </div>
                <h3 className="font-serif-heading text-lg font-bold text-[#991B1B]">
                  Slack Inversion: Ripple Delay
                </h3>
                <p className="mt-2 text-xs text-[#7F1D1D] leading-relaxed">
                  Thunderstorm delays Flight LX 354 by 60 mins. Arrival becomes 10:30.
                  Edge slack inverts to <strong className="text-[#991B1B]">-15 min</strong>. Shuttle is missed!
                </p>
              </div>

              <div className="mt-6 border border-[#FCA5A5] bg-[var(--card)] p-4 text-xs font-mono">
                <div className="flex justify-between items-center text-[#991B1B]">
                  <span>Swiss Flight LX 354</span>
                  <span className="text-[10px] bg-[#FEE2E2] px-1 font-bold">+60m DELAY</span>
                </div>
                <div className="my-2 border-l-2 border-dashed border-[#B91C1C] pl-3 py-1 text-[#B91C1C] font-bold">
                  Broken Edge: -15m violation
                </div>
                <div className="flex justify-between items-center text-[var(--muted-foreground)] line-through">
                  <span>Chamonix Shuttle</span>
                  <span className="text-[10px] text-[#991B1B] font-bold">MISSED</span>
                </div>
              </div>
            </div>

            {/* Step 3: Autonomous Recovery */}
            <div className="border border-[#2B5B84] bg-[#F0F7FA] p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#2B5B84] bg-[#E0F2FE] px-2 py-0.5 border border-[#BAE6FD]">
                    3. Autonomous Recovery
                  </span>
                  <Zap className="h-4 w-4 text-[#2B5B84]" />
                </div>
                <h3 className="font-serif-heading text-lg font-bold text-[#2B5B84]">
                  Graph Auto-Resolution
                </h3>
                <p className="mt-2 text-xs text-[#1E3A5F] leading-relaxed">
                  The engine evaluates rerouting and automatically shifts downstream dependencies,
                  booking the 11:30 shuttle and saving the mountain hotel check-in.
                </p>
              </div>

              <div className="mt-6 border border-[#BAE6FD] bg-[var(--card)] p-4 text-xs font-mono">
                <div className="flex justify-between items-center text-[var(--foreground)]">
                  <span>Swiss Flight LX 354</span>
                  <span className="text-[10px] text-[var(--muted-foreground)]">ARRIVED 10:30</span>
                </div>
                <div className="my-2 border-l-2 border-dashed border-[#2B5B84] pl-3 py-1 text-[#2B5B84]">
                  Recovery: Shift to Next Shuttle
                </div>
                <div className="flex justify-between items-center text-[#15803D] font-bold">
                  <span>Next Shuttle (11:30)</span>
                  <span className="text-[10px] bg-[#DCFCE7] px-1 font-bold">RECOVERED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="border border-[var(--border)] bg-[var(--card)] p-8 shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center bg-[var(--background)] border border-[var(--foreground)] text-[var(--foreground)] mb-4">
                <GitBranch className="h-5 w-5" />
              </div>
              <h3 className="font-serif-heading text-lg font-bold text-[var(--foreground)]">
                Directed Acyclic Graphs
              </h3>
              <p className="mt-2 text-xs text-[var(--muted-foreground)] leading-relaxed">
                Every booking is a node with temporal and location prerequisites. Dependencies
                automatically compute buffer times and flag fragile connections.
              </p>
            </div>

            <div className="border border-[var(--border)] bg-[var(--card)] p-8 shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center bg-[var(--background)] border border-[var(--foreground)] text-[var(--foreground)] mb-4">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <h3 className="font-serif-heading text-lg font-bold text-[var(--foreground)]">
                Resilience Health Scoring
              </h3>
              <p className="mt-2 text-xs text-[var(--muted-foreground)] leading-relaxed">
                Realtime resilience rings score trip robustness from 0 to 100 based on minimum
                connection slack, single points of failure, and vendor flexibility.
              </p>
            </div>

            <div className="border border-[var(--border)] bg-[var(--card)] p-8 shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center bg-[var(--background)] border border-[var(--foreground)] text-[var(--foreground)] mb-4">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="font-serif-heading text-lg font-bold text-[var(--foreground)]">
                Server-Enforced Roles
              </h3>
              <p className="mt-2 text-xs text-[var(--muted-foreground)] leading-relaxed">
                Invite travelers as Owners, Editors, or Viewers. Role verification happens on the
                server via signed JWT tokens, not client-side toggles.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--card)] px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 text-xs text-[var(--muted-foreground)]">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-[var(--foreground)]" />
            <span className="font-serif-heading font-bold text-[var(--foreground)]">Slack</span>
            <span>— Travel Disruption Recovery Engine</span>
          </div>
          <div>Built with Next.js App Router, FastAPI & PostgreSQL</div>
        </div>
      </footer>
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}

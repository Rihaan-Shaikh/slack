"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginUser } from "@/lib/api";
import { isAuthenticated, setAuth } from "@/lib/auth";
import { AuthResponse } from "@/lib/types";

const DEMO_ACCOUNTS = [
  {
    label: "Aisha (Owner)",
    sublabel: "Full access — create, edit, delete",
    email: "owner@demo.com",
    password: "demo1234",
    color: "from-violet-600 to-indigo-600",
    ring: "ring-violet-400",
    icon: "👑",
  },
  {
    label: "Charlie (Editor)",
    sublabel: "Can edit bookings and trigger disruptions",
    email: "editor@demo.com",
    password: "demo1234",
    color: "from-emerald-600 to-teal-600",
    ring: "ring-emerald-400",
    icon: "✏️",
  },
  {
    label: "Bob (Viewer)",
    sublabel: "Read-only — mutations blocked server-side",
    email: "viewer@demo.com",
    password: "demo1234",
    color: "from-amber-500 to-orange-500",
    ring: "ring-amber-400",
    icon: "👁️",
  },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginUser(email.trim(), password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin(account: (typeof DEMO_ACCOUNTS)[number]) {
    setError(null);
    setDemoLoading(account.email);
    try {
      await loginUser(account.email, account.password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed");
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="text-3xl">✈️</span>
          <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">
            Slack
          </h1>
        </div>
        <p className="text-sm text-[#6B6560]">
          Travel Disruption Recovery System
        </p>
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Sign-in card */}
        <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-8">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-6">
            Sign in
          </h2>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[#3A3630] mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5CEC5] bg-[#FDFCF9] text-[var(--foreground)] placeholder:text-[#B0AAA2] focus:outline-none focus:ring-2 focus:ring-[var(--foreground)]/20 focus:border-[var(--foreground)] transition-all text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[#3A3630] mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5CEC5] bg-[#FDFCF9] text-[var(--foreground)] placeholder:text-[#B0AAA2] focus:outline-none focus:ring-2 focus:ring-[var(--foreground)]/20 focus:border-[var(--foreground)] transition-all text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-[var(--foreground)] text-white font-medium text-sm hover:bg-[#3A3630] focus:outline-none focus:ring-2 focus:ring-[var(--foreground)]/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-[#6B6560]">
            No account?{" "}
            <Link
              href="/signup"
              className="font-medium text-[var(--foreground)] underline underline-offset-2 hover:text-[#6B6560] transition-colors"
            >
              Create one
            </Link>
          </p>
        </div>

        {/* Demo quick-login */}
        <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#6B6560] uppercase tracking-widest">
              Judge / Demo Mode
            </span>
          </div>
          <p className="text-xs text-[#9B958F] mb-4">
            Each button logs into a real, separate account with a verified JWT.
            A viewer cannot mutate data even with a forged header.
          </p>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                id={`demo-login-${account.email.split("@")[0]}`}
                onClick={() => handleDemoLogin(account)}
                disabled={demoLoading !== null}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r ${account.color} text-white text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 ${account.ring} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
              >
                <span className="text-base">{account.icon}</span>
                <span className="flex-1 text-left">
                  <span className="block">{account.label}</span>
                  <span className="block text-xs font-normal opacity-80">
                    {account.sublabel}
                  </span>
                </span>
                {demoLoading === account.email && (
                  <span className="text-xs opacity-70">Logging in…</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

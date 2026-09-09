"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signupUser } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/");
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await signupUser(email.trim(), password, displayName.trim());
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
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

      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-8">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-6">
            Create account
          </h2>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="displayName"
                className="block text-sm font-medium text-[#3A3630] mb-1"
              >
                Display name
              </label>
              <input
                id="displayName"
                type="text"
                autoComplete="name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5CEC5] bg-[#FDFCF9] text-[var(--foreground)] placeholder:text-[#B0AAA2] focus:outline-none focus:ring-2 focus:ring-[var(--foreground)]/20 focus:border-[var(--foreground)] transition-all text-sm"
              />
            </div>
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
                <span className="ml-1 text-xs font-normal text-[#9B958F]">(min. 6 chars)</span>
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
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
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-[#6B6560]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-[var(--foreground)] underline underline-offset-2 hover:text-[#6B6560] transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

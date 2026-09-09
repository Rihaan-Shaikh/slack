"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RotateCcw, LayoutDashboard } from "lucide-react";
import Link from "next/link";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary caught an error]:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full min-h-[300px] flex-col items-center justify-center p-8 text-center bg-[var(--background)]">
          <div className="max-w-md border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FEE2E2] text-[#991B1B] mb-4">
              <AlertOctagon className="h-6 w-6" />
            </div>

            <h3 className="font-serif-heading text-lg font-bold text-[var(--foreground)]">
              {this.props.fallbackTitle || "Something went wrong in the workspace"}
            </h3>

            <p className="mt-2 text-xs text-[var(--muted-foreground)] leading-relaxed">
              {this.props.fallbackDescription ||
                "A rendering error occurred in the interactive graph or workspace canvas. You can retry rendering or return to your dashboard."}
            </p>

            {this.state.error && (
              <div className="mt-4 max-h-24 overflow-auto rounded bg-[#F7F4EE] p-2 text-left text-[11px] font-mono text-[#991B1B]">
                {this.state.error.message}
              </div>
            )}

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-1.5 border border-[var(--foreground)] bg-[var(--foreground)] px-4 py-2 text-xs font-semibold text-[var(--background)] hover:bg-[#38332B] transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Retry Rendering</span>
              </button>

              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                <LayoutDashboard className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                <span>Dashboard</span>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

"use client";

import React, { useEffect } from "react";
import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "success" | "info" | "warning" | "error";
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 3500);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className="pointer-events-auto flex items-center justify-between gap-3 border border-[var(--foreground)] bg-[var(--card)] px-4 py-3 text-xs text-[var(--foreground)] shadow-md">
      <div className="flex items-center gap-2">
        {toast.type === "success" ? (
          <CheckCircle2 className="h-4 w-4 text-[#2D6A4F] shrink-0" />
        ) : toast.type === "warning" || toast.type === "error" ? (
          <AlertTriangle className="h-4 w-4 text-[#B91C1C] shrink-0" />
        ) : (
          <Info className="h-4 w-4 text-[#2B5B84] shrink-0" />
        )}
        <span className="font-medium">{toast.message}</span>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-0.5 text-[#8E887D] hover:text-[var(--foreground)] transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

import React, { useState } from "react";
import { Bell } from "lucide-react";

export function NotificationCenter({ toasts = [] }: { toasts?: { id: string, message: string }[] }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="p-1.5 border border-[var(--border-strong)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors shrink-0">
        <Bell className="h-3.5 w-3.5" />
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[var(--card)] border border-[var(--border)] shadow-xl p-4 z-50">
          <h3 className="font-serif-heading font-bold text-sm mb-2 border-b border-[var(--border)] pb-2 text-[var(--foreground)]">Recent Notifications</h3>
          {toasts.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">No recent notifications.</p>
          ) : (
            <ul className="space-y-2">
              {toasts.slice(-5).map(t => (
                <li key={t.id} className="text-xs text-[var(--foreground)]">{t.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

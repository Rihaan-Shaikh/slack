"use client";

import React, { useEffect, useState } from "react";
import { getAuthUser } from "@/lib/auth";
import { AuthUser } from "@/lib/types";
import { TripHeader } from "@/components/TripHeader";

export default function ProfilePage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const user = getAuthUser();
    if (user) {
      setCurrentUser(user);
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] font-sans antialiased">
      <TripHeader 
        tripName="Your Profile" 
        tripId="profile"
        currentUser={currentUser}
        isPitchMode={false}
        setIsPitchMode={() => {}}
      />
      <main className="flex-1 p-8 max-w-4xl mx-auto w-full">
        <h1 className="font-serif-heading text-4xl font-bold text-[var(--foreground)] mb-8">Profile</h1>
        <div className="bg-[var(--card)] border border-[var(--border)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Display Name</h2>
          <p className="text-xl font-medium text-[var(--foreground)]">{currentUser?.name || "Guest"}</p>
        </div>
      </main>
    </div>
  );
}

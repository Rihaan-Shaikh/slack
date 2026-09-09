"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

const PUBLIC_PATHS = ["/", "/login", "/signup"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const authed = isAuthenticated();
    const isPublic = PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname?.startsWith(p)));

    // If logged in and on landing page or auth screens, go directly to /dashboard
    if (authed && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
      router.replace("/dashboard");
      return;
    }

    // If not authenticated and visiting a protected screen (e.g. /dashboard, /trips/*)
    if (!authed && !isPublic) {
      router.replace("/login");
      return;
    }
  }, [pathname, router]);

  return <>{children}</>;
}

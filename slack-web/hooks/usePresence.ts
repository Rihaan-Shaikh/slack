import { useState, useEffect, useRef } from "react";
import { Trip, PresenceUser, AuthUser } from "@/lib/types";
import { sendPresenceHeartbeat } from "@/lib/api";
import { getAuthUser } from "@/lib/auth";

export function usePresence(currentTrip: Trip | null, loadGraphSilent: (tripId: string) => Promise<void>) {
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const [pulsingNodeId, setPulsingNodeId] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isActivityDrawerOpen, setIsActivityDrawerOpen] = useState(false);
  const [latestEventTimestamp, setLatestEventTimestamp] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const clientIdRef = useRef<string>("");
  const clientNameRef = useRef<string>("");
  const avatarColorRef = useRef<string>("");

  useEffect(() => {
    const user = getAuthUser();
    if (user) {
      setCurrentUser(user);
      clientNameRef.current = user.display_name;
    }
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const colors = ["#2B5B84", "#885434", "#2D6A4F", "#6D3A6D", "#B45309", "#047857"];
    const chosenColor = colors[Math.floor(Math.random() * colors.length)];
    clientIdRef.current = `client_${Date.now()}_${randomSuffix}`;
    avatarColorRef.current = chosenColor;
  }, []);

  useEffect(() => {
    if (!currentTrip) return;
    const tripId = currentTrip.id;

    const sendHeartbeat = () => {
      if (!clientIdRef.current) return;
      sendPresenceHeartbeat(tripId, {
        client_id: clientIdRef.current,
        client_name: clientNameRef.current,
        avatar_color: avatarColorRef.current,
      })
        .then((resp) => {
          if (resp?.active_users) setActiveUsers(resp.active_users);
        })
        .catch(() => {});
    };

    sendHeartbeat();
    const heartbeatTimer = setInterval(sendHeartbeat, 10000);

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const sseUrl = `${apiBase}/trips/${tripId}/events`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "CONNECTED") return;

        if (data.type === "PRESENCE_UPDATED" && data.payload?.active_users) {
          setActiveUsers(data.payload.active_users);
          return;
        }

        if (
          data.type === "ACTIVITY_LOGGED" ||
          data.type === "MEMBER_INVITED" ||
          data.type === "MEMBER_JOINED" ||
          data.type === "MEMBER_REMOVED"
        ) {
          setLatestEventTimestamp(Date.now().toString());
        }

        loadGraphSilent(tripId);

        const affectedNodeId =
          data.payload?.booking_id || data.payload?.target_booking_id || null;

        if (affectedNodeId) {
          setPulsingNodeId(affectedNodeId);
          setTimeout(() => {
            setPulsingNodeId((curr) => (curr === affectedNodeId ? null : curr));
          }, 2500);
        }
      } catch {
        // ignore parse error
      }
    };

    return () => {
      clearInterval(heartbeatTimer);
      eventSource.close();
    };
  }, [currentTrip, loadGraphSilent]);

  return {
    activeUsers, pulsingNodeId, setPulsingNodeId,
    isShareModalOpen, setIsShareModalOpen,
    isActivityDrawerOpen, setIsActivityDrawerOpen,
    latestEventTimestamp, setLatestEventTimestamp,
    currentUser, clientIdRef
  };
}

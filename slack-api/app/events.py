# Event broadcasting and presence tracking for Phase 4
import asyncio
import json
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Set, Any, Optional
from uuid import UUID
from app.models import PresenceUser

class TripEventBus:
    def __init__(self):
        # Map trip_id (as str) -> Set of asyncio.Queue
        self._subscribers: Dict[str, Set[asyncio.Queue]] = defaultdict(set)
        # Map trip_id (as str) -> Dict of client_id -> PresenceUser
        self._presence: Dict[str, Dict[str, PresenceUser]] = defaultdict(dict)
        self._lock = asyncio.Lock()

    async def subscribe(self, trip_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers[trip_id].add(q)
        return q

    async def unsubscribe(self, trip_id: str, q: asyncio.Queue) -> None:
        if trip_id in self._subscribers:
            self._subscribers[trip_id].discard(q)
            if not self._subscribers[trip_id]:
                del self._subscribers[trip_id]

    async def broadcast(self, trip_id: str, event_type: str, payload: Dict[str, Any]) -> None:
        event = {
            "type": event_type,
            "trip_id": str(trip_id),
            "payload": payload,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        subscribers = list(self._subscribers.get(str(trip_id), set()))
        for q in subscribers:
            try:
                q.put_nowait(event)
            except Exception:
                pass

    def broadcast_sync(self, trip_id: str, event_type: str, payload: Dict[str, Any]) -> None:
        """Helper to broadcast from synchronous route handlers."""
        event = {
            "type": event_type,
            "trip_id": str(trip_id),
            "payload": payload,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        subscribers = list(self._subscribers.get(str(trip_id), set()))
        for q in subscribers:
            try:
                q.put_nowait(event)
            except Exception:
                pass

    def record_presence(self, trip_id: str, user: PresenceUser) -> None:
        user_with_time = PresenceUser(
            client_id=user.client_id,
            client_name=user.client_name,
            avatar_color=user.avatar_color,
            last_seen=datetime.now(timezone.utc),
        )
        self._presence[str(trip_id)][user.client_id] = user_with_time

    def get_active_presence(self, trip_id: str) -> List[PresenceUser]:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=25)
        active: List[PresenceUser] = []
        user_map = self._presence.get(str(trip_id), {})
        stale_keys = []

        for cid, user in user_map.items():
            if user.last_seen and user.last_seen > cutoff:
                active.append(user)
            else:
                stale_keys.append(cid)

        for cid in stale_keys:
            user_map.pop(cid, None)

        return active

event_bus = TripEventBus()

"""Real-time event names and the bus used by services to publish them.

Transport: Socket.IO protocol v5 on both ends — ``python-socketio`` on the
server and ``socket.io-client`` v4 in the browser.  No native WebSocket
endpoint exists, so the two protocols are never mixed.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Protocol

# Client -> server
ROOM_JOIN = "room:join"
ROOM_LEAVE = "room:leave"
PLAYER_READY = "player:ready"

# Server -> client
ROOM_STATE = "room:state"  # full snapshot, sent on join and after every change
ROOM_PARTICIPANTS = "room:participants"
ROOM_ERROR = "room:error"
COMPETITION_COUNTDOWN = "competition:countdown"
COMPETITION_STARTED = "competition:started"
SUBMISSION_RECEIVED = "submission:received"
SUBMISSION_RESULT = "submission:result"
COMPETITION_WINNER = "competition:winner"
COMPETITION_FINISHED = "competition:finished"
PLAYER_DISCONNECTED = "player:disconnected"


def competition_room(competition_id: int) -> str:
    return f"competition:{competition_id}"


class EventBus(Protocol):
    async def emit(self, event: str, data: Any, room: str) -> None: ...


class RecordingBus:
    """Used in tests and when no Socket.IO server is attached."""

    def __init__(self) -> None:
        self.events: list[tuple[str, Any, str]] = []

    async def emit(self, event: str, data: Any, room: str) -> None:
        self.events.append((event, data, room))

    def named(self, event: str) -> list[Any]:
        return [data for name, data, _ in self.events if name == event]


class Presence:
    """Tracks which users currently have a socket open in each competition room."""

    def __init__(self) -> None:
        self._rooms: dict[int, dict[int, set[str]]] = defaultdict(lambda: defaultdict(set))
        self._by_sid: dict[str, set[int]] = defaultdict(set)

    def add(self, competition_id: int, user_id: int, sid: str) -> None:
        self._rooms[competition_id][user_id].add(sid)
        self._by_sid[sid].add(competition_id)

    def remove(self, competition_id: int, user_id: int, sid: str) -> bool:
        """Returns True when the user has no sockets left in that room."""
        sids = self._rooms[competition_id][user_id]
        sids.discard(sid)
        self._by_sid[sid].discard(competition_id)
        if not sids:
            self._rooms[competition_id].pop(user_id, None)
            return True
        return False

    def rooms_of(self, sid: str) -> set[int]:
        return set(self._by_sid.get(sid, set()))

    def forget_sid(self, sid: str) -> None:
        self._by_sid.pop(sid, None)

    def online(self, competition_id: int) -> set[int]:
        return {uid for uid, sids in self._rooms.get(competition_id, {}).items() if sids}

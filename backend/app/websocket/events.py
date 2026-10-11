"""Real-time event names and the bus used by services to publish them.

Transport: Socket.IO protocol v5 on both ends — ``python-socketio`` on the
server and ``socket.io-client`` v4 in the browser.  No native WebSocket
endpoint exists, so the two protocols are never mixed.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Protocol

from redis.asyncio import Redis
from redis.exceptions import RedisError

log = logging.getLogger("pyarena.presence")

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


class Presence(Protocol):
    """Tracks which users currently have a socket open in each competition room."""

    async def add(self, competition_id: int, user_id: int, sid: str) -> None: ...

    async def remove(self, competition_id: int, user_id: int, sid: str) -> bool:
        """Returns True when the user has no sockets left in that room."""
        ...

    def rooms_of(self, sid: str) -> set[int]: ...

    def forget_sid(self, sid: str) -> None: ...

    async def online(self, competition_id: int) -> set[int]: ...


class MemoryPresence:
    """Single-process presence (development, tests, or one backend process)."""

    def __init__(self) -> None:
        self._rooms: dict[int, dict[int, set[str]]] = defaultdict(lambda: defaultdict(set))
        self._by_sid: dict[str, set[int]] = defaultdict(set)

    async def add(self, competition_id: int, user_id: int, sid: str) -> None:
        self._rooms[competition_id][user_id].add(sid)
        self._by_sid[sid].add(competition_id)

    async def remove(self, competition_id: int, user_id: int, sid: str) -> bool:
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

    async def online(self, competition_id: int) -> set[int]:
        return {uid for uid, sids in self._rooms.get(competition_id, {}).items() if sids}


PRESENCE_TTL_SECONDS = 12 * 3600


class RedisPresence:
    """Presence shared by every API process.

    Each competition is a Redis hash ``user_id -> number of open sockets``.
    Which rooms a socket joined stays in local memory, because a socket always
    lives on exactly one process.

    Limitation: if a process crashes, its sockets are never decremented, so
    those users can look online until the hash expires (12 h without activity).
    """

    def __init__(self, redis: Redis, prefix: str = "pyarena:presence:") -> None:
        self.redis = redis
        self.prefix = prefix
        self._by_sid: dict[str, set[int]] = defaultdict(set)

    def _key(self, competition_id: int) -> str:
        return f"{self.prefix}{competition_id}"

    async def add(self, competition_id: int, user_id: int, sid: str) -> None:
        if competition_id in self._by_sid[sid]:
            return  # this socket already counted for the room
        self._by_sid[sid].add(competition_id)
        key = self._key(competition_id)
        try:
            async with self.redis.pipeline(transaction=True) as pipe:
                pipe.hincrby(key, str(user_id), 1)
                pipe.expire(key, PRESENCE_TTL_SECONDS)
                await pipe.execute()
        except RedisError as exc:
            log.warning("presence add failed: %s", type(exc).__name__)

    async def remove(self, competition_id: int, user_id: int, sid: str) -> bool:
        if competition_id not in self._by_sid.get(sid, set()):
            return False
        self._by_sid[sid].discard(competition_id)
        key = self._key(competition_id)
        try:
            left = int(await self.redis.hincrby(key, str(user_id), -1))
            if left <= 0:
                await self.redis.hdel(key, str(user_id))
                return True
        except RedisError as exc:
            log.warning("presence remove failed: %s", type(exc).__name__)
        return False

    def rooms_of(self, sid: str) -> set[int]:
        return set(self._by_sid.get(sid, set()))

    def forget_sid(self, sid: str) -> None:
        self._by_sid.pop(sid, None)

    async def online(self, competition_id: int) -> set[int]:
        try:
            counts = await self.redis.hgetall(self._key(competition_id))
        except RedisError as exc:
            log.warning("presence read failed: %s", type(exc).__name__)
            return set()
        return {int(uid) for uid, count in counts.items() if int(count) > 0}


def build_presence(redis: Redis | None) -> Presence:
    return MemoryPresence() if redis is None else RedisPresence(redis)

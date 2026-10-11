"""A small in-memory sliding-window rate limiter.

Good enough for a single backend process.  When the API is scaled to several
processes, move these counters to a shared store (for example Redis); see
docs/SECURITY.md.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, enabled: bool = True) -> None:
        self.enabled = enabled
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str, limit: int, window_seconds: float) -> float | None:
        """Record a hit.  Returns ``None`` if allowed, else seconds until retry."""
        if not self.enabled or limit <= 0:
            return None
        now = time.monotonic()
        bucket = self._hits[key]
        while bucket and bucket[0] <= now - window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            return max(0.0, bucket[0] + window_seconds - now)
        bucket.append(now)
        if len(self._hits) > 50_000:  # keep memory bounded
            self._prune(now, window_seconds)
        return None

    def _prune(self, now: float, window_seconds: float) -> None:
        for key in [k for k, v in self._hits.items() if not v or v[-1] <= now - window_seconds]:
            del self._hits[key]

    def reset(self) -> None:
        self._hits.clear()

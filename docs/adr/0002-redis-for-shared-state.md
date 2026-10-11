# ADR 0002: Redis for state shared between API processes

- Status: accepted
- Date: 2026-10-11

## Context

Until Phase 2, rate limits, presence (who is online in a room), Socket.IO rooms and the per-competition judge loop all lived in one process's memory. Running two API processes behind a load balancer would have given each process its own limits, its own view of who is online, sockets that miss events emitted elsewhere, and, most importantly, two judge loops for one competition, which could judge submissions out of receipt order.

## Decision

Use Redis (one instance, no persistence) for state that is shared but disposable:

- rate limits: fixed window (`SET NX PX` + `INCR` + `PTTL` in one transaction);
- presence: one hash per competition, `user_id -> open sockets`;
- Socket.IO fan-out: `socketio.AsyncRedisManager`;
- judge ordering: a lock `judge-lock:{competition_id}` (`SET NX PX`, refreshed while draining, released only by its owner).

The database stays the authority for everything that matters for correctness: winner selection (the conditional `UPDATE`), state transitions (compare-and-set) and idempotency keys. Losing Redis loses no data.

Without `REDIS_URL`, the in-memory implementations are used (development, tests). `ENVIRONMENT=production` refuses to start without Redis.

## Alternatives considered

- **PostgreSQL only** (advisory locks, `LISTEN/NOTIFY`, a rate-limit table): one fewer service, but adds write load on every request and python-socketio has no Postgres manager.
- **Sticky sessions only:** keeps sockets on one process but does nothing for the judge loop or rate limits.

## Consequences

- One more container to run and monitor; `/health/ready` reports it.
- If Redis is down, rate limits fail open (logged), and the readiness check fails so a load balancer can stop sending traffic.
- Fixed windows allow up to twice the limit across a window boundary; accepted.
- A crashed process can leave stale presence counts until the 12-hour expiry.
- Proven by `tests/test_multi_replica.py` (two API servers, one Redis, one full match).

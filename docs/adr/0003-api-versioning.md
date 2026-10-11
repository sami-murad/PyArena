# ADR 0003: Versioned API paths under /api/v1

- Status: accepted
- Date: 2026-10-11

## Context

The API was served under `/api/...`. Future breaking changes (new response shapes, a second language) need a way to evolve without breaking deployed frontends or scripts.

## Decision

- All routes are served under `/api/v1`. New endpoints go only there.
- The old `/api/...` paths remain as aliases, hidden from the OpenAPI schema, and answer with `Deprecation: true` and a `Link` header pointing to the `/api/v1` path.
- The frontend uses `/api/v1` (`appConfig.apiPrefix`).
- Docs and the OpenAPI schema live at `/api/v1/docs` and `/api/v1/openapi.json` (not in production).
- Socket.IO stays at `/socket.io/`; its events are versioned by the client and server shipping together.

## Consequences

- Old clients keep working; the aliases can be removed in a later release after a notice period.
- A future `/api/v2` can be mounted beside v1 with the same routers or new ones.
- Every route exists twice in the router table; this costs nothing measurable.

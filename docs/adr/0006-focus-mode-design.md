# ADR 0006: Focus Mode as detection plus server-side escalation

- Status: accepted
- Date: 2026-10-11

## Context

Hosts want a way to discourage looking up answers in another tab during a live round. Browsers expose a few honest signals (`visibilitychange`, window `blur`/`focus`, `fullscreenchange`, `paste`), but anything that runs in the player's browser can be modified, and aggressive measures (blocking shortcuts, forcing fullscreen, reading the clipboard) hurt accessibility and trust while being easy to bypass anyway.

## Decision

- **Opt-in per room** (`competitions.focus_mode`), chosen by the host. Every player must accept a notice (what is detected, what is not, the escalation ladder, accessibility allowances) before they can get ready; the host cannot start until everyone has.
- **Detection only in the browser** (`useFocusGuard`): report signals, never block anything. Only the *length* of a paste is sent, never its content.
- **The server owns the rules** (`app/services/focus.py`): it times each absence, ignores those under `FOCUS_GRACE_MS` (2 s), counts the rest, and escalates: warnings (`FOCUS_WARN_LIMIT` = 3), then a submission pause (`FOCUS_PAUSE_SECONDS` = 30), then freezes (`FOCUS_FREEZE_SECONDS` = 60), and disqualification at violation `WARN_LIMIT + FOCUS_DQ_AFTER` (= 7).
- **Enforcement where it cannot be skipped**: when a submission arrives (423 while paused or frozen, 403 once disqualified), and in the judge (a disqualified player's accepted submission cannot claim the win).
- **Absence length** is the smaller of the server's measurement and the browser's (`away_ms`), because the "visible" request waits for the "hidden" one and slow networks would otherwise turn short glances into violations.
- **Opponents see a subtle "left tab" marker** only after the grace period, so blips never show; the activity feed lists counted events.
- **Leaving fullscreen is recorded but never counts.** Many people cannot or do not want to use fullscreen.
- **Two tables**: `focus_sessions` (current state per player and room) and `focus_violations` (an append-only record of what was reported and decided), so a host or admin can review what happened.

## Alternatives considered

- **Browser-side enforcement** (lock the editor in JavaScript, block shortcuts): trivially bypassed, hostile to assistive technology.
- **Server timing only**: unfair on slow or flaky connections; measured in development, a 0.4 s glance arrived as 2.2 s.
- **Webcam or screen proctoring**: invasive, out of scope for a free community tool, and against the project's honesty goals.

## Consequences

- Honest players get clear, predictable rules and warnings before any penalty.
- Determined cheaters with a modified client or a second device are not stopped; SECURITY.md says so plainly.
- New tables and migration 0005; new env vars in `backend/.env.example`; endpoints under `/api/v1/competitions/{id}/focus`.
- Tests: `backend/tests/test_focus.py`, `frontend/tests/focus.test.tsx`, `frontend/e2e/focus.spec.ts`.

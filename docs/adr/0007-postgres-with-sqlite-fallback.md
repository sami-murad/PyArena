# ADR 0007: PostgreSQL in production, SQLite for quick trials and fast tests

- Status: accepted
- Date: 2026-10-11

## Context

The winner of a competition is decided by a single conditional `UPDATE`, and several API processes may write at once, so production needs a database with real concurrency and transactional guarantees. At the same time, contributors should be able to try PyArena and run most tests without installing anything, and the test suite should be fast.

## Decision

- **PostgreSQL 16** is the production database (async SQLAlchemy 2 with `asyncpg`, migrations with Alembic). `ENVIRONMENT=production` refuses to start with an SQLite `DATABASE_URL`.
- **SQLite** (`aiosqlite`) is supported for single-user trials and is the test suite's default, because it needs no service and runs in a temporary file.
- **Portability rules** keep both working:
  - every migration uses `batch_alter_table` (SQLite cannot alter columns in place) and portable defaults such as `sa.false()`;
  - timestamps go through `UTCDateTime`, which restores the time zone SQLite drops;
  - constraint and index names come from one naming convention, so autogenerate produces the same names on both.
- **Both are tested**: `tests/test_migrations.py` runs upgrade, `alembic check` (the models match the migrations), downgrade and upgrade again on SQLite, and on PostgreSQL when `TEST_DATABASE_URL` is set. CI runs the full backend suite on both.

## Alternatives considered

- **PostgreSQL only**: simplest guarantees, but every test run and first try would need a running server.
- **SQLite in production**: serialises writes; not suitable for live competitions with several processes.

## Consequences

- Features must avoid PostgreSQL-only SQL (or guard it), or the SQLite path breaks; the migration test catches schema drift on both.
- SQLite results are not proof of PostgreSQL behaviour under concurrency; the race-sensitive tests (atomic winner, two replicas) are also run on PostgreSQL in CI.

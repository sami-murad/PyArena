# Database

PostgreSQL 16 with SQLAlchemy 2 (async, `asyncpg`) and Alembic. All timestamps are stored with time zone, in UTC.

## Tables

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | accounts | unique `username`, unique `email` (lower-cased), Argon2id `password_hash`; `deleted_at` (soft delete) |
| `questions` | problem statements, starter code, limits | unique `slug` |
| `test_cases` | judge tests; `is_public` marks examples | FK `question_id` (cascade), unique (`question_id`, `ordinal`) |
| `competitions` | rooms and their lifecycle | unique `code`, FK `host_id`, `question_id`, `winner_user_id`, `winner_submission_id`; indexed `status` |
| `competition_players` | membership, readiness, `left_at` | unique (`competition_id`, `user_id`) |
| `submissions` | every practice and competition submission | FKs to user, question, competition; index (`competition_id`, `id`) for receipt order; index (`user_id`, `created_at DESC`) for "my submissions" |
| `saved_snippets` | users' saved code | FK `user_id` (cascade); `deleted_at` (soft delete) |
| `idempotency_keys` | stored responses for repeated `Idempotency-Key` requests | unique (`scope`, `key`); index on `expires_at`; expired rows purged by the sweeper |

`competitions.winner_submission_id` and `submissions.competition_id` reference each other, so the migration creates that foreign key last.

User statistics are computed with queries (`UserRepository.statistics`) rather than stored in a `user_statistics` table, so they can never drift from the real data. A cached table can be added later if the queries become slow.

## Soft delete

`users.deleted_at` and `saved_snippets.deleted_at` mark rows as deleted without removing them. Repositories filter them out everywhere: a deleted snippet is invisible and returns 404; a deleted user cannot sign in and their existing session stops working. Their username and email stay reserved, and their past submissions and results keep their author. There is no endpoint that deletes accounts yet; the column prepares for one.

## Indexes considered and not added

- `competition_players(competition_id, user_id)`: already covered by the unique constraint `uq_competition_players_member`, which every supported database backs with an index.
- `test_cases(question_id, is_public)`: tests are always loaded in full per question, served by the unique (`question_id`, `ordinal`) index. An extra index would cost writes and help no query.

## Connection pool

PostgreSQL connections use `pool_pre_ping` (detects connections the server closed) and `pool_recycle` (replaces old ones). Size with `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT_SECONDS` and `DB_POOL_RECYCLE_SECONDS`. Keep `processes x (pool_size + max_overflow)` below PostgreSQL's `max_connections` (100 by default).

## Migrations

| Revision | Change |
|---|---|
| 0001 | initial schema |
| 0002 | `submissions(user_id, created_at DESC)` replaces the ascending index |
| 0003 | `deleted_at` on `users` and `saved_snippets` |
| 0004 | `idempotency_keys` table |

`tests/test_migrations.py` runs upgrade, `alembic check` (models match), downgrade and upgrade again on SQLite, and on PostgreSQL when `TEST_DATABASE_URL` is set.


```bash
cd backend
.venv/bin/alembic upgrade head                         # apply
.venv/bin/alembic revision --autogenerate -m "message"  # after changing models
.venv/bin/alembic downgrade -1                         # undo the last one
```

The database URL comes from `DATABASE_URL` (see `backend/.env.example`). Migrations were tested on PostgreSQL 16 and SQLite.

## Seed data

```bash
.venv/bin/python -m app.seed                      # database/seeds/questions.json
.venv/bin/python -m app.seed path/to/other.json   # another bank
```

Seeding is idempotent: questions are matched by `slug`, updated in place, and their tests replaced. To add or change questions, edit `database/seeds/build_questions.py` and run it; expected outputs are computed from the reference solutions, so the answer key cannot drift. The backend test suite submits every reference solution through the real sandbox.

## SQLite fallback

`DATABASE_URL=sqlite+aiosqlite:///./pyarena-dev.db` works for a quick single-user trial without PostgreSQL. SQLite serialises writes, so it is not suitable for real competitions. The test suite runs on SQLite by default and on PostgreSQL with `TEST_DATABASE_URL`.

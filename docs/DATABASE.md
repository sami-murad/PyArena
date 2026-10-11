# Database

PostgreSQL 16 with SQLAlchemy 2 (async, `asyncpg`) and Alembic. All timestamps are stored with time zone, in UTC.

## Tables

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | accounts | unique `username`, unique `email` (lower-cased), Argon2id `password_hash` |
| `questions` | problem statements, starter code, limits | unique `slug` |
| `test_cases` | judge tests; `is_public` marks examples | FK `question_id` (cascade), unique (`question_id`, `ordinal`) |
| `competitions` | rooms and their lifecycle | unique `code`, FK `host_id`, `question_id`, `winner_user_id`, `winner_submission_id`; indexed `status` |
| `competition_players` | membership, readiness, `left_at` | unique (`competition_id`, `user_id`) |
| `submissions` | every practice and competition submission | FKs to user, question, competition; index (`competition_id`, `id`) for receipt order |
| `saved_snippets` | users' saved code | FK `user_id` (cascade) |

`competitions.winner_submission_id` and `submissions.competition_id` reference each other, so the migration creates that foreign key last.

User statistics are computed with queries (`UserRepository.statistics`) rather than stored in a `user_statistics` table, so they can never drift from the real data. A cached table can be added later if the queries become slow.

## Migrations

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

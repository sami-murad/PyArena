# Architecture decision records

| ADR | Decision |
|---|---|
| [0001](0001-custom-runner-vs-judge0.md) | A custom judge worker instead of Judge0 |
| [0002](0002-redis-for-shared-state.md) | Redis for state shared between API processes |
| [0003](0003-api-versioning.md) | Versioned API paths under `/api/v1` |
| [0004](0004-sandbox-defence-layers.md) | Sandbox defence layers: seccomp per job, optional cgroups, optional gVisor |
| [0005](0005-argon2id-passwords.md) | Argon2id for password hashing |
| [0006](0006-focus-mode-design.md) | Focus Mode as detection plus server-side escalation |
| [0007](0007-postgres-with-sqlite-fallback.md) | PostgreSQL in production, SQLite for quick trials and fast tests |

The roadmap planned `0002-argon2id`, `0003-postgres-with-sqlite-fallback` and `0004-focus-mode-design`. Those numbers were taken by decisions recorded earlier (Redis, API versioning, sandbox layers), so they became 0005, 0007 and 0006.

To add one: copy the shape of an existing record (context, decision, alternatives, consequences), take the next number, and link it here.

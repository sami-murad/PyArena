# Architecture decision records

| ADR | Decision |
|---|---|
| [0001](0001-custom-runner-vs-judge0.md) | A custom judge worker instead of Judge0 |
| [0002](0002-redis-for-shared-state.md) | Redis for state shared between API processes |
| [0003](0003-api-versioning.md) | Versioned API paths under `/api/v1` |
| [0004](0004-sandbox-defence-layers.md) | Sandbox defence layers: seccomp per job, optional cgroups, optional gVisor |
| [0006](0006-focus-mode-design.md) | Focus Mode as detection plus server-side escalation |

The roadmap planned `0002-argon2id`, `0003-postgres-with-sqlite-fallback` and `0004-focus-mode`; those numbers were taken by decisions made earlier, so they follow in order.

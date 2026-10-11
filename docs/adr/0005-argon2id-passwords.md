# ADR 0005: Argon2id for password hashing

- Status: accepted
- Date: 2026-10-11

## Context

PyArena stores passwords for its own accounts. A database leak must not reveal them, and online guessing must be slow and rate limited. The common choices are bcrypt, scrypt, PBKDF2 and Argon2.

## Decision

- Hash with **Argon2id** through `argon2-cffi`'s `PasswordHasher` (`backend/app/security/passwords.py`), using its defaults, which follow the RFC 9106 recommendations. Argon2id is memory-hard (it resists GPU and ASIC cracking) and won the Password Hashing Competition.
- **Rehash on login** when the parameters change (`check_needs_rehash`), so raising the cost later upgrades existing hashes without a migration.
- **Equal timing for unknown users**: verification runs against a precomputed dummy hash when the username does not exist, and both cases return the same error, so login cannot be used to find accounts.
- Passwords are never logged or returned, and login and registration are rate limited (Redis, shared by all API processes).

## Alternatives considered

- **bcrypt**: well proven, but not memory-hard and truncates input at 72 bytes.
- **scrypt**: memory-hard, but its parameters are harder to tune, and Argon2id is the current recommendation (OWASP Password Storage Cheat Sheet).
- **PBKDF2**: only CPU-hard; needs very high iteration counts to compete.

## Consequences

- Each login costs a few tens of milliseconds of CPU and some memory (argon2-cffi defaults: 64 MiB, 3 iterations, 4 lanes). That is acceptable at PyArena's scale and is another reason login is rate limited.
- The `argon2-cffi` wheel is a native dependency; it ships prebuilt for the platforms we use.

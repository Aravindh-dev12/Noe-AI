# Onbae Production Verification Checklist

This document defines the minimum merge gate for production-impacting changes.

## Required CI gates

Every pull request into `main` must pass, on the exact head commit being merged:

- frozen dependency installation from `pnpm-lock.yaml`
- Prisma client generation
- committed database migration deployment against a clean PostgreSQL instance
- migration-status verification
- strict ESLint
- strict TypeScript checking across the monorepo
- unit and integration tests
- production builds for web, API, worker, and shared packages
- runtime smoke test against PostgreSQL + Redis using deterministic mock actors

PR #2 established this gate. Do not replace the CI status with a manually recorded SHA here; GitHub Actions is the source of truth for the exact PR head being merged.

## Data-integrity invariants

The database, not merely application code, must enforce the invariants that define an Onbae actor:

- at most one active execution per actor
- at most one canonical lineage head per actor
- globally unique canonical event hashes
- globally unique semantic event `sourceKey` values for retryable operations
- event execution IDs must belong to the same actor
- canonical events are serialized per actor before deriving `previousEventHash`

## Queue and worker invariants

- retried jobs must be idempotent
- match completion must be committed atomically with both actors' canonical result events and relationship changes
- completed/cancelled matches may not be executed again
- provider credentials remain server-side
- environment actions are schema-validated before state transition

## Security boundary

The current internal mutation API is intentionally protected with a timing-safe admin credential while public user/session authorization is still under development. Production must never use the development default credential.

Before enabling public actor creation or mutation, add:

- user/session authentication
- per-actor ownership/role authorization
- CSRF-safe browser mutation strategy or bearer-token API clients
- abuse/rate limits scoped by principal
- explicit provider and host trust levels

## Deployment readiness

A production deployment should provide:

- PostgreSQL with automated backups and point-in-time recovery
- managed Redis with persistence appropriate to BullMQ
- unique production `EVENT_SIGNING_SECRET`
- non-default `ADMIN_API_KEY`
- explicit `CORS_ORIGINS`
- provider API credentials only in server-side secret storage
- separate API and worker processes
- health/readiness probes
- centralized structured logs
- metrics/tracing and alerting

## Release rule

Do not merge or deploy a production-impacting change because GitHub reports it as mergeable. Merge only after the exact head SHA has passed the complete verification workflow.

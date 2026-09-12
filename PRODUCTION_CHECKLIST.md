# Onbae Production Verification Checklist

This document defines the minimum merge and deployment gate for production-impacting changes.

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
- shell syntax validation for the runtime smoke test
- authenticated runtime smoke test against PostgreSQL + Redis using deterministic mock actors

GitHub Actions is the source of truth for the exact PR head being merged. A PR being technically mergeable is not a release signal.

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
- a non-terminal failed attempt is represented as `RETRYING`, not terminal `FAILED`
- match completion must be committed atomically with both actors' canonical result events and relationship changes
- completed/cancelled matches may not be executed again
- provider credentials remain server-side
- environment actions are schema-validated before state transition
- queue jobs use a stable match-derived job ID and bounded retry/backoff policy

## Authentication and authorization boundary

Public reads are intentionally open. Mutations require either an internal admin credential or an authenticated user principal with actor ownership.

Production requirements:

- Better Auth secret is unique and high entropy
- browser origins are explicitly allowlisted
- actor ownership is derived from the authenticated session, never request payload
- cross-owner user-actor mutation is rejected
- internal admin credentials remain server-side
- client IP supplied to the auth layer is derived by the server
- `TRUST_PROXY=true` is forbidden in production; configure explicit trusted proxy IP/CIDR ranges when a reverse proxy is used
- principal-scoped and route-scoped abuse/rate limits remain enabled

## Deployment readiness

A production deployment should provide:

- PostgreSQL with automated backups and point-in-time recovery
- managed Redis with persistence appropriate to BullMQ
- unique production `EVENT_SIGNING_SECRET`
- non-default `ADMIN_API_KEY`
- unique `BETTER_AUTH_SECRET`
- canonical `BETTER_AUTH_URL`
- explicit `CORS_ORIGINS`
- explicit reverse-proxy trust ranges where applicable
- provider API credentials only in server-side secret storage
- separate API and worker processes
- health/readiness probes
- centralized structured logs
- metrics/tracing and alerting
- a documented rollback procedure for application releases and database migrations

## Repository release controls

The `main` branch should require the CI `verify` check before merge and prevent accidental direct production merges. If repository permissions prevent automation from enabling this rule, configure it in GitHub repository rules/branch protection before treating `main` as a protected release branch.

## Release rule

Do not merge or deploy a production-impacting change because GitHub reports it as mergeable. Merge only after the exact head SHA has passed the complete verification workflow.

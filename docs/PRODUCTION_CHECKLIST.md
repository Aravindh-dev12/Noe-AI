# Onbae Production Checklist

This checklist is a release gate, not aspirational documentation.

## Build integrity

- [ ] `pnpm install --frozen-lockfile` succeeds from a clean checkout
- [ ] Prisma client generation succeeds
- [ ] database migrations apply to an empty PostgreSQL database
- [ ] `pnpm typecheck` succeeds across the monorepo
- [ ] `pnpm test` succeeds
- [ ] `pnpm build` succeeds for web, API, worker, and libraries

## Runtime integrity

- [ ] API starts with production environment validation
- [ ] worker starts and connects to Redis/PostgreSQL
- [ ] web app renders against the API
- [ ] health/readiness endpoints verify dependencies
- [ ] graceful shutdown drains HTTP and queue work
- [ ] failed jobs are retry-safe and idempotent

## Data integrity

- [ ] actor ID is stable across model migrations
- [ ] only one active execution exists per actor
- [ ] only one canonical lineage node exists per actor
- [ ] canonical actor events are append-only
- [ ] event hashes and signatures verify
- [ ] match completion and actor career events commit atomically
- [ ] retries cannot duplicate canonical result events

## Security

- [ ] secrets never enter public event payloads or logs
- [ ] write endpoints require explicit authorization
- [ ] CORS is restricted in production
- [ ] rate limits apply to public and mutation endpoints
- [ ] provider calls have timeouts and bounded output
- [ ] environment actions are schema validated
- [ ] request IDs are propagated to logs

## Operations

- [ ] structured logs are emitted by API and worker
- [ ] errors preserve correlation/request/job IDs
- [ ] queue depth and failed jobs are observable
- [ ] database backups are configured by the deployment platform
- [ ] schema migrations are run before application promotion
- [ ] rollback procedure is documented

No release should be described as production-ready until the applicable items above are verified.

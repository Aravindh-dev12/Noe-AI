# ADR 0002: Production release gate

## Status
Accepted

## Decision
Onbae changes that affect runtime, persistence, actor continuity, event provenance, or deployment must pass CI before merge.

Required checks are typecheck, tests, build, and database migration validation. Smoke tests and idempotency checks will be added to the same gate as the runtime stabilizes.

## Rationale
Onbae's product depends on durable identity and canonical history. Reliability failures in these layers can permanently corrupt user-visible history, so merge velocity is subordinate to integrity.

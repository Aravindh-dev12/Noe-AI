# ADR 0001: Stabilize before expansion

## Status
Accepted

## Context
The initial production-foundation pull request was merged before CI completed successfully. The branch contained the intended architecture, but strict TypeScript checks still exposed API boundary issues.

## Decision
Onbae will treat green CI as a merge gate for subsequent production changes. Stabilization work will precede additional product features.

The verification sequence is:

1. install dependencies reproducibly;
2. generate Prisma client;
3. apply schema to an ephemeral PostgreSQL instance;
4. typecheck all packages;
5. run unit/integration tests;
6. build every deployable package;
7. add smoke tests for API/worker/web startup before production deployment.

## Consequences
Feature work may pause while reliability issues are resolved. This is intentional: actor continuity and canonical event history are infrastructure primitives, so silent schema/runtime errors are unacceptable.

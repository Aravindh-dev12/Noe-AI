-- Continuity governance deliberately distinguishes same-actor transitions from
-- cross-actor ancestry. The partial unique indexes make the two most important
-- canonicality invariants database-enforced rather than application conventions.

CREATE TYPE "ContinuityTransitionKind" AS ENUM ('MIGRATION', 'RESTORE', 'MERGE');
CREATE TYPE "ContinuityTransitionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ActorExecution"
    WHERE "endedAt" IS NULL
    GROUP BY "actorId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'continuity migration aborted: actor with multiple live executions exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LineageNode"
    WHERE "canonical" = TRUE
    GROUP BY "actorId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'continuity migration aborted: actor with multiple canonical lineage heads exists';
  END IF;
END $$;

CREATE TABLE "ContinuityTransition" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "kind" "ContinuityTransitionKind" NOT NULL,
  "status" "ContinuityTransitionStatus" NOT NULL DEFAULT 'PROPOSED',
  "predecessorLineageId" TEXT NOT NULL,
  "predecessorExecutionId" TEXT NOT NULL,
  "proposedProvider" TEXT NOT NULL,
  "proposedModel" TEXT NOT NULL,
  "proposedRuntime" TEXT,
  "proposedConfigHash" TEXT NOT NULL,
  "resultingExecutionId" TEXT,
  "resultingLineageId" TEXT,
  "proposedByType" TEXT NOT NULL,
  "proposedById" TEXT,
  "policyVersion" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "reason" TEXT,
  "changeSet" JSONB NOT NULL DEFAULT '{}',
  "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "decisionReason" TEXT,

  CONSTRAINT "ContinuityTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActorAncestry" (
  "id" TEXT NOT NULL,
  "childActorId" TEXT NOT NULL,
  "parentActorId" TEXT NOT NULL,
  "sourceLineageId" TEXT NOT NULL,
  "sourceEventSequence" INTEGER,
  "sourceEventHash" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActorAncestry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContinuityTransition_resultingExecutionId_key"
  ON "ContinuityTransition"("resultingExecutionId");
CREATE UNIQUE INDEX "ContinuityTransition_resultingLineageId_key"
  ON "ContinuityTransition"("resultingLineageId");
CREATE UNIQUE INDEX "ContinuityTransition_idempotencyKey_key"
  ON "ContinuityTransition"("idempotencyKey");
CREATE INDEX "ContinuityTransition_actorId_proposedAt_idx"
  ON "ContinuityTransition"("actorId", "proposedAt");
CREATE INDEX "ContinuityTransition_actorId_status_proposedAt_idx"
  ON "ContinuityTransition"("actorId", "status", "proposedAt");
CREATE INDEX "ContinuityTransition_predecessorLineageId_idx"
  ON "ContinuityTransition"("predecessorLineageId");

CREATE UNIQUE INDEX "ActorAncestry_childActorId_key"
  ON "ActorAncestry"("childActorId");
CREATE INDEX "ActorAncestry_parentActorId_createdAt_idx"
  ON "ActorAncestry"("parentActorId", "createdAt");
CREATE INDEX "ActorAncestry_sourceLineageId_idx"
  ON "ActorAncestry"("sourceLineageId");

-- These partial indexes are intentionally outside Prisma's declarative schema.
-- They enforce one live execution and one canonical lineage head per actor.
CREATE UNIQUE INDEX "ActorExecution_one_live_per_actor"
  ON "ActorExecution"("actorId")
  WHERE "endedAt" IS NULL;

CREATE UNIQUE INDEX "LineageNode_one_canonical_per_actor"
  ON "LineageNode"("actorId")
  WHERE "canonical" = TRUE;

ALTER TABLE "ContinuityTransition"
  ADD CONSTRAINT "ContinuityTransition_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActorAncestry"
  ADD CONSTRAINT "ActorAncestry_parentActorId_fkey"
  FOREIGN KEY ("parentActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActorAncestry"
  ADD CONSTRAINT "ActorAncestry_childActorId_fkey"
  FOREIGN KEY ("childActorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

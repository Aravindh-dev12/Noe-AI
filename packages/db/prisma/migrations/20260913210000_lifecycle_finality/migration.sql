-- Lifecycle Finality & Resurrection Provenance
--
-- A closure is an actor-level institutional fact, not merely a runtime flag.
-- Resurrection claims are deliberately not ActorExecution rows: a candidate
-- must not become the historical actor simply by claiming its identity.

CREATE TABLE "ActorLifecycleClosure" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "executionId" TEXT,
    "kind" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "sourceEvidenceArtifactId" TEXT NOT NULL,
    "externalLifecycleRef" TEXT,
    "proofOfDecommissionRef" TEXT,
    "reasonCode" TEXT,
    "issuedByType" TEXT NOT NULL,
    "issuedByRef" TEXT NOT NULL,
    "authorityEvidenceArtifactId" TEXT NOT NULL,
    "continuationPolicy" TEXT NOT NULL,
    "recoveryPolicyDigest" TEXT,
    "basisDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActorLifecycleClosure_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActorLifecycleClosure_kind_check" CHECK (
      "kind" IN ('RETIREMENT','REVOCATION','DECOMMISSION','LOST_CONTROL','OWNER_CESSATION')
    ),
    CONSTRAINT "ActorLifecycleClosure_policy_check" CHECK (
      "continuationPolicy" IN ('PROHIBITED','REVIEW_REQUIRED','PREAUTHORIZED_RECOVERY')
    ),
    CONSTRAINT "ActorLifecycleClosure_time_check" CHECK (
      "capturedAt" >= "effectiveAt"
    ),
    CONSTRAINT "ActorLifecycleClosure_recovery_policy_check" CHECK (
      ("continuationPolicy" = 'PREAUTHORIZED_RECOVERY' AND "recoveryPolicyDigest" IS NOT NULL)
      OR
      ("continuationPolicy" = 'PROHIBITED' AND "recoveryPolicyDigest" IS NULL)
      OR
      ("continuationPolicy" = 'REVIEW_REQUIRED')
    )
);

CREATE TABLE "ResurrectionClaim" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "closureId" TEXT NOT NULL,
    "candidateExecutionId" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "sourceSnapshotDigest" TEXT,
    "sourceLineageNodeId" TEXT NOT NULL,
    "continuationAuthorityRef" TEXT NOT NULL,
    "recoveryEvidenceArtifactId" TEXT NOT NULL,
    "credentialEvidenceArtifactId" TEXT,
    "stateCommitmentDigest" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL,
    "basisDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResurrectionClaim_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResurrectionClaim_type_check" CHECK (
      "claimType" IN (
        'SAME_ACTOR_RECOVERY',
        'RESTORE_FROM_CHECKPOINT',
        'KEY_RECOVERY',
        'HOST_RECOVERY',
        'DISASTER_RECOVERY'
      )
    )
);

CREATE TABLE "ResurrectionDecision" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "closureId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "decidedByType" TEXT NOT NULL,
    "decidedByRef" TEXT NOT NULL,
    "authorityEvidenceArtifactId" TEXT NOT NULL,
    "evidenceArtifactId" TEXT NOT NULL,
    "basisDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResurrectionDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResurrectionDecision_disposition_check" CHECK (
      "disposition" IN ('ACCEPT_SAME_ACTOR','REJECT_DISTINCT_ACTOR','REQUIRE_ADDITIONAL_REVIEW')
    )
);

CREATE UNIQUE INDEX "ActorLifecycleClosure_basisDigest_key"
  ON "ActorLifecycleClosure"("basisDigest");
CREATE UNIQUE INDEX "ActorLifecycleClosure_idempotencyKey_key"
  ON "ActorLifecycleClosure"("idempotencyKey");
CREATE INDEX "ActorLifecycleClosure_actorId_effectiveAt_idx"
  ON "ActorLifecycleClosure"("actorId", "effectiveAt");
CREATE INDEX "ActorLifecycleClosure_executionId_idx"
  ON "ActorLifecycleClosure"("executionId");
CREATE INDEX "ActorLifecycleClosure_sourceEvidenceArtifactId_idx"
  ON "ActorLifecycleClosure"("sourceEvidenceArtifactId");
CREATE INDEX "ActorLifecycleClosure_authorityEvidenceArtifactId_idx"
  ON "ActorLifecycleClosure"("authorityEvidenceArtifactId");

CREATE UNIQUE INDEX "ResurrectionClaim_basisDigest_key"
  ON "ResurrectionClaim"("basisDigest");
CREATE UNIQUE INDEX "ResurrectionClaim_idempotencyKey_key"
  ON "ResurrectionClaim"("idempotencyKey");
CREATE UNIQUE INDEX "ResurrectionClaim_candidateExecutionId_key"
  ON "ResurrectionClaim"("candidateExecutionId");
CREATE INDEX "ResurrectionClaim_closureId_claimedAt_idx"
  ON "ResurrectionClaim"("closureId", "claimedAt");
CREATE INDEX "ResurrectionClaim_actorId_claimedAt_idx"
  ON "ResurrectionClaim"("actorId", "claimedAt");
CREATE INDEX "ResurrectionClaim_sourceLineageNodeId_idx"
  ON "ResurrectionClaim"("sourceLineageNodeId");
CREATE INDEX "ResurrectionClaim_recoveryEvidenceArtifactId_idx"
  ON "ResurrectionClaim"("recoveryEvidenceArtifactId");
CREATE INDEX "ResurrectionClaim_credentialEvidenceArtifactId_idx"
  ON "ResurrectionClaim"("credentialEvidenceArtifactId");

CREATE UNIQUE INDEX "ResurrectionDecision_basisDigest_key"
  ON "ResurrectionDecision"("basisDigest");
CREATE UNIQUE INDEX "ResurrectionDecision_idempotencyKey_key"
  ON "ResurrectionDecision"("idempotencyKey");
CREATE INDEX "ResurrectionDecision_claimId_decidedAt_idx"
  ON "ResurrectionDecision"("claimId", "decidedAt");
CREATE INDEX "ResurrectionDecision_closureId_decidedAt_idx"
  ON "ResurrectionDecision"("closureId", "decidedAt");
CREATE INDEX "ResurrectionDecision_actorId_decidedAt_idx"
  ON "ResurrectionDecision"("actorId", "decidedAt");
CREATE INDEX "ResurrectionDecision_authorityEvidenceArtifactId_idx"
  ON "ResurrectionDecision"("authorityEvidenceArtifactId");
CREATE INDEX "ResurrectionDecision_evidenceArtifactId_idx"
  ON "ResurrectionDecision"("evidenceArtifactId");

-- One lifecycle closure can have many competing/rejected candidates but only
-- one candidate may ever be accepted as the canonical continuation.
CREATE UNIQUE INDEX "ResurrectionDecision_one_accepted_per_closure"
  ON "ResurrectionDecision"("closureId")
  WHERE "disposition" = 'ACCEPT_SAME_ACTOR';

ALTER TABLE "ActorLifecycleClosure"
  ADD CONSTRAINT "ActorLifecycleClosure_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ActorLifecycleClosure_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "ActorExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ActorLifecycleClosure_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ActorLifecycleClosure_authorityEvidenceArtifactId_fkey"
  FOREIGN KEY ("authorityEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ResurrectionClaim"
  ADD CONSTRAINT "ResurrectionClaim_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ResurrectionClaim_closureId_fkey"
  FOREIGN KEY ("closureId") REFERENCES "ActorLifecycleClosure"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ResurrectionClaim_sourceLineageNodeId_fkey"
  FOREIGN KEY ("sourceLineageNodeId") REFERENCES "LineageNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ResurrectionClaim_recoveryEvidenceArtifactId_fkey"
  FOREIGN KEY ("recoveryEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ResurrectionClaim_credentialEvidenceArtifactId_fkey"
  FOREIGN KEY ("credentialEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ResurrectionDecision"
  ADD CONSTRAINT "ResurrectionDecision_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "ResurrectionClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ResurrectionDecision_closureId_fkey"
  FOREIGN KEY ("closureId") REFERENCES "ActorLifecycleClosure"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ResurrectionDecision_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ResurrectionDecision_authorityEvidenceArtifactId_fkey"
  FOREIGN KEY ("authorityEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ResurrectionDecision_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_lifecycle_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'NOEONE lifecycle finality history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActorLifecycleClosure_guard_update"
BEFORE UPDATE ON "ActorLifecycleClosure"
FOR EACH ROW EXECUTE FUNCTION noeone_lifecycle_append_only();
CREATE TRIGGER "ActorLifecycleClosure_guard_delete"
BEFORE DELETE ON "ActorLifecycleClosure"
FOR EACH ROW EXECUTE FUNCTION noeone_lifecycle_append_only();
CREATE TRIGGER "ResurrectionClaim_guard_update"
BEFORE UPDATE ON "ResurrectionClaim"
FOR EACH ROW EXECUTE FUNCTION noeone_lifecycle_append_only();
CREATE TRIGGER "ResurrectionClaim_guard_delete"
BEFORE DELETE ON "ResurrectionClaim"
FOR EACH ROW EXECUTE FUNCTION noeone_lifecycle_append_only();
CREATE TRIGGER "ResurrectionDecision_guard_update"
BEFORE UPDATE ON "ResurrectionDecision"
FOR EACH ROW EXECUTE FUNCTION noeone_lifecycle_append_only();
CREATE TRIGGER "ResurrectionDecision_guard_delete"
BEFORE DELETE ON "ResurrectionDecision"
FOR EACH ROW EXECUTE FUNCTION noeone_lifecycle_append_only();

CREATE OR REPLACE FUNCTION noeone_validate_lifecycle_closure()
RETURNS TRIGGER AS $$
DECLARE
  execution_actor TEXT;
BEGIN
  IF NEW."executionId" IS NOT NULL THEN
    SELECT "actorId" INTO execution_actor
    FROM "ActorExecution"
    WHERE "id" = NEW."executionId";

    IF execution_actor IS NULL OR execution_actor <> NEW."actorId" THEN
      RAISE EXCEPTION 'lifecycle closure execution does not belong to actor';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActorLifecycleClosure_validate_insert"
BEFORE INSERT ON "ActorLifecycleClosure"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_lifecycle_closure();

CREATE OR REPLACE FUNCTION noeone_validate_resurrection_claim()
RETURNS TRIGGER AS $$
DECLARE
  closure_record "ActorLifecycleClosure"%ROWTYPE;
  lineage_actor TEXT;
BEGIN
  SELECT * INTO closure_record
  FROM "ActorLifecycleClosure"
  WHERE "id" = NEW."closureId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lifecycle closure not found';
  END IF;

  IF closure_record."actorId" <> NEW."actorId" THEN
    RAISE EXCEPTION 'resurrection claim actor does not match lifecycle closure actor';
  END IF;

  IF NEW."claimedAt" < closure_record."effectiveAt" THEN
    RAISE EXCEPTION 'resurrection claim cannot predate lifecycle closure';
  END IF;

  SELECT "actorId" INTO lineage_actor
  FROM "LineageNode"
  WHERE "id" = NEW."sourceLineageNodeId";

  IF lineage_actor IS NULL OR lineage_actor <> NEW."actorId" THEN
    RAISE EXCEPTION 'resurrection source lineage does not belong to actor';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "ResurrectionDecision"
    WHERE "closureId" = NEW."closureId"
      AND "disposition" = 'ACCEPT_SAME_ACTOR'
  ) THEN
    RAISE EXCEPTION 'lifecycle closure has already been crossed by an accepted continuation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ResurrectionClaim_validate_insert"
BEFORE INSERT ON "ResurrectionClaim"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_resurrection_claim();

CREATE OR REPLACE FUNCTION noeone_validate_resurrection_decision()
RETURNS TRIGGER AS $$
DECLARE
  claim_record "ResurrectionClaim"%ROWTYPE;
  closure_record "ActorLifecycleClosure"%ROWTYPE;
BEGIN
  SELECT * INTO claim_record
  FROM "ResurrectionClaim"
  WHERE "id" = NEW."claimId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resurrection claim not found';
  END IF;

  SELECT * INTO closure_record
  FROM "ActorLifecycleClosure"
  WHERE "id" = claim_record."closureId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lifecycle closure not found';
  END IF;

  IF NEW."closureId" <> claim_record."closureId"
     OR NEW."actorId" <> claim_record."actorId"
     OR NEW."actorId" <> closure_record."actorId" THEN
    RAISE EXCEPTION 'resurrection decision actor/closure binding is inconsistent';
  END IF;

  IF NEW."decidedAt" < claim_record."claimedAt" THEN
    RAISE EXCEPTION 'resurrection decision cannot predate claim';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "ResurrectionDecision"
    WHERE "claimId" = NEW."claimId"
      AND "disposition" IN ('ACCEPT_SAME_ACTOR','REJECT_DISTINCT_ACTOR')
  ) THEN
    RAISE EXCEPTION 'resurrection claim already has a terminal decision';
  END IF;

  IF NEW."disposition" = 'ACCEPT_SAME_ACTOR'
     AND closure_record."continuationPolicy" = 'PROHIBITED' THEN
    RAISE EXCEPTION 'lifecycle closure prohibits same-actor continuation';
  END IF;

  IF NEW."disposition" IN ('ACCEPT_SAME_ACTOR','REQUIRE_ADDITIONAL_REVIEW')
     AND EXISTS (
       SELECT 1 FROM "ResurrectionDecision"
       WHERE "closureId" = NEW."closureId"
         AND "disposition" = 'ACCEPT_SAME_ACTOR'
     ) THEN
    RAISE EXCEPTION 'lifecycle closure has already accepted another continuation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ResurrectionDecision_validate_insert"
BEFORE INSERT ON "ResurrectionDecision"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_resurrection_decision();

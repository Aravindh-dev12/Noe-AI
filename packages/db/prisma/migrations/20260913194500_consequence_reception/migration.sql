-- Consequence Reception / Corrective-State Continuity
--
-- These records are actor-level institutional state. They deliberately survive
-- model/runtime migrations because they reference Actor, not ActorExecution.

CREATE TABLE "ConsequenceReception" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "sourceConsequenceId" TEXT,
    "sourceAttributionId" TEXT,
    "sourceClaimId" TEXT,
    "sourceRemedyId" TEXT,
    "sourceEvidenceArtifactId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "scope" JSONB NOT NULL,
    "termsDigest" TEXT NOT NULL,
    "restorationCriteriaDigest" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reviewAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "issuedByType" TEXT NOT NULL,
    "issuedByRef" TEXT NOT NULL,
    "authorityEvidenceArtifactId" TEXT NOT NULL,
    "migrationPolicy" TEXT NOT NULL DEFAULT 'CARRY_WITH_ACTOR',
    "forkPolicy" TEXT NOT NULL DEFAULT 'DO_NOT_INHERIT',
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "basisDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsequenceReception_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConsequenceReception_source_required" CHECK (
      "sourceConsequenceId" IS NOT NULL OR
      "sourceAttributionId" IS NOT NULL OR
      "sourceClaimId" IS NOT NULL OR
      "sourceRemedyId" IS NOT NULL
    ),
    CONSTRAINT "ConsequenceReception_kind_check" CHECK (
      "kind" IN ('RESTRICTION','REMEDIATION','PROBATION','SUSPENSION','DISCLOSURE')
    ),
    CONSTRAINT "ConsequenceReception_status_check" CHECK (
      "status" IN ('ACTIVE','SATISFIED','LIFTED','SUPERSEDED')
    ),
    CONSTRAINT "ConsequenceReception_migration_policy_check" CHECK (
      "migrationPolicy" = 'CARRY_WITH_ACTOR'
    ),
    CONSTRAINT "ConsequenceReception_fork_policy_check" CHECK (
      "forkPolicy" = 'DO_NOT_INHERIT'
    ),
    CONSTRAINT "ConsequenceReception_time_check" CHECK (
      "capturedAt" >= "effectiveAt" AND
      ("reviewAt" IS NULL OR "reviewAt" >= "effectiveAt") AND
      ("expiresAt" IS NULL OR "expiresAt" > "effectiveAt")
    ),
    CONSTRAINT "ConsequenceReception_scope_shape_check" CHECK (
      jsonb_typeof("scope") = 'object' AND
      jsonb_typeof("scope"->'global') = 'boolean' AND
      jsonb_typeof("scope"->'actions') = 'array' AND
      jsonb_typeof("scope"->'resources') = 'array' AND
      jsonb_typeof("scope"->'capabilities') = 'array' AND
      jsonb_typeof("scope"->'environmentRefs') = 'array'
    ),
    CONSTRAINT "ConsequenceReception_suspension_global_check" CHECK (
      "kind" <> 'SUSPENSION' OR ("scope"->>'global')::boolean = TRUE
    )
);

CREATE TABLE "ConsequenceReceptionTransition" (
    "id" TEXT NOT NULL,
    "receptionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "evidenceArtifactId" TEXT NOT NULL,
    "decidedByType" TEXT NOT NULL,
    "decidedByRef" TEXT NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "basisDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsequenceReceptionTransition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConsequenceReceptionTransition_from_check" CHECK ("fromStatus" = 'ACTIVE'),
    CONSTRAINT "ConsequenceReceptionTransition_to_check" CHECK (
      "toStatus" IN ('SATISFIED','LIFTED','SUPERSEDED')
    )
);

CREATE UNIQUE INDEX "ConsequenceReception_basisDigest_key" ON "ConsequenceReception"("basisDigest");
CREATE UNIQUE INDEX "ConsequenceReception_idempotencyKey_key" ON "ConsequenceReception"("idempotencyKey");
CREATE INDEX "ConsequenceReception_actorId_status_effectiveAt_idx" ON "ConsequenceReception"("actorId", "status", "effectiveAt");
CREATE INDEX "ConsequenceReception_sourceConsequenceId_idx" ON "ConsequenceReception"("sourceConsequenceId");
CREATE INDEX "ConsequenceReception_sourceAttributionId_idx" ON "ConsequenceReception"("sourceAttributionId");
CREATE INDEX "ConsequenceReception_sourceClaimId_idx" ON "ConsequenceReception"("sourceClaimId");
CREATE INDEX "ConsequenceReception_sourceRemedyId_idx" ON "ConsequenceReception"("sourceRemedyId");
CREATE INDEX "ConsequenceReception_sourceEvidenceArtifactId_idx" ON "ConsequenceReception"("sourceEvidenceArtifactId");
CREATE INDEX "ConsequenceReception_authorityEvidenceArtifactId_idx" ON "ConsequenceReception"("authorityEvidenceArtifactId");

CREATE UNIQUE INDEX "ConsequenceReceptionTransition_receptionId_key" ON "ConsequenceReceptionTransition"("receptionId");
CREATE UNIQUE INDEX "ConsequenceReceptionTransition_basisDigest_key" ON "ConsequenceReceptionTransition"("basisDigest");
CREATE UNIQUE INDEX "ConsequenceReceptionTransition_idempotencyKey_key" ON "ConsequenceReceptionTransition"("idempotencyKey");
CREATE INDEX "ConsequenceReceptionTransition_actorId_occurredAt_idx" ON "ConsequenceReceptionTransition"("actorId", "occurredAt");
CREATE INDEX "ConsequenceReceptionTransition_evidenceArtifactId_idx" ON "ConsequenceReceptionTransition"("evidenceArtifactId");

ALTER TABLE "ConsequenceReception"
  ADD CONSTRAINT "ConsequenceReception_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsequenceReception_sourceConsequenceId_fkey"
  FOREIGN KEY ("sourceConsequenceId") REFERENCES "ConsequenceObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsequenceReception_sourceAttributionId_fkey"
  FOREIGN KEY ("sourceAttributionId") REFERENCES "ConsequenceAttribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsequenceReception_sourceClaimId_fkey"
  FOREIGN KEY ("sourceClaimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsequenceReception_sourceRemedyId_fkey"
  FOREIGN KEY ("sourceRemedyId") REFERENCES "RemedyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsequenceReception_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsequenceReception_authorityEvidenceArtifactId_fkey"
  FOREIGN KEY ("authorityEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsequenceReceptionTransition"
  ADD CONSTRAINT "ConsequenceReceptionTransition_receptionId_fkey"
  FOREIGN KEY ("receptionId") REFERENCES "ConsequenceReception"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsequenceReceptionTransition_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ConsequenceReceptionTransition_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_consequence_reception()
RETURNS TRIGGER AS $$
DECLARE
  linked_claim_id TEXT;
BEGIN
  IF NEW."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'new consequence reception must start ACTIVE';
  END IF;

  IF NEW."sourceAttributionId" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "ConsequenceAttribution" a
      WHERE a."id" = NEW."sourceAttributionId"
        AND a."actorId" = NEW."actorId"
    ) THEN
      RAISE EXCEPTION 'source attribution does not belong to actor';
    END IF;

    IF NEW."sourceConsequenceId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "ConsequenceAttribution" a
      WHERE a."id" = NEW."sourceAttributionId"
        AND a."consequenceId" = NEW."sourceConsequenceId"
    ) THEN
      RAISE EXCEPTION 'source attribution and consequence disagree';
    END IF;
  END IF;

  IF NEW."sourceClaimId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ClaimActorLink" l
    WHERE l."claimId" = NEW."sourceClaimId"
      AND l."actorId" = NEW."actorId"
  ) THEN
    RAISE EXCEPTION 'source claim is not linked to actor';
  END IF;

  IF NEW."sourceRemedyId" IS NOT NULL THEN
    SELECT r."claimId" INTO linked_claim_id
    FROM "RemedyOrder" r WHERE r."id" = NEW."sourceRemedyId";

    IF linked_claim_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM "ClaimActorLink" l
      WHERE l."claimId" = linked_claim_id
        AND l."actorId" = NEW."actorId"
    ) THEN
      RAISE EXCEPTION 'source remedy claim is not linked to actor';
    END IF;

    IF NEW."sourceClaimId" IS NOT NULL AND linked_claim_id <> NEW."sourceClaimId" THEN
      RAISE EXCEPTION 'source remedy and claim disagree';
    END IF;
  END IF;

  IF NEW."sourceConsequenceId" IS NOT NULL
     AND NEW."sourceAttributionId" IS NULL
     AND NEW."sourceClaimId" IS NULL
     AND NEW."sourceRemedyId" IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM "ConsequenceAttribution" a
       WHERE a."consequenceId" = NEW."sourceConsequenceId"
         AND a."actorId" = NEW."actorId"
         AND a."disposition"::text = 'SUPPORTED'
     ) THEN
    RAISE EXCEPTION 'bare consequence source requires supported attribution to actor';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsequenceReception_validate_insert"
BEFORE INSERT ON "ConsequenceReception"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_consequence_reception();

CREATE OR REPLACE FUNCTION noeone_guard_consequence_reception_update()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'consequence reception cannot be updated directly; append a transition';
  END IF;

  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'consequence reception issuance facts are immutable';
  END IF;

  IF OLD."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'terminal consequence reception state is immutable';
  END IF;

  IF NEW."status" NOT IN ('SATISFIED','LIFTED','SUPERSEDED') THEN
    RAISE EXCEPTION 'invalid terminal consequence reception status';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsequenceReception_guard_update"
BEFORE UPDATE ON "ConsequenceReception"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_consequence_reception_update();

CREATE OR REPLACE FUNCTION noeone_guard_consequence_reception_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'consequence reception history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsequenceReception_guard_delete"
BEFORE DELETE ON "ConsequenceReception"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_consequence_reception_delete();

CREATE TRIGGER "ConsequenceReceptionTransition_guard_delete"
BEFORE DELETE ON "ConsequenceReceptionTransition"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_consequence_reception_delete();

CREATE OR REPLACE FUNCTION noeone_validate_consequence_reception_transition()
RETURNS TRIGGER AS $$
DECLARE
  current_record "ConsequenceReception"%ROWTYPE;
BEGIN
  SELECT * INTO current_record
  FROM "ConsequenceReception"
  WHERE "id" = NEW."receptionId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'consequence reception not found';
  END IF;

  IF current_record."actorId" <> NEW."actorId" THEN
    RAISE EXCEPTION 'transition actor does not match consequence reception actor';
  END IF;

  IF current_record."status" <> 'ACTIVE' OR NEW."fromStatus" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'transition must consume active consequence reception state';
  END IF;

  IF NEW."occurredAt" < current_record."effectiveAt" THEN
    RAISE EXCEPTION 'transition cannot precede corrective-state effectiveness';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsequenceReceptionTransition_validate_insert"
BEFORE INSERT ON "ConsequenceReceptionTransition"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_consequence_reception_transition();

CREATE OR REPLACE FUNCTION noeone_apply_consequence_reception_transition()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "ConsequenceReception"
  SET "status" = NEW."toStatus"
  WHERE "id" = NEW."receptionId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsequenceReceptionTransition_apply"
AFTER INSERT ON "ConsequenceReceptionTransition"
FOR EACH ROW EXECUTE FUNCTION noeone_apply_consequence_reception_transition();

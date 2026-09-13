-- Reliance Provenance / Material-Change Continuity
--
-- A RelianceBasis is immutable evidence of what one counterparty relied upon
-- when dealing with one exact state of a continuing actor. Later actor changes
-- do not rewrite that history; evaluator-specific assessments are appended.

CREATE TABLE "RelianceBasis" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "counterpartyType" TEXT NOT NULL,
    "counterpartyRef" TEXT NOT NULL,
    "relationKind" TEXT NOT NULL,
    "reliedAt" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "lineageId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "executionConfigHash" TEXT NOT NULL,
    "actorOwnerId" TEXT,
    "observedEventSequence" INTEGER NOT NULL,
    "disclosureBundleDigest" TEXT NOT NULL,
    "capabilitySnapshotDigest" TEXT,
    "authoritySnapshotDigest" TEXT,
    "controlSnapshotDigest" TEXT,
    "correctiveStateDigest" TEXT,
    "dependencySnapshotDigest" TEXT,
    "basisEvidenceArtifactId" TEXT NOT NULL,
    "actorStateDigest" TEXT NOT NULL,
    "basisDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "supersedesRelianceId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelianceBasis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RelianceBasis_relation_kind_check" CHECK (
      "relationKind" IN ('AUTHORIZE','TRANSACT','INSURE','HIRE','FOLLOW','HOST','CERTIFY','DELEGATE','OTHER')
    ),
    CONSTRAINT "RelianceBasis_time_check" CHECK (
      "reliedAt" <= "capturedAt" AND
      ("validUntil" IS NULL OR "validUntil" > "reliedAt")
    ),
    CONSTRAINT "RelianceBasis_sequence_check" CHECK ("observedEventSequence" >= 0),
    CONSTRAINT "RelianceBasis_execution_hash_check" CHECK ("executionConfigHash" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceBasis_disclosure_hash_check" CHECK ("disclosureBundleDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceBasis_actor_state_hash_check" CHECK ("actorStateDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceBasis_basis_hash_check" CHECK ("basisDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceBasis_capability_hash_check" CHECK ("capabilitySnapshotDigest" IS NULL OR "capabilitySnapshotDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceBasis_authority_hash_check" CHECK ("authoritySnapshotDigest" IS NULL OR "authoritySnapshotDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceBasis_control_hash_check" CHECK ("controlSnapshotDigest" IS NULL OR "controlSnapshotDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceBasis_corrective_hash_check" CHECK ("correctiveStateDigest" IS NULL OR "correctiveStateDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceBasis_dependency_hash_check" CHECK ("dependencySnapshotDigest" IS NULL OR "dependencySnapshotDigest" ~ '^sha256:[0-9a-f]{64}$')
);

CREATE TABLE "RelianceChangeAssessment" (
    "id" TEXT NOT NULL,
    "relianceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "successorLineageId" TEXT NOT NULL,
    "successorExecutionId" TEXT NOT NULL,
    "successorStateDigest" TEXT NOT NULL,
    "structuralChanges" JSONB NOT NULL,
    "disposition" TEXT NOT NULL,
    "evaluatorType" TEXT NOT NULL,
    "evaluatorRef" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "methodVersion" TEXT NOT NULL,
    "evidenceArtifactId" TEXT NOT NULL,
    "reason" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL,
    "basisDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelianceChangeAssessment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RelianceChangeAssessment_disposition_check" CHECK (
      "disposition" IN ('UNAFFECTED','REVIEW_REQUIRED','INVALIDATED','DISPUTED')
    ),
    CONSTRAINT "RelianceChangeAssessment_successor_hash_check" CHECK ("successorStateDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceChangeAssessment_basis_hash_check" CHECK ("basisDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceChangeAssessment_changes_shape_check" CHECK (jsonb_typeof("structuralChanges") = 'array')
);

CREATE UNIQUE INDEX "RelianceBasis_basisDigest_key" ON "RelianceBasis"("basisDigest");
CREATE UNIQUE INDEX "RelianceBasis_idempotencyKey_key" ON "RelianceBasis"("idempotencyKey");
CREATE UNIQUE INDEX "RelianceBasis_supersedesRelianceId_key" ON "RelianceBasis"("supersedesRelianceId");
CREATE INDEX "RelianceBasis_actorId_reliedAt_idx" ON "RelianceBasis"("actorId", "reliedAt");
CREATE INDEX "RelianceBasis_actorId_counterparty_reliedAt_idx" ON "RelianceBasis"("actorId", "counterpartyType", "counterpartyRef", "reliedAt");
CREATE INDEX "RelianceBasis_executionId_idx" ON "RelianceBasis"("executionId");
CREATE INDEX "RelianceBasis_lineageId_idx" ON "RelianceBasis"("lineageId");
CREATE INDEX "RelianceBasis_basisEvidenceArtifactId_idx" ON "RelianceBasis"("basisEvidenceArtifactId");

CREATE UNIQUE INDEX "RelianceChangeAssessment_basisDigest_key" ON "RelianceChangeAssessment"("basisDigest");
CREATE UNIQUE INDEX "RelianceChangeAssessment_idempotencyKey_key" ON "RelianceChangeAssessment"("idempotencyKey");
CREATE INDEX "RelianceChangeAssessment_relianceId_assessedAt_idx" ON "RelianceChangeAssessment"("relianceId", "assessedAt");
CREATE INDEX "RelianceChangeAssessment_actorId_assessedAt_idx" ON "RelianceChangeAssessment"("actorId", "assessedAt");
CREATE INDEX "RelianceChangeAssessment_successorExecutionId_idx" ON "RelianceChangeAssessment"("successorExecutionId");
CREATE INDEX "RelianceChangeAssessment_successorLineageId_idx" ON "RelianceChangeAssessment"("successorLineageId");
CREATE INDEX "RelianceChangeAssessment_evidenceArtifactId_idx" ON "RelianceChangeAssessment"("evidenceArtifactId");
CREATE INDEX "RelianceChangeAssessment_evaluator_idx" ON "RelianceChangeAssessment"("evaluatorType", "evaluatorRef", "assessedAt");

ALTER TABLE "RelianceBasis"
  ADD CONSTRAINT "RelianceBasis_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceBasis_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "ActorExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceBasis_lineageId_fkey"
  FOREIGN KEY ("lineageId") REFERENCES "LineageNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceBasis_basisEvidenceArtifactId_fkey"
  FOREIGN KEY ("basisEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceBasis_supersedesRelianceId_fkey"
  FOREIGN KEY ("supersedesRelianceId") REFERENCES "RelianceBasis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RelianceChangeAssessment"
  ADD CONSTRAINT "RelianceChangeAssessment_relianceId_fkey"
  FOREIGN KEY ("relianceId") REFERENCES "RelianceBasis"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceChangeAssessment_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceChangeAssessment_successorExecutionId_fkey"
  FOREIGN KEY ("successorExecutionId") REFERENCES "ActorExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceChangeAssessment_successorLineageId_fkey"
  FOREIGN KEY ("successorLineageId") REFERENCES "LineageNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceChangeAssessment_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_reliance_basis()
RETURNS TRIGGER AS $$
DECLARE
  current_actor "Actor"%ROWTYPE;
  current_execution "ActorExecution"%ROWTYPE;
  current_lineage "LineageNode"%ROWTYPE;
  current_sequence INTEGER;
  prior_basis "RelianceBasis"%ROWTYPE;
BEGIN
  SELECT * INTO current_actor
  FROM "Actor"
  WHERE "id" = NEW."actorId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reliance actor not found';
  END IF;

  IF current_actor."canonicalLineageId" <> NEW."lineageId" THEN
    RAISE EXCEPTION 'reliance must bind the current canonical lineage head';
  END IF;

  IF current_actor."ownerId" IS DISTINCT FROM NEW."actorOwnerId" THEN
    RAISE EXCEPTION 'reliance owner snapshot does not match actor owner';
  END IF;

  SELECT * INTO current_execution
  FROM "ActorExecution"
  WHERE "id" = NEW."executionId";

  IF NOT FOUND OR current_execution."actorId" <> NEW."actorId" OR current_execution."endedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'reliance must bind the actor current live execution';
  END IF;

  IF current_execution."configHash" <> NEW."executionConfigHash" THEN
    RAISE EXCEPTION 'reliance execution config hash mismatch';
  END IF;

  SELECT * INTO current_lineage
  FROM "LineageNode"
  WHERE "id" = NEW."lineageId";

  IF NOT FOUND OR current_lineage."actorId" <> NEW."actorId" OR current_lineage."canonical" IS NOT TRUE THEN
    RAISE EXCEPTION 'reliance lineage is not the actor canonical lineage';
  END IF;

  SELECT COALESCE(MAX("sequence"), 0) INTO current_sequence
  FROM "ActorEvent"
  WHERE "actorId" = NEW."actorId";

  IF current_sequence <> NEW."observedEventSequence" THEN
    RAISE EXCEPTION 'reliance observed event sequence is stale';
  END IF;

  IF NEW."supersedesRelianceId" IS NOT NULL THEN
    SELECT * INTO prior_basis
    FROM "RelianceBasis"
    WHERE "id" = NEW."supersedesRelianceId";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'superseded reliance basis not found';
    END IF;

    IF prior_basis."actorId" <> NEW."actorId"
       OR prior_basis."counterpartyType" <> NEW."counterpartyType"
       OR prior_basis."counterpartyRef" <> NEW."counterpartyRef"
       OR prior_basis."relationKind" <> NEW."relationKind" THEN
      RAISE EXCEPTION 'renewal may only supersede reliance by the same counterparty over the same actor relation';
    END IF;

    IF NEW."reliedAt" < prior_basis."reliedAt" THEN
      RAISE EXCEPTION 'renewed reliance cannot predate the reliance it supersedes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RelianceBasis_validate_insert"
BEFORE INSERT ON "RelianceBasis"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_reliance_basis();

CREATE OR REPLACE FUNCTION noeone_validate_reliance_assessment()
RETURNS TRIGGER AS $$
DECLARE
  basis "RelianceBasis"%ROWTYPE;
  actor_record "Actor"%ROWTYPE;
  successor_execution "ActorExecution"%ROWTYPE;
  change_count INTEGER;
BEGIN
  SELECT * INTO basis FROM "RelianceBasis" WHERE "id" = NEW."relianceId";
  IF NOT FOUND THEN RAISE EXCEPTION 'reliance basis not found'; END IF;

  IF basis."actorId" <> NEW."actorId" THEN
    RAISE EXCEPTION 'assessment actor does not match reliance actor';
  END IF;

  IF NEW."assessedAt" < basis."capturedAt" THEN
    RAISE EXCEPTION 'assessment cannot precede reliance capture';
  END IF;

  SELECT * INTO actor_record FROM "Actor" WHERE "id" = NEW."actorId" FOR UPDATE;
  IF actor_record."canonicalLineageId" <> NEW."successorLineageId" THEN
    RAISE EXCEPTION 'assessment must bind the current canonical lineage head';
  END IF;

  SELECT * INTO successor_execution
  FROM "ActorExecution"
  WHERE "id" = NEW."successorExecutionId";
  IF NOT FOUND OR successor_execution."actorId" <> NEW."actorId" OR successor_execution."endedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'assessment must bind the current live execution';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "LineageNode"
    WHERE "id" = NEW."successorLineageId"
      AND "actorId" = NEW."actorId"
      AND "canonical" IS TRUE
  ) THEN
    RAISE EXCEPTION 'assessment successor lineage is not canonical';
  END IF;

  SELECT jsonb_array_length(NEW."structuralChanges") INTO change_count;
  IF NEW."successorStateDigest" = basis."actorStateDigest" AND change_count > 0 THEN
    RAISE EXCEPTION 'unchanged state digest cannot carry structural changes';
  END IF;
  IF NEW."successorStateDigest" <> basis."actorStateDigest" AND change_count = 0 THEN
    RAISE EXCEPTION 'changed state digest requires structural change classification';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RelianceChangeAssessment_validate_insert"
BEFORE INSERT ON "RelianceChangeAssessment"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_reliance_assessment();

CREATE OR REPLACE FUNCTION noeone_guard_reliance_history()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'reliance provenance is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RelianceBasis_guard_update"
BEFORE UPDATE ON "RelianceBasis"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_reliance_history();
CREATE TRIGGER "RelianceBasis_guard_delete"
BEFORE DELETE ON "RelianceBasis"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_reliance_history();
CREATE TRIGGER "RelianceChangeAssessment_guard_update"
BEFORE UPDATE ON "RelianceChangeAssessment"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_reliance_history();
CREATE TRIGGER "RelianceChangeAssessment_guard_delete"
BEFORE DELETE ON "RelianceChangeAssessment"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_reliance_history();
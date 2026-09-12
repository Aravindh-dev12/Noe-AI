-- Capability continuity keeps persistent actor identity separate from the
-- execution-specific evidence/policy judgments used to admit authority.
--
-- A governed model/runtime migration preserves Actor + AuthorityGrant, but
-- manifests and admissibility assessments are bound to an exact execution
-- and therefore never transfer implicitly to a replacement execution.

CREATE TABLE "ExecutionCapabilityManifest" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "framework" TEXT NOT NULL,
  "frameworkVersion" TEXT,
  "issuer" TEXT NOT NULL,
  "externalReference" TEXT,
  "sourceEvidenceArtifactId" TEXT,
  "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "modelRef" TEXT,
  "runtimeRef" TEXT,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "manifestDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExecutionCapabilityManifest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExecutionCapabilityManifest_framework_nonempty" CHECK (length(btrim("framework")) > 0),
  CONSTRAINT "ExecutionCapabilityManifest_issuer_nonempty" CHECK (length(btrim("issuer")) > 0),
  CONSTRAINT "ExecutionCapabilityManifest_digest_shape" CHECK ("manifestDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "ExecutionCapabilityManifest_time_order" CHECK ("expiresAt" IS NULL OR "expiresAt" > "effectiveAt")
);

CREATE UNIQUE INDEX "ExecutionCapabilityManifest_idempotencyKey_key"
  ON "ExecutionCapabilityManifest"("idempotencyKey");
CREATE UNIQUE INDEX "ExecutionCapabilityManifest_execution_issuer_digest_key"
  ON "ExecutionCapabilityManifest"("executionId", "issuer", "manifestDigest");
CREATE INDEX "ExecutionCapabilityManifest_actor_effective_idx"
  ON "ExecutionCapabilityManifest"("actorId", "effectiveAt" DESC);
CREATE INDEX "ExecutionCapabilityManifest_execution_effective_idx"
  ON "ExecutionCapabilityManifest"("executionId", "effectiveAt" DESC);
CREATE INDEX "ExecutionCapabilityManifest_framework_idx"
  ON "ExecutionCapabilityManifest"("framework", "frameworkVersion");
CREATE INDEX "ExecutionCapabilityManifest_evidence_idx"
  ON "ExecutionCapabilityManifest"("sourceEvidenceArtifactId");

ALTER TABLE "ExecutionCapabilityManifest"
  ADD CONSTRAINT "ExecutionCapabilityManifest_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExecutionCapabilityManifest"
  ADD CONSTRAINT "ExecutionCapabilityManifest_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "ActorExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExecutionCapabilityManifest"
  ADD CONSTRAINT "ExecutionCapabilityManifest_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AuthorityAdmissibilityAssessment" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "capabilityManifestId" TEXT,
  "disposition" TEXT NOT NULL,
  "evaluator" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "methodVersion" TEXT NOT NULL,
  "sourceEvidenceArtifactId" TEXT,
  "assessedAt" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3),
  "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuthorityAdmissibilityAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthorityAdmissibilityAssessment_disposition" CHECK (
    "disposition" IN ('ADMISSIBLE', 'REVIEW_REQUIRED', 'SUSPENDED', 'NOT_APPLICABLE', 'DISPUTED')
  ),
  CONSTRAINT "AuthorityAdmissibilityAssessment_evaluator_nonempty" CHECK (length(btrim("evaluator")) > 0),
  CONSTRAINT "AuthorityAdmissibilityAssessment_method_nonempty" CHECK (length(btrim("method")) > 0),
  CONSTRAINT "AuthorityAdmissibilityAssessment_methodVersion_nonempty" CHECK (length(btrim("methodVersion")) > 0),
  CONSTRAINT "AuthorityAdmissibilityAssessment_basis_shape" CHECK ("basisDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "AuthorityAdmissibilityAssessment_time_order" CHECK ("validUntil" IS NULL OR "validUntil" > "assessedAt")
);

CREATE UNIQUE INDEX "AuthorityAdmissibilityAssessment_idempotencyKey_key"
  ON "AuthorityAdmissibilityAssessment"("idempotencyKey");
CREATE UNIQUE INDEX "AuthorityAdmissibilityAssessment_basisDigest_key"
  ON "AuthorityAdmissibilityAssessment"("basisDigest");
CREATE INDEX "AuthorityAdmissibilityAssessment_actor_assessed_idx"
  ON "AuthorityAdmissibilityAssessment"("actorId", "assessedAt" DESC);
CREATE INDEX "AuthorityAdmissibilityAssessment_grant_execution_idx"
  ON "AuthorityAdmissibilityAssessment"("grantId", "executionId", "assessedAt" DESC);
CREATE INDEX "AuthorityAdmissibilityAssessment_execution_idx"
  ON "AuthorityAdmissibilityAssessment"("executionId", "assessedAt" DESC);
CREATE INDEX "AuthorityAdmissibilityAssessment_manifest_idx"
  ON "AuthorityAdmissibilityAssessment"("capabilityManifestId");
CREATE INDEX "AuthorityAdmissibilityAssessment_evaluator_method_idx"
  ON "AuthorityAdmissibilityAssessment"("evaluator", "method", "methodVersion");
CREATE INDEX "AuthorityAdmissibilityAssessment_evidence_idx"
  ON "AuthorityAdmissibilityAssessment"("sourceEvidenceArtifactId");

ALTER TABLE "AuthorityAdmissibilityAssessment"
  ADD CONSTRAINT "AuthorityAdmissibilityAssessment_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthorityAdmissibilityAssessment"
  ADD CONSTRAINT "AuthorityAdmissibilityAssessment_grantId_fkey"
  FOREIGN KEY ("grantId") REFERENCES "AuthorityGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthorityAdmissibilityAssessment"
  ADD CONSTRAINT "AuthorityAdmissibilityAssessment_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "ActorExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthorityAdmissibilityAssessment"
  ADD CONSTRAINT "AuthorityAdmissibilityAssessment_capabilityManifestId_fkey"
  FOREIGN KEY ("capabilityManifestId") REFERENCES "ExecutionCapabilityManifest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthorityAdmissibilityAssessment"
  ADD CONSTRAINT "AuthorityAdmissibilityAssessment_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_capability_manifest_context()
RETURNS trigger AS $$
DECLARE
  execution_actor TEXT;
BEGIN
  SELECT "actorId" INTO execution_actor
  FROM "ActorExecution"
  WHERE "id" = NEW."executionId";

  IF execution_actor IS NULL THEN
    RAISE EXCEPTION 'capability manifest execution does not exist';
  END IF;

  IF execution_actor <> NEW."actorId" THEN
    RAISE EXCEPTION 'capability manifest execution does not belong to actor';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExecutionCapabilityManifest_context_guard"
BEFORE INSERT OR UPDATE OF "actorId", "executionId"
ON "ExecutionCapabilityManifest"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_capability_manifest_context();

CREATE OR REPLACE FUNCTION noeone_validate_authority_admissibility_context()
RETURNS trigger AS $$
DECLARE
  grant_actor TEXT;
  execution_actor TEXT;
  manifest_actor TEXT;
  manifest_execution TEXT;
BEGIN
  SELECT "subjectActorId" INTO grant_actor
  FROM "AuthorityGrant"
  WHERE "id" = NEW."grantId";

  IF grant_actor IS NULL THEN
    RAISE EXCEPTION 'admissibility grant does not exist';
  END IF;

  SELECT "actorId" INTO execution_actor
  FROM "ActorExecution"
  WHERE "id" = NEW."executionId";

  IF execution_actor IS NULL THEN
    RAISE EXCEPTION 'admissibility execution does not exist';
  END IF;

  IF grant_actor <> NEW."actorId" OR execution_actor <> NEW."actorId" THEN
    RAISE EXCEPTION 'admissibility grant/execution do not belong to actor';
  END IF;

  IF NEW."capabilityManifestId" IS NOT NULL THEN
    SELECT "actorId", "executionId" INTO manifest_actor, manifest_execution
    FROM "ExecutionCapabilityManifest"
    WHERE "id" = NEW."capabilityManifestId";

    IF manifest_actor IS NULL THEN
      RAISE EXCEPTION 'admissibility capability manifest does not exist';
    END IF;

    IF manifest_actor <> NEW."actorId" OR manifest_execution <> NEW."executionId" THEN
      RAISE EXCEPTION 'admissibility capability manifest does not match actor/execution';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuthorityAdmissibilityAssessment_context_guard"
BEFORE INSERT OR UPDATE OF "actorId", "grantId", "executionId", "capabilityManifestId"
ON "AuthorityAdmissibilityAssessment"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_authority_admissibility_context();

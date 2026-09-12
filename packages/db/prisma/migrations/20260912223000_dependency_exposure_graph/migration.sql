-- Dependency/exposure history is execution-scoped and temporal.
-- It deliberately references external BOM/telemetry evidence rather than
-- replacing SPDX, CycloneDX, OpenTelemetry, or other source standards.

CREATE TABLE "DependencyComponent" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "provider" TEXT,
  "version" TEXT,
  "purl" TEXT,
  "externalFramework" TEXT,
  "externalReference" TEXT,
  "identityDigest" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DependencyComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DependencyComponent_kind_nonempty" CHECK (length(btrim("kind")) > 0),
  CONSTRAINT "DependencyComponent_name_nonempty" CHECK (length(btrim("canonicalName")) > 0)
);

CREATE TABLE "ExecutionDependencySnapshot" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "framework" TEXT NOT NULL,
  "manifestDigest" TEXT NOT NULL,
  "sourceEvidenceArtifactId" TEXT,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT "ExecutionDependencySnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExecutionDependencySnapshot_framework_nonempty" CHECK (length(btrim("framework")) > 0),
  CONSTRAINT "ExecutionDependencySnapshot_digest_nonempty" CHECK (length(btrim("manifestDigest")) > 0)
);

CREATE TABLE "SnapshotDependency" (
  "snapshotId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "direct" BOOLEAN NOT NULL DEFAULT TRUE,
  "required" BOOLEAN NOT NULL DEFAULT TRUE,
  "evidenceArtifactId" TEXT,
  "disclosureClass" TEXT NOT NULL DEFAULT 'private',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SnapshotDependency_pkey" PRIMARY KEY ("snapshotId", "componentId", "role"),
  CONSTRAINT "SnapshotDependency_role_nonempty" CHECK (length(btrim("role")) > 0),
  CONSTRAINT "SnapshotDependency_disclosure" CHECK ("disclosureClass" IN ('private', 'aggregate', 'public'))
);

CREATE TABLE "DependencyRelation" (
  "id" TEXT NOT NULL,
  "sourceComponentId" TEXT NOT NULL,
  "targetComponentId" TEXT NOT NULL,
  "relationType" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "sourceEvidenceArtifactId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DependencyRelation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DependencyRelation_distinct_components" CHECK ("sourceComponentId" <> "targetComponentId"),
  CONSTRAINT "DependencyRelation_type_nonempty" CHECK (length(btrim("relationType")) > 0),
  CONSTRAINT "DependencyRelation_valid_interval" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE TABLE "DependencyIncident" (
  "id" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OBSERVED',
  "sourceEvidenceArtifactId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "externalFramework" TEXT,
  "externalReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DependencyIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DependencyIncident_kind_nonempty" CHECK (length(btrim("kind")) > 0),
  CONSTRAINT "DependencyIncident_status" CHECK ("status" IN ('OBSERVED', 'RESOLVED', 'DISPUTED', 'RETRACTED')),
  CONSTRAINT "DependencyIncident_valid_interval" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt")
);

CREATE UNIQUE INDEX "DependencyComponent_identityDigest_key"
  ON "DependencyComponent"("identityDigest");
CREATE INDEX "DependencyComponent_kind_provider_idx"
  ON "DependencyComponent"("kind", "provider");
CREATE INDEX "DependencyComponent_purl_idx"
  ON "DependencyComponent"("purl") WHERE "purl" IS NOT NULL;
CREATE INDEX "DependencyComponent_external_idx"
  ON "DependencyComponent"("externalFramework", "externalReference")
  WHERE "externalFramework" IS NOT NULL;

CREATE UNIQUE INDEX "ExecutionDependencySnapshot_idempotencyKey_key"
  ON "ExecutionDependencySnapshot"("idempotencyKey");
CREATE INDEX "ExecutionDependencySnapshot_actor_effective_idx"
  ON "ExecutionDependencySnapshot"("actorId", "effectiveAt" DESC);
CREATE INDEX "ExecutionDependencySnapshot_execution_effective_idx"
  ON "ExecutionDependencySnapshot"("executionId", "effectiveAt" DESC);
CREATE INDEX "ExecutionDependencySnapshot_evidence_idx"
  ON "ExecutionDependencySnapshot"("sourceEvidenceArtifactId")
  WHERE "sourceEvidenceArtifactId" IS NOT NULL;

CREATE INDEX "SnapshotDependency_component_idx"
  ON "SnapshotDependency"("componentId", "snapshotId");
CREATE INDEX "SnapshotDependency_evidence_idx"
  ON "SnapshotDependency"("evidenceArtifactId")
  WHERE "evidenceArtifactId" IS NOT NULL;

CREATE UNIQUE INDEX "DependencyRelation_idempotencyKey_key"
  ON "DependencyRelation"("idempotencyKey");
CREATE INDEX "DependencyRelation_target_time_idx"
  ON "DependencyRelation"("targetComponentId", "effectiveFrom", "effectiveTo");
CREATE INDEX "DependencyRelation_source_time_idx"
  ON "DependencyRelation"("sourceComponentId", "effectiveFrom", "effectiveTo");
CREATE INDEX "DependencyRelation_evidence_idx"
  ON "DependencyRelation"("sourceEvidenceArtifactId")
  WHERE "sourceEvidenceArtifactId" IS NOT NULL;

CREATE UNIQUE INDEX "DependencyIncident_idempotencyKey_key"
  ON "DependencyIncident"("idempotencyKey");
CREATE INDEX "DependencyIncident_component_time_idx"
  ON "DependencyIncident"("componentId", "startedAt" DESC);
CREATE INDEX "DependencyIncident_status_time_idx"
  ON "DependencyIncident"("status", "startedAt" DESC);
CREATE INDEX "DependencyIncident_evidence_idx"
  ON "DependencyIncident"("sourceEvidenceArtifactId");

ALTER TABLE "ExecutionDependencySnapshot"
  ADD CONSTRAINT "ExecutionDependencySnapshot_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExecutionDependencySnapshot"
  ADD CONSTRAINT "ExecutionDependencySnapshot_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "ActorExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExecutionDependencySnapshot"
  ADD CONSTRAINT "ExecutionDependencySnapshot_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SnapshotDependency"
  ADD CONSTRAINT "SnapshotDependency_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "ExecutionDependencySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SnapshotDependency"
  ADD CONSTRAINT "SnapshotDependency_componentId_fkey"
  FOREIGN KEY ("componentId") REFERENCES "DependencyComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SnapshotDependency"
  ADD CONSTRAINT "SnapshotDependency_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DependencyRelation"
  ADD CONSTRAINT "DependencyRelation_sourceComponentId_fkey"
  FOREIGN KEY ("sourceComponentId") REFERENCES "DependencyComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DependencyRelation"
  ADD CONSTRAINT "DependencyRelation_targetComponentId_fkey"
  FOREIGN KEY ("targetComponentId") REFERENCES "DependencyComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DependencyRelation"
  ADD CONSTRAINT "DependencyRelation_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DependencyIncident"
  ADD CONSTRAINT "DependencyIncident_componentId_fkey"
  FOREIGN KEY ("componentId") REFERENCES "DependencyComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DependencyIncident"
  ADD CONSTRAINT "DependencyIncident_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prevent attaching a dependency manifest from one execution to another actor.
CREATE OR REPLACE FUNCTION noeone_validate_dependency_snapshot_execution()
RETURNS trigger AS $$
DECLARE
  actual_actor TEXT;
BEGIN
  SELECT "actorId" INTO actual_actor
  FROM "ActorExecution"
  WHERE "id" = NEW."executionId";

  IF actual_actor IS NULL THEN
    RAISE EXCEPTION 'dependency snapshot execution does not exist';
  END IF;

  IF actual_actor <> NEW."actorId" THEN
    RAISE EXCEPTION 'dependency snapshot execution belongs to a different actor';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExecutionDependencySnapshot_execution_actor_guard"
BEFORE INSERT OR UPDATE OF "actorId", "executionId"
ON "ExecutionDependencySnapshot"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_dependency_snapshot_execution();

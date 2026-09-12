-- Potential dependency exposure is not the same as actual impact.
-- Assessments are append-only, issuer/method-specific records. Multiple
-- evaluators may disagree without one record overwriting another.

CREATE TABLE "DependencyImpactAssessment" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "evaluator" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "methodVersion" TEXT NOT NULL,
  "sourceEvidenceArtifactId" TEXT NOT NULL,
  "exposureAt" TIMESTAMP(3) NOT NULL,
  "confidenceBps" INTEGER,
  "pathBasis" JSONB NOT NULL,
  "pathDigest" TEXT NOT NULL,
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DependencyImpactAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DependencyImpactAssessment_disposition" CHECK (
    "disposition" IN ('AFFECTED', 'NOT_AFFECTED', 'UNDER_INVESTIGATION', 'MITIGATED', 'DISPUTED')
  ),
  CONSTRAINT "DependencyImpactAssessment_evaluator_nonempty" CHECK (length(btrim("evaluator")) > 0),
  CONSTRAINT "DependencyImpactAssessment_method_nonempty" CHECK (length(btrim("method")) > 0),
  CONSTRAINT "DependencyImpactAssessment_methodVersion_nonempty" CHECK (length(btrim("methodVersion")) > 0),
  CONSTRAINT "DependencyImpactAssessment_confidence_bounds" CHECK (
    "confidenceBps" IS NULL OR ("confidenceBps" >= 0 AND "confidenceBps" <= 10000)
  )
);

CREATE UNIQUE INDEX "DependencyImpactAssessment_idempotencyKey_key"
  ON "DependencyImpactAssessment"("idempotencyKey");
CREATE UNIQUE INDEX "DependencyImpactAssessment_basisDigest_key"
  ON "DependencyImpactAssessment"("basisDigest");
CREATE INDEX "DependencyImpactAssessment_incident_created_idx"
  ON "DependencyImpactAssessment"("incidentId", "createdAt" DESC);
CREATE INDEX "DependencyImpactAssessment_actor_exposure_idx"
  ON "DependencyImpactAssessment"("actorId", "exposureAt" DESC);
CREATE INDEX "DependencyImpactAssessment_execution_exposure_idx"
  ON "DependencyImpactAssessment"("executionId", "exposureAt" DESC);
CREATE INDEX "DependencyImpactAssessment_snapshot_idx"
  ON "DependencyImpactAssessment"("snapshotId");
CREATE INDEX "DependencyImpactAssessment_evaluator_method_idx"
  ON "DependencyImpactAssessment"("evaluator", "method", "methodVersion");
CREATE INDEX "DependencyImpactAssessment_evidence_idx"
  ON "DependencyImpactAssessment"("sourceEvidenceArtifactId");

ALTER TABLE "DependencyImpactAssessment"
  ADD CONSTRAINT "DependencyImpactAssessment_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "DependencyIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DependencyImpactAssessment"
  ADD CONSTRAINT "DependencyImpactAssessment_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DependencyImpactAssessment"
  ADD CONSTRAINT "DependencyImpactAssessment_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "ActorExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DependencyImpactAssessment"
  ADD CONSTRAINT "DependencyImpactAssessment_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "ExecutionDependencySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DependencyImpactAssessment"
  ADD CONSTRAINT "DependencyImpactAssessment_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_dependency_impact_assessment()
RETURNS trigger AS $$
DECLARE
  snapshot_actor TEXT;
  snapshot_execution TEXT;
  execution_actor TEXT;
BEGIN
  SELECT "actorId", "executionId"
    INTO snapshot_actor, snapshot_execution
  FROM "ExecutionDependencySnapshot"
  WHERE "id" = NEW."snapshotId";

  IF snapshot_actor IS NULL THEN
    RAISE EXCEPTION 'dependency impact assessment snapshot does not exist';
  END IF;

  IF snapshot_actor <> NEW."actorId" OR snapshot_execution <> NEW."executionId" THEN
    RAISE EXCEPTION 'dependency impact assessment snapshot does not match actor/execution';
  END IF;

  SELECT "actorId" INTO execution_actor
  FROM "ActorExecution"
  WHERE "id" = NEW."executionId";

  IF execution_actor IS NULL OR execution_actor <> NEW."actorId" THEN
    RAISE EXCEPTION 'dependency impact assessment execution does not belong to actor';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DependencyImpactAssessment_context_guard"
BEFORE INSERT OR UPDATE OF "actorId", "executionId", "snapshotId"
ON "DependencyImpactAssessment"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_dependency_impact_assessment();

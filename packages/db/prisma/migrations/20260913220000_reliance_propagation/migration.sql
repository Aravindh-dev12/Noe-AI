-- Reliance Propagation / Systemic Reliance Exposure
--
-- Records immutable historical dependencies between counterparty-specific
-- reliance decisions over the same persistent actor. The graph represents
-- decision dependency, not transitive trust. Downstream validity is never
-- cascaded automatically; evaluator-specific propagation assessments are
-- appended separately.

CREATE TABLE "RelianceDependency" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "downstreamRelianceId" TEXT NOT NULL,
    "upstreamRelianceId" TEXT NOT NULL,
    "dependencyKind" TEXT NOT NULL,
    "upstreamBasisDigest" TEXT NOT NULL,
    "downstreamBasisDigest" TEXT NOT NULL,
    "evidenceArtifactId" TEXT NOT NULL,
    "createdByType" TEXT NOT NULL,
    "createdByRef" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dependencyDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelianceDependency_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RelianceDependency_distinct_check" CHECK ("upstreamRelianceId" <> "downstreamRelianceId"),
    CONSTRAINT "RelianceDependency_kind_check" CHECK (
      "dependencyKind" IN ('REQUIRED','MATERIAL','INFORMATIVE','FALLBACK')
    ),
    CONSTRAINT "RelianceDependency_upstream_hash_check" CHECK ("upstreamBasisDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceDependency_downstream_hash_check" CHECK ("downstreamBasisDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceDependency_digest_check" CHECK ("dependencyDigest" ~ '^sha256:[0-9a-f]{64}$')
);

CREATE TABLE "ReliancePropagationAssessment" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "dependencyId" TEXT NOT NULL,
    "downstreamRelianceId" TEXT NOT NULL,
    "triggerRelianceId" TEXT NOT NULL,
    "triggerAssessmentId" TEXT,
    "triggerDigest" TEXT NOT NULL,
    "observedDependencyDigest" TEXT NOT NULL,
    "observedDownstreamBasisDigest" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "evaluatorType" TEXT NOT NULL,
    "evaluatorRef" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "methodVersion" TEXT NOT NULL,
    "evidenceArtifactId" TEXT NOT NULL,
    "reason" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL,
    "assessmentDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReliancePropagationAssessment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReliancePropagationAssessment_disposition_check" CHECK (
      "disposition" IN ('UNAFFECTED','REVIEW_REQUIRED','BLOCKED','DISPUTED','UNKNOWN')
    ),
    CONSTRAINT "ReliancePropagationAssessment_trigger_hash_check" CHECK ("triggerDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "ReliancePropagationAssessment_dependency_hash_check" CHECK ("observedDependencyDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "ReliancePropagationAssessment_downstream_hash_check" CHECK ("observedDownstreamBasisDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "ReliancePropagationAssessment_assessment_hash_check" CHECK ("assessmentDigest" ~ '^sha256:[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "RelianceDependency_dependencyDigest_key" ON "RelianceDependency"("dependencyDigest");
CREATE UNIQUE INDEX "RelianceDependency_idempotencyKey_key" ON "RelianceDependency"("idempotencyKey");
CREATE UNIQUE INDEX "RelianceDependency_pair_kind_key" ON "RelianceDependency"("downstreamRelianceId", "upstreamRelianceId", "dependencyKind");
CREATE INDEX "RelianceDependency_actor_recorded_idx" ON "RelianceDependency"("actorId", "recordedAt");
CREATE INDEX "RelianceDependency_upstream_recorded_idx" ON "RelianceDependency"("upstreamRelianceId", "recordedAt");
CREATE INDEX "RelianceDependency_downstream_recorded_idx" ON "RelianceDependency"("downstreamRelianceId", "recordedAt");
CREATE INDEX "RelianceDependency_evidence_idx" ON "RelianceDependency"("evidenceArtifactId");
CREATE INDEX "RelianceDependency_creator_idx" ON "RelianceDependency"("createdByType", "createdByRef", "recordedAt");

CREATE UNIQUE INDEX "ReliancePropagationAssessment_assessmentDigest_key" ON "ReliancePropagationAssessment"("assessmentDigest");
CREATE UNIQUE INDEX "ReliancePropagationAssessment_idempotencyKey_key" ON "ReliancePropagationAssessment"("idempotencyKey");
CREATE INDEX "ReliancePropagationAssessment_actor_assessed_idx" ON "ReliancePropagationAssessment"("actorId", "assessedAt");
CREATE INDEX "ReliancePropagationAssessment_dependency_assessed_idx" ON "ReliancePropagationAssessment"("dependencyId", "assessedAt");
CREATE INDEX "ReliancePropagationAssessment_downstream_assessed_idx" ON "ReliancePropagationAssessment"("downstreamRelianceId", "assessedAt");
CREATE INDEX "ReliancePropagationAssessment_trigger_assessed_idx" ON "ReliancePropagationAssessment"("triggerRelianceId", "assessedAt");
CREATE INDEX "ReliancePropagationAssessment_trigger_assessment_idx" ON "ReliancePropagationAssessment"("triggerAssessmentId");
CREATE INDEX "ReliancePropagationAssessment_evidence_idx" ON "ReliancePropagationAssessment"("evidenceArtifactId");
CREATE INDEX "ReliancePropagationAssessment_evaluator_idx" ON "ReliancePropagationAssessment"("evaluatorType", "evaluatorRef", "assessedAt");

ALTER TABLE "RelianceDependency"
  ADD CONSTRAINT "RelianceDependency_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceDependency_downstreamRelianceId_fkey"
  FOREIGN KEY ("downstreamRelianceId") REFERENCES "RelianceBasis"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceDependency_upstreamRelianceId_fkey"
  FOREIGN KEY ("upstreamRelianceId") REFERENCES "RelianceBasis"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceDependency_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReliancePropagationAssessment"
  ADD CONSTRAINT "ReliancePropagationAssessment_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReliancePropagationAssessment_dependencyId_fkey"
  FOREIGN KEY ("dependencyId") REFERENCES "RelianceDependency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReliancePropagationAssessment_downstreamRelianceId_fkey"
  FOREIGN KEY ("downstreamRelianceId") REFERENCES "RelianceBasis"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReliancePropagationAssessment_triggerRelianceId_fkey"
  FOREIGN KEY ("triggerRelianceId") REFERENCES "RelianceBasis"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReliancePropagationAssessment_triggerAssessmentId_fkey"
  FOREIGN KEY ("triggerAssessmentId") REFERENCES "RelianceChangeAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ReliancePropagationAssessment_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_reliance_dependency()
RETURNS TRIGGER AS $$
DECLARE
  upstream_basis "RelianceBasis"%ROWTYPE;
  downstream_basis "RelianceBasis"%ROWTYPE;
  cycle_found BOOLEAN;
BEGIN
  SELECT * INTO upstream_basis
  FROM "RelianceBasis"
  WHERE "id" = NEW."upstreamRelianceId";
  IF NOT FOUND THEN RAISE EXCEPTION 'upstream reliance basis not found'; END IF;

  SELECT * INTO downstream_basis
  FROM "RelianceBasis"
  WHERE "id" = NEW."downstreamRelianceId";
  IF NOT FOUND THEN RAISE EXCEPTION 'downstream reliance basis not found'; END IF;

  IF upstream_basis."actorId" <> NEW."actorId"
     OR downstream_basis."actorId" <> NEW."actorId" THEN
    RAISE EXCEPTION 'reliance dependency bases must belong to the declared actor';
  END IF;

  IF upstream_basis."actorId" <> downstream_basis."actorId" THEN
    RAISE EXCEPTION 'reliance dependency v1 only supports bases over the same actor';
  END IF;

  IF upstream_basis."reliedAt" > downstream_basis."reliedAt" THEN
    RAISE EXCEPTION 'upstream reliance cannot postdate downstream reliance';
  END IF;

  IF upstream_basis."basisDigest" <> NEW."upstreamBasisDigest" THEN
    RAISE EXCEPTION 'upstream reliance basis digest mismatch';
  END IF;

  IF downstream_basis."basisDigest" <> NEW."downstreamBasisDigest" THEN
    RAISE EXCEPTION 'downstream reliance basis digest mismatch';
  END IF;

  WITH RECURSIVE reachable("relianceId") AS (
    SELECT d."downstreamRelianceId"
    FROM "RelianceDependency" d
    WHERE d."upstreamRelianceId" = NEW."downstreamRelianceId"

    UNION

    SELECT d."downstreamRelianceId"
    FROM "RelianceDependency" d
    INNER JOIN reachable r ON d."upstreamRelianceId" = r."relianceId"
  )
  SELECT EXISTS (
    SELECT 1 FROM reachable WHERE "relianceId" = NEW."upstreamRelianceId"
  ) INTO cycle_found;

  IF cycle_found THEN
    RAISE EXCEPTION 'reliance dependency would create a cycle';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RelianceDependency_validate_insert"
BEFORE INSERT ON "RelianceDependency"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_reliance_dependency();

CREATE OR REPLACE FUNCTION noeone_validate_reliance_propagation_assessment()
RETURNS TRIGGER AS $$
DECLARE
  dep "RelianceDependency"%ROWTYPE;
  trigger_basis "RelianceBasis"%ROWTYPE;
  downstream_basis "RelianceBasis"%ROWTYPE;
  trigger_assessment "RelianceChangeAssessment"%ROWTYPE;
BEGIN
  SELECT * INTO dep
  FROM "RelianceDependency"
  WHERE "id" = NEW."dependencyId";
  IF NOT FOUND THEN RAISE EXCEPTION 'reliance dependency not found'; END IF;

  IF dep."actorId" <> NEW."actorId" THEN
    RAISE EXCEPTION 'propagation assessment actor does not match dependency actor';
  END IF;

  IF dep."downstreamRelianceId" <> NEW."downstreamRelianceId" THEN
    RAISE EXCEPTION 'propagation assessment downstream reliance does not match dependency';
  END IF;

  IF dep."upstreamRelianceId" <> NEW."triggerRelianceId" THEN
    RAISE EXCEPTION 'propagation trigger must be the dependency upstream reliance';
  END IF;

  IF dep."dependencyDigest" <> NEW."observedDependencyDigest" THEN
    RAISE EXCEPTION 'propagation assessment dependency digest mismatch';
  END IF;

  SELECT * INTO trigger_basis
  FROM "RelianceBasis"
  WHERE "id" = NEW."triggerRelianceId";
  IF NOT FOUND OR trigger_basis."actorId" <> NEW."actorId" THEN
    RAISE EXCEPTION 'propagation trigger reliance is invalid';
  END IF;

  SELECT * INTO downstream_basis
  FROM "RelianceBasis"
  WHERE "id" = NEW."downstreamRelianceId";
  IF NOT FOUND OR downstream_basis."actorId" <> NEW."actorId" THEN
    RAISE EXCEPTION 'propagation downstream reliance is invalid';
  END IF;

  IF downstream_basis."basisDigest" <> NEW."observedDownstreamBasisDigest" THEN
    RAISE EXCEPTION 'propagation assessment downstream basis digest mismatch';
  END IF;

  IF NEW."triggerAssessmentId" IS NULL THEN
    IF trigger_basis."basisDigest" <> NEW."triggerDigest" THEN
      RAISE EXCEPTION 'propagation trigger digest must match the upstream reliance basis';
    END IF;
  ELSE
    SELECT * INTO trigger_assessment
    FROM "RelianceChangeAssessment"
    WHERE "id" = NEW."triggerAssessmentId";

    IF NOT FOUND
       OR trigger_assessment."relianceId" <> NEW."triggerRelianceId"
       OR trigger_assessment."actorId" <> NEW."actorId" THEN
      RAISE EXCEPTION 'propagation trigger assessment does not match upstream reliance';
    END IF;

    IF trigger_assessment."basisDigest" <> NEW."triggerDigest" THEN
      RAISE EXCEPTION 'propagation trigger digest does not match assessment digest';
    END IF;

    IF trigger_assessment."assessedAt" > NEW."assessedAt" THEN
      RAISE EXCEPTION 'propagation assessment cannot predate its trigger assessment';
    END IF;
  END IF;

  IF NEW."assessedAt" < downstream_basis."capturedAt" THEN
    RAISE EXCEPTION 'propagation assessment cannot predate downstream reliance capture';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReliancePropagationAssessment_validate_insert"
BEFORE INSERT ON "ReliancePropagationAssessment"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_reliance_propagation_assessment();

CREATE OR REPLACE FUNCTION noeone_forbid_reliance_propagation_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RelianceDependency_no_update"
BEFORE UPDATE ON "RelianceDependency"
FOR EACH ROW EXECUTE FUNCTION noeone_forbid_reliance_propagation_mutation();

CREATE TRIGGER "RelianceDependency_no_delete"
BEFORE DELETE ON "RelianceDependency"
FOR EACH ROW EXECUTE FUNCTION noeone_forbid_reliance_propagation_mutation();

CREATE TRIGGER "ReliancePropagationAssessment_no_update"
BEFORE UPDATE ON "ReliancePropagationAssessment"
FOR EACH ROW EXECUTE FUNCTION noeone_forbid_reliance_propagation_mutation();

CREATE TRIGGER "ReliancePropagationAssessment_no_delete"
BEFORE DELETE ON "ReliancePropagationAssessment"
FOR EACH ROW EXECUTE FUNCTION noeone_forbid_reliance_propagation_mutation();

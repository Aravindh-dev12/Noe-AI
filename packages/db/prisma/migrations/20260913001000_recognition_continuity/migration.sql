-- Contextual recognition is downstream from canonical continuity.
--
-- A stable actor ID and accepted continuity transition do not imply that every
-- relying party must treat the transition the same way. This table preserves
-- evaluator/context-specific recognition without turning it into a global
-- trust score or allowing recognition votes to rewrite canonical lineage.

CREATE TABLE "ContinuityRecognitionAssessment" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "continuityTransitionId" TEXT,
  "ancestryId" TEXT,
  "relation" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "recognizerType" TEXT NOT NULL,
  "recognizerRef" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "policyFramework" TEXT,
  "policyVersion" TEXT NOT NULL,
  "sourceEvidenceArtifactId" TEXT,
  "assessedAt" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3),
  "conditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "targetDigest" TEXT NOT NULL,
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContinuityRecognitionAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContinuityRecognitionAssessment_exactly_one_target" CHECK (
    (("continuityTransitionId" IS NOT NULL)::int + ("ancestryId" IS NOT NULL)::int) = 1
  ),
  CONSTRAINT "ContinuityRecognitionAssessment_relation" CHECK (
    "relation" IN ('SAME_ACTOR', 'SUCCESSOR', 'DESCENDANT', 'UNRELATED')
  ),
  CONSTRAINT "ContinuityRecognitionAssessment_disposition" CHECK (
    "disposition" IN ('RECOGNIZED', 'CONDITIONAL', 'REJECTED', 'DISPUTED')
  ),
  CONSTRAINT "ContinuityRecognitionAssessment_recognizerType_nonempty" CHECK (length(btrim("recognizerType")) > 0),
  CONSTRAINT "ContinuityRecognitionAssessment_recognizerRef_nonempty" CHECK (length(btrim("recognizerRef")) > 0),
  CONSTRAINT "ContinuityRecognitionAssessment_context_nonempty" CHECK (length(btrim("context")) > 0),
  CONSTRAINT "ContinuityRecognitionAssessment_policyVersion_nonempty" CHECK (length(btrim("policyVersion")) > 0),
  CONSTRAINT "ContinuityRecognitionAssessment_target_digest_shape" CHECK ("targetDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "ContinuityRecognitionAssessment_basis_digest_shape" CHECK ("basisDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "ContinuityRecognitionAssessment_time_order" CHECK ("validUntil" IS NULL OR "validUntil" > "assessedAt")
);

CREATE UNIQUE INDEX "ContinuityRecognitionAssessment_idempotencyKey_key"
  ON "ContinuityRecognitionAssessment"("idempotencyKey");
CREATE UNIQUE INDEX "ContinuityRecognitionAssessment_basisDigest_key"
  ON "ContinuityRecognitionAssessment"("basisDigest");
CREATE INDEX "ContinuityRecognitionAssessment_actor_context_idx"
  ON "ContinuityRecognitionAssessment"("actorId", "context", "assessedAt" DESC);
CREATE INDEX "ContinuityRecognitionAssessment_recognizer_idx"
  ON "ContinuityRecognitionAssessment"("recognizerType", "recognizerRef", "assessedAt" DESC);
CREATE INDEX "ContinuityRecognitionAssessment_transition_idx"
  ON "ContinuityRecognitionAssessment"("continuityTransitionId", "assessedAt" DESC);
CREATE INDEX "ContinuityRecognitionAssessment_ancestry_idx"
  ON "ContinuityRecognitionAssessment"("ancestryId", "assessedAt" DESC);
CREATE INDEX "ContinuityRecognitionAssessment_evidence_idx"
  ON "ContinuityRecognitionAssessment"("sourceEvidenceArtifactId");

ALTER TABLE "ContinuityRecognitionAssessment"
  ADD CONSTRAINT "ContinuityRecognitionAssessment_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContinuityRecognitionAssessment"
  ADD CONSTRAINT "ContinuityRecognitionAssessment_transition_fkey"
  FOREIGN KEY ("continuityTransitionId") REFERENCES "ContinuityTransition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContinuityRecognitionAssessment"
  ADD CONSTRAINT "ContinuityRecognitionAssessment_ancestry_fkey"
  FOREIGN KEY ("ancestryId") REFERENCES "ActorAncestry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContinuityRecognitionAssessment"
  ADD CONSTRAINT "ContinuityRecognitionAssessment_evidence_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_recognition_context()
RETURNS trigger AS $$
DECLARE
  transition_actor TEXT;
  transition_status "ContinuityTransitionStatus";
  ancestry_child TEXT;
BEGIN
  IF NEW."continuityTransitionId" IS NOT NULL THEN
    SELECT "actorId", "status" INTO transition_actor, transition_status
    FROM "ContinuityTransition"
    WHERE "id" = NEW."continuityTransitionId";

    IF transition_actor IS NULL THEN
      RAISE EXCEPTION 'recognition continuity transition does not exist';
    END IF;

    IF transition_actor <> NEW."actorId" THEN
      RAISE EXCEPTION 'recognition transition does not belong to actor';
    END IF;

    IF transition_status <> 'ACCEPTED' THEN
      RAISE EXCEPTION 'recognition transition must be accepted before assessment';
    END IF;
  ELSE
    SELECT "childActorId" INTO ancestry_child
    FROM "ActorAncestry"
    WHERE "id" = NEW."ancestryId";

    IF ancestry_child IS NULL THEN
      RAISE EXCEPTION 'recognition ancestry does not exist';
    END IF;

    IF ancestry_child <> NEW."actorId" THEN
      RAISE EXCEPTION 'recognition ancestry child does not match actor';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContinuityRecognitionAssessment_context_guard"
BEFORE INSERT OR UPDATE OF "actorId", "continuityTransitionId", "ancestryId"
ON "ContinuityRecognitionAssessment"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_recognition_context();

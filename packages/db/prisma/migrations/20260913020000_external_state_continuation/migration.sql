-- Externally anchored state is not transferable merely because actor-local
-- state was copied or a canonical continuity transition was accepted.
--
-- This table records the decision of the external principal that controls one
-- side of a relationship/status (counterparty, host, institution, user, etc.)
-- about whether that specific state continues across a migration or ancestry
-- edge. It is deliberately downstream from canonical continuity and does not
-- rewrite actor lineage.

CREATE TABLE "ExternalStateContinuationDecision" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "sourceActorId" TEXT NOT NULL,
  "continuityTransitionId" TEXT,
  "ancestryId" TEXT,
  "stateClass" TEXT NOT NULL,
  "sourceStateType" TEXT NOT NULL,
  "sourceStateRef" TEXT NOT NULL,
  "sourceStateDigest" TEXT NOT NULL,
  "externalPrincipalType" TEXT NOT NULL,
  "externalPrincipalRef" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "successorStateRef" TEXT,
  "policyFramework" TEXT,
  "policyVersion" TEXT NOT NULL,
  "sourceEvidenceArtifactId" TEXT,
  "decidedAt" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3),
  "conditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "targetDigest" TEXT NOT NULL,
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExternalStateContinuationDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalStateContinuationDecision_exactly_one_target" CHECK (
    (("continuityTransitionId" IS NOT NULL)::int + ("ancestryId" IS NOT NULL)::int) = 1
  ),
  CONSTRAINT "ExternalStateContinuationDecision_stateClass" CHECK (
    "stateClass" IN ('RELATIONSHIP', 'INSTITUTIONAL_STATUS', 'DEONTIC', 'AUDIENCE')
  ),
  CONSTRAINT "ExternalStateContinuationDecision_disposition" CHECK (
    "disposition" IN ('CONTINUED', 'CONDITIONAL', 'REISSUED', 'REJECTED', 'TERMINATED', 'DISPUTED')
  ),
  CONSTRAINT "ExternalStateContinuationDecision_reissued_ref" CHECK (
    "disposition" <> 'REISSUED' OR "successorStateRef" IS NOT NULL
  ),
  CONSTRAINT "ExternalStateContinuationDecision_stateType_nonempty" CHECK (length(btrim("sourceStateType")) > 0),
  CONSTRAINT "ExternalStateContinuationDecision_stateRef_nonempty" CHECK (length(btrim("sourceStateRef")) > 0),
  CONSTRAINT "ExternalStateContinuationDecision_principalType_nonempty" CHECK (length(btrim("externalPrincipalType")) > 0),
  CONSTRAINT "ExternalStateContinuationDecision_principalRef_nonempty" CHECK (length(btrim("externalPrincipalRef")) > 0),
  CONSTRAINT "ExternalStateContinuationDecision_context_nonempty" CHECK (length(btrim("context")) > 0),
  CONSTRAINT "ExternalStateContinuationDecision_policyVersion_nonempty" CHECK (length(btrim("policyVersion")) > 0),
  CONSTRAINT "ExternalStateContinuationDecision_source_digest_shape" CHECK ("sourceStateDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "ExternalStateContinuationDecision_target_digest_shape" CHECK ("targetDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "ExternalStateContinuationDecision_basis_digest_shape" CHECK ("basisDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "ExternalStateContinuationDecision_time_order" CHECK ("validUntil" IS NULL OR "validUntil" > "decidedAt")
);

CREATE UNIQUE INDEX "ExternalStateContinuationDecision_idempotencyKey_key"
  ON "ExternalStateContinuationDecision"("idempotencyKey");
CREATE UNIQUE INDEX "ExternalStateContinuationDecision_basisDigest_key"
  ON "ExternalStateContinuationDecision"("basisDigest");
CREATE INDEX "ExternalStateContinuationDecision_actor_context_idx"
  ON "ExternalStateContinuationDecision"("actorId", "context", "decidedAt" DESC);
CREATE INDEX "ExternalStateContinuationDecision_source_actor_idx"
  ON "ExternalStateContinuationDecision"("sourceActorId", "decidedAt" DESC);
CREATE INDEX "ExternalStateContinuationDecision_principal_idx"
  ON "ExternalStateContinuationDecision"("externalPrincipalType", "externalPrincipalRef", "decidedAt" DESC);
CREATE INDEX "ExternalStateContinuationDecision_source_state_idx"
  ON "ExternalStateContinuationDecision"("sourceStateType", "sourceStateRef", "decidedAt" DESC);
CREATE INDEX "ExternalStateContinuationDecision_transition_idx"
  ON "ExternalStateContinuationDecision"("continuityTransitionId", "decidedAt" DESC);
CREATE INDEX "ExternalStateContinuationDecision_ancestry_idx"
  ON "ExternalStateContinuationDecision"("ancestryId", "decidedAt" DESC);
CREATE INDEX "ExternalStateContinuationDecision_evidence_idx"
  ON "ExternalStateContinuationDecision"("sourceEvidenceArtifactId");

ALTER TABLE "ExternalStateContinuationDecision"
  ADD CONSTRAINT "ExternalStateContinuationDecision_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExternalStateContinuationDecision"
  ADD CONSTRAINT "ExternalStateContinuationDecision_sourceActorId_fkey"
  FOREIGN KEY ("sourceActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExternalStateContinuationDecision"
  ADD CONSTRAINT "ExternalStateContinuationDecision_transition_fkey"
  FOREIGN KEY ("continuityTransitionId") REFERENCES "ContinuityTransition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExternalStateContinuationDecision"
  ADD CONSTRAINT "ExternalStateContinuationDecision_ancestry_fkey"
  FOREIGN KEY ("ancestryId") REFERENCES "ActorAncestry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExternalStateContinuationDecision"
  ADD CONSTRAINT "ExternalStateContinuationDecision_evidence_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_external_state_continuation_context()
RETURNS trigger AS $$
DECLARE
  transition_actor TEXT;
  transition_status "ContinuityTransitionStatus";
  ancestry_child TEXT;
  ancestry_parent TEXT;
BEGIN
  IF NEW."continuityTransitionId" IS NOT NULL THEN
    SELECT "actorId", "status" INTO transition_actor, transition_status
    FROM "ContinuityTransition"
    WHERE "id" = NEW."continuityTransitionId";

    IF transition_actor IS NULL THEN
      RAISE EXCEPTION 'external-state continuity transition does not exist';
    END IF;

    IF transition_actor <> NEW."actorId" OR transition_actor <> NEW."sourceActorId" THEN
      RAISE EXCEPTION 'migration external-state actor/source actor mismatch';
    END IF;

    IF transition_status <> 'ACCEPTED' THEN
      RAISE EXCEPTION 'external-state transition must be accepted before reconciliation';
    END IF;
  ELSE
    SELECT "childActorId", "parentActorId" INTO ancestry_child, ancestry_parent
    FROM "ActorAncestry"
    WHERE "id" = NEW."ancestryId";

    IF ancestry_child IS NULL THEN
      RAISE EXCEPTION 'external-state ancestry does not exist';
    END IF;

    IF ancestry_child <> NEW."actorId" OR ancestry_parent <> NEW."sourceActorId" THEN
      RAISE EXCEPTION 'fork external-state actor/source actor mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExternalStateContinuationDecision_context_guard"
BEFORE INSERT OR UPDATE OF "actorId", "sourceActorId", "continuityTransitionId", "ancestryId"
ON "ExternalStateContinuationDecision"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_external_state_continuation_context();

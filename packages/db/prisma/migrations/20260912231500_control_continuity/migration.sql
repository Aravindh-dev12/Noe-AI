-- Control continuity is distinct from delegated authority.
-- These tables record which controller/key state was recognized for a persistent
-- actor over time and how governed rotation/recovery/transfer decisions occurred.

CREATE TABLE "ActorControlPolicy" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "threshold" INTEGER NOT NULL,
  "challengeWindowSeconds" INTEGER NOT NULL DEFAULT 86400,
  "objectionMode" TEXT NOT NULL DEFAULT 'VETO',
  "sourceEvidenceArtifactId" TEXT,
  "externalFramework" TEXT,
  "externalReference" TEXT,
  "policyDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "retiredAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActorControlPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActorControlPolicy_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "ActorControlPolicy_threshold_positive" CHECK ("threshold" >= 1),
  CONSTRAINT "ActorControlPolicy_challenge_window_bounds" CHECK (
    "challengeWindowSeconds" >= 0 AND "challengeWindowSeconds" <= 2592000
  ),
  CONSTRAINT "ActorControlPolicy_objection_mode" CHECK ("objectionMode" IN ('VETO')),
  CONSTRAINT "ActorControlPolicy_retired_after_effective" CHECK (
    "retiredAt" IS NULL OR "retiredAt" >= "effectiveAt"
  )
);

CREATE TABLE "ActorControlGuardian" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "principalType" TEXT NOT NULL,
  "principalRef" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'guardian',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActorControlGuardian_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActorControlGuardian_principal_type_nonempty" CHECK (length(btrim("principalType")) > 0),
  CONSTRAINT "ActorControlGuardian_principal_ref_nonempty" CHECK (length(btrim("principalRef")) > 0)
);

CREATE TABLE "ActorControlEpoch" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "epoch" INTEGER NOT NULL,
  "controllerType" TEXT NOT NULL,
  "controllerRef" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "keyStateDigest" TEXT,
  "sourceEvidenceArtifactId" TEXT,
  "externalFramework" TEXT,
  "externalReference" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActorControlEpoch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActorControlEpoch_epoch_positive" CHECK ("epoch" >= 1),
  CONSTRAINT "ActorControlEpoch_state" CHECK ("state" IN ('ACTIVE', 'QUARANTINED')),
  CONSTRAINT "ActorControlEpoch_controller_type_nonempty" CHECK (length(btrim("controllerType")) > 0),
  CONSTRAINT "ActorControlEpoch_controller_ref_nonempty" CHECK (length(btrim("controllerRef")) > 0),
  CONSTRAINT "ActorControlEpoch_end_after_start" CHECK (
    "endedAt" IS NULL OR "endedAt" >= "startedAt"
  )
);

CREATE TABLE "ActorControlTransition" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromEpochId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "proposedControllerType" TEXT,
  "proposedControllerRef" TEXT,
  "proposedKeyStateDigest" TEXT,
  "sourceEvidenceArtifactId" TEXT NOT NULL,
  "policyDigest" TEXT NOT NULL,
  "proposedAt" TIMESTAMP(3) NOT NULL,
  "challengeUntil" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3),
  "decisionReason" TEXT,
  "resultingEpochId" TEXT,
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActorControlTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActorControlTransition_kind" CHECK (
    "kind" IN ('ROTATION', 'TRANSFER', 'RECOVERY', 'QUARANTINE', 'RESTORE')
  ),
  CONSTRAINT "ActorControlTransition_status" CHECK (
    "status" IN ('PROPOSED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED')
  ),
  CONSTRAINT "ActorControlTransition_challenge_after_proposed" CHECK (
    "challengeUntil" >= "proposedAt"
  ),
  CONSTRAINT "ActorControlTransition_decided_after_proposed" CHECK (
    "decidedAt" IS NULL OR "decidedAt" >= "proposedAt"
  )
);

CREATE TABLE "ActorControlApproval" (
  "id" TEXT NOT NULL,
  "transitionId" TEXT NOT NULL,
  "principalType" TEXT NOT NULL,
  "principalRef" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "sourceEvidenceArtifactId" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActorControlApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActorControlApproval_disposition" CHECK ("disposition" IN ('APPROVE', 'OBJECT')),
  CONSTRAINT "ActorControlApproval_principal_type_nonempty" CHECK (length(btrim("principalType")) > 0),
  CONSTRAINT "ActorControlApproval_principal_ref_nonempty" CHECK (length(btrim("principalRef")) > 0)
);

CREATE UNIQUE INDEX "ActorControlPolicy_actor_version_key"
  ON "ActorControlPolicy"("actorId", "version");
CREATE UNIQUE INDEX "ActorControlPolicy_policyDigest_key"
  ON "ActorControlPolicy"("policyDigest");
CREATE UNIQUE INDEX "ActorControlPolicy_idempotencyKey_key"
  ON "ActorControlPolicy"("idempotencyKey");
CREATE UNIQUE INDEX "ActorControlPolicy_one_active_per_actor"
  ON "ActorControlPolicy"("actorId") WHERE "retiredAt" IS NULL;
CREATE INDEX "ActorControlPolicy_actor_effective_idx"
  ON "ActorControlPolicy"("actorId", "effectiveAt" DESC);

CREATE UNIQUE INDEX "ActorControlGuardian_policy_principal_key"
  ON "ActorControlGuardian"("policyId", "principalType", "principalRef");
CREATE INDEX "ActorControlGuardian_policy_idx"
  ON "ActorControlGuardian"("policyId");

CREATE UNIQUE INDEX "ActorControlEpoch_actor_epoch_key"
  ON "ActorControlEpoch"("actorId", "epoch");
CREATE UNIQUE INDEX "ActorControlEpoch_basisDigest_key"
  ON "ActorControlEpoch"("basisDigest");
CREATE UNIQUE INDEX "ActorControlEpoch_idempotencyKey_key"
  ON "ActorControlEpoch"("idempotencyKey");
CREATE UNIQUE INDEX "ActorControlEpoch_one_current_per_actor"
  ON "ActorControlEpoch"("actorId") WHERE "endedAt" IS NULL;
CREATE INDEX "ActorControlEpoch_actor_started_idx"
  ON "ActorControlEpoch"("actorId", "startedAt" DESC);
CREATE INDEX "ActorControlEpoch_policy_idx"
  ON "ActorControlEpoch"("policyId");

CREATE UNIQUE INDEX "ActorControlTransition_basisDigest_key"
  ON "ActorControlTransition"("basisDigest");
CREATE UNIQUE INDEX "ActorControlTransition_idempotencyKey_key"
  ON "ActorControlTransition"("idempotencyKey");
CREATE UNIQUE INDEX "ActorControlTransition_resultingEpochId_key"
  ON "ActorControlTransition"("resultingEpochId") WHERE "resultingEpochId" IS NOT NULL;
CREATE UNIQUE INDEX "ActorControlTransition_one_pending_per_actor"
  ON "ActorControlTransition"("actorId") WHERE "status" = 'PROPOSED';
CREATE INDEX "ActorControlTransition_actor_proposed_idx"
  ON "ActorControlTransition"("actorId", "proposedAt" DESC);
CREATE INDEX "ActorControlTransition_policy_idx"
  ON "ActorControlTransition"("policyId");

CREATE UNIQUE INDEX "ActorControlApproval_transition_principal_key"
  ON "ActorControlApproval"("transitionId", "principalType", "principalRef");
CREATE UNIQUE INDEX "ActorControlApproval_basisDigest_key"
  ON "ActorControlApproval"("basisDigest");
CREATE UNIQUE INDEX "ActorControlApproval_idempotencyKey_key"
  ON "ActorControlApproval"("idempotencyKey");
CREATE INDEX "ActorControlApproval_transition_disposition_idx"
  ON "ActorControlApproval"("transitionId", "disposition", "observedAt");

ALTER TABLE "ActorControlPolicy"
  ADD CONSTRAINT "ActorControlPolicy_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorControlPolicy"
  ADD CONSTRAINT "ActorControlPolicy_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActorControlGuardian"
  ADD CONSTRAINT "ActorControlGuardian_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "ActorControlPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActorControlEpoch"
  ADD CONSTRAINT "ActorControlEpoch_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorControlEpoch"
  ADD CONSTRAINT "ActorControlEpoch_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "ActorControlPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorControlEpoch"
  ADD CONSTRAINT "ActorControlEpoch_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActorControlTransition"
  ADD CONSTRAINT "ActorControlTransition_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorControlTransition"
  ADD CONSTRAINT "ActorControlTransition_fromEpochId_fkey"
  FOREIGN KEY ("fromEpochId") REFERENCES "ActorControlEpoch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorControlTransition"
  ADD CONSTRAINT "ActorControlTransition_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "ActorControlPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorControlTransition"
  ADD CONSTRAINT "ActorControlTransition_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorControlTransition"
  ADD CONSTRAINT "ActorControlTransition_resultingEpochId_fkey"
  FOREIGN KEY ("resultingEpochId") REFERENCES "ActorControlEpoch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActorControlApproval"
  ADD CONSTRAINT "ActorControlApproval_transitionId_fkey"
  FOREIGN KEY ("transitionId") REFERENCES "ActorControlTransition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActorControlApproval"
  ADD CONSTRAINT "ActorControlApproval_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_control_epoch_context()
RETURNS trigger AS $$
DECLARE
  policy_actor TEXT;
BEGIN
  SELECT "actorId" INTO policy_actor
  FROM "ActorControlPolicy"
  WHERE "id" = NEW."policyId";

  IF policy_actor IS NULL OR policy_actor <> NEW."actorId" THEN
    RAISE EXCEPTION 'control epoch policy does not belong to actor';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActorControlEpoch_context_guard"
BEFORE INSERT OR UPDATE OF "actorId", "policyId"
ON "ActorControlEpoch"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_control_epoch_context();

CREATE OR REPLACE FUNCTION noeone_validate_control_transition_context()
RETURNS trigger AS $$
DECLARE
  epoch_actor TEXT;
  policy_actor TEXT;
BEGIN
  SELECT "actorId" INTO epoch_actor
  FROM "ActorControlEpoch"
  WHERE "id" = NEW."fromEpochId";

  SELECT "actorId" INTO policy_actor
  FROM "ActorControlPolicy"
  WHERE "id" = NEW."policyId";

  IF epoch_actor IS NULL OR epoch_actor <> NEW."actorId" THEN
    RAISE EXCEPTION 'control transition predecessor epoch does not belong to actor';
  END IF;

  IF policy_actor IS NULL OR policy_actor <> NEW."actorId" THEN
    RAISE EXCEPTION 'control transition policy does not belong to actor';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActorControlTransition_context_guard"
BEFORE INSERT OR UPDATE OF "actorId", "fromEpochId", "policyId"
ON "ActorControlTransition"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_control_transition_context();

CREATE OR REPLACE FUNCTION noeone_validate_control_approval_guardian()
RETURNS trigger AS $$
DECLARE
  transition_policy TEXT;
  guardian_exists BOOLEAN;
BEGIN
  SELECT "policyId" INTO transition_policy
  FROM "ActorControlTransition"
  WHERE "id" = NEW."transitionId";

  IF transition_policy IS NULL THEN
    RAISE EXCEPTION 'control transition does not exist';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM "ActorControlGuardian"
    WHERE "policyId" = transition_policy
      AND "principalType" = NEW."principalType"
      AND "principalRef" = NEW."principalRef"
  ) INTO guardian_exists;

  IF NOT guardian_exists THEN
    RAISE EXCEPTION 'control approval principal is not a guardian for transition policy';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActorControlApproval_guardian_guard"
BEFORE INSERT OR UPDATE OF "transitionId", "principalType", "principalRef"
ON "ActorControlApproval"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_control_approval_guardian();

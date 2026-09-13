-- C2: collective action provenance.
--
-- C1 proves which members/roles belonged to a continuing collective at an epoch.
-- C2 records decisions, action-capacity claims, later ratifications, and plural
-- assessments without converting any evaluator's conclusion into universal truth.
--
-- Trust boundary: PostgreSQL invariants, not API convention.
-- Historical rows are append-only. Later ratification never mutates an earlier
-- binding and later roster/policy changes never rewrite a decision's epoch basis.

CREATE TABLE "CollectiveDecision" (
  "id" TEXT NOT NULL,
  "collectiveActorId" TEXT NOT NULL,
  "epochId" TEXT NOT NULL,
  "decisionType" TEXT NOT NULL,
  "proposalDigest" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "methodVersion" TEXT,
  "outcomeDigest" TEXT NOT NULL,
  "quorumBps" INTEGER,
  "decidedAt" TIMESTAMP(3) NOT NULL,
  "evidenceArtifactId" TEXT NOT NULL,
  "decisionPolicyDigest" TEXT NOT NULL,
  "constitutionDigest" TEXT NOT NULL,
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectiveDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollectiveDecision_quorumBps_check" CHECK ("quorumBps" IS NULL OR ("quorumBps" >= 0 AND "quorumBps" <= 10000)),
  CONSTRAINT "CollectiveDecision_decisionType_check" CHECK (length(btrim("decisionType")) > 0),
  CONSTRAINT "CollectiveDecision_method_check" CHECK (length(btrim("method")) > 0),
  CONSTRAINT "CollectiveDecision_proposalDigest_check" CHECK ("proposalDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "CollectiveDecision_outcomeDigest_check" CHECK ("outcomeDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "CollectiveDecision_decisionPolicyDigest_check" CHECK ("decisionPolicyDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "CollectiveDecision_constitutionDigest_check" CHECK ("constitutionDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "CollectiveDecision_basisDigest_check" CHECK ("basisDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "CollectiveDecision_idempotencyKey_check" CHECK (length(btrim("idempotencyKey")) >= 8)
);
CREATE UNIQUE INDEX "CollectiveDecision_basisDigest_key" ON "CollectiveDecision"("basisDigest");
CREATE UNIQUE INDEX "CollectiveDecision_idempotencyKey_key" ON "CollectiveDecision"("idempotencyKey");
CREATE INDEX "CollectiveDecision_collectiveActorId_decidedAt_idx" ON "CollectiveDecision"("collectiveActorId", "decidedAt");
CREATE INDEX "CollectiveDecision_epochId_decidedAt_idx" ON "CollectiveDecision"("epochId", "decidedAt");
CREATE INDEX "CollectiveDecision_evidenceArtifactId_idx" ON "CollectiveDecision"("evidenceArtifactId");

CREATE TABLE "CollectiveDecisionParticipation" (
  "decisionId" TEXT NOT NULL,
  "epochId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "memberActorId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "position" TEXT,
  "weightBps" INTEGER,
  "evidenceArtifactId" TEXT,
  "participationDigest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectiveDecisionParticipation_pkey" PRIMARY KEY ("decisionId", "memberActorId"),
  CONSTRAINT "CollectiveDecisionParticipation_role_check" CHECK (length(btrim("role")) > 0),
  CONSTRAINT "CollectiveDecisionParticipation_position_check" CHECK ("position" IS NULL OR length(btrim("position")) > 0),
  CONSTRAINT "CollectiveDecisionParticipation_weightBps_check" CHECK ("weightBps" IS NULL OR ("weightBps" >= 0 AND "weightBps" <= 10000)),
  CONSTRAINT "CollectiveDecisionParticipation_digest_check" CHECK ("participationDigest" ~ '^sha256:[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "CollectiveDecisionParticipation_decisionId_membershipId_key" ON "CollectiveDecisionParticipation"("decisionId", "membershipId");
CREATE UNIQUE INDEX "CollectiveDecisionParticipation_participationDigest_key" ON "CollectiveDecisionParticipation"("participationDigest");
CREATE INDEX "CollectiveDecisionParticipation_epochId_memberActorId_idx" ON "CollectiveDecisionParticipation"("epochId", "memberActorId");
CREATE INDEX "CollectiveDecisionParticipation_membershipId_idx" ON "CollectiveDecisionParticipation"("membershipId");
CREATE INDEX "CollectiveDecisionParticipation_evidenceArtifactId_idx" ON "CollectiveDecisionParticipation"("evidenceArtifactId");

CREATE TABLE "CollectiveActionBinding" (
  "id" TEXT NOT NULL,
  "collectiveActorId" TEXT NOT NULL,
  "epochId" TEXT NOT NULL,
  "memberActorId" TEXT,
  "membershipId" TEXT,
  "capacity" TEXT NOT NULL,
  "actedAt" TIMESTAMP(3) NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "decisionId" TEXT,
  "claimedAt" TIMESTAMP(3) NOT NULL,
  "bindingEvidenceArtifactId" TEXT NOT NULL,
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectiveActionBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollectiveActionBinding_capacity_check" CHECK ("capacity" IN ('COLLECTIVE_DIRECT', 'MEMBER_ON_BEHALF', 'MEMBER_PERSONAL', 'UNAUTHORIZED_COLLECTIVE_CLAIM')),
  CONSTRAINT "CollectiveActionBinding_sourceKind_check" CHECK ("sourceKind" IN ('AUTHORITY_EXERCISE', 'ACTOR_EVENT', 'EVIDENCE_ARTIFACT')),
  CONSTRAINT "CollectiveActionBinding_sourceRef_check" CHECK (length(btrim("sourceRef")) > 0),
  CONSTRAINT "CollectiveActionBinding_claimedAt_check" CHECK ("claimedAt" >= "actedAt"),
  CONSTRAINT "CollectiveActionBinding_member_pair_check" CHECK (("memberActorId" IS NULL) = ("membershipId" IS NULL)),
  CONSTRAINT "CollectiveActionBinding_basisDigest_check" CHECK ("basisDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "CollectiveActionBinding_idempotencyKey_check" CHECK (length(btrim("idempotencyKey")) >= 8)
);
CREATE UNIQUE INDEX "CollectiveActionBinding_basisDigest_key" ON "CollectiveActionBinding"("basisDigest");
CREATE UNIQUE INDEX "CollectiveActionBinding_idempotencyKey_key" ON "CollectiveActionBinding"("idempotencyKey");
CREATE INDEX "CollectiveActionBinding_collectiveActorId_actedAt_idx" ON "CollectiveActionBinding"("collectiveActorId", "actedAt");
CREATE INDEX "CollectiveActionBinding_epochId_actedAt_idx" ON "CollectiveActionBinding"("epochId", "actedAt");
CREATE INDEX "CollectiveActionBinding_memberActorId_actedAt_idx" ON "CollectiveActionBinding"("memberActorId", "actedAt");
CREATE INDEX "CollectiveActionBinding_decisionId_idx" ON "CollectiveActionBinding"("decisionId");
CREATE INDEX "CollectiveActionBinding_sourceKind_sourceRef_idx" ON "CollectiveActionBinding"("sourceKind", "sourceRef");
CREATE INDEX "CollectiveActionBinding_bindingEvidenceArtifactId_idx" ON "CollectiveActionBinding"("bindingEvidenceArtifactId");

CREATE TABLE "CollectiveActionRatification" (
  "id" TEXT NOT NULL,
  "actionBindingId" TEXT NOT NULL,
  "collectiveActorId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "ratifiedAt" TIMESTAMP(3) NOT NULL,
  "evidenceArtifactId" TEXT NOT NULL,
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectiveActionRatification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollectiveActionRatification_basisDigest_check" CHECK ("basisDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "CollectiveActionRatification_idempotencyKey_check" CHECK (length(btrim("idempotencyKey")) >= 8)
);
CREATE UNIQUE INDEX "CollectiveActionRatification_basisDigest_key" ON "CollectiveActionRatification"("basisDigest");
CREATE UNIQUE INDEX "CollectiveActionRatification_idempotencyKey_key" ON "CollectiveActionRatification"("idempotencyKey");
CREATE UNIQUE INDEX "CollectiveActionRatification_actionBindingId_decisionId_key" ON "CollectiveActionRatification"("actionBindingId", "decisionId");
CREATE INDEX "CollectiveActionRatification_actionBindingId_ratifiedAt_idx" ON "CollectiveActionRatification"("actionBindingId", "ratifiedAt");
CREATE INDEX "CollectiveActionRatification_collectiveActorId_ratifiedAt_idx" ON "CollectiveActionRatification"("collectiveActorId", "ratifiedAt");
CREATE INDEX "CollectiveActionRatification_decisionId_idx" ON "CollectiveActionRatification"("decisionId");
CREATE INDEX "CollectiveActionRatification_evidenceArtifactId_idx" ON "CollectiveActionRatification"("evidenceArtifactId");

CREATE TABLE "CollectiveCapacityAssessment" (
  "id" TEXT NOT NULL,
  "actionBindingId" TEXT NOT NULL,
  "evaluatorRef" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "methodVersion" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "basisDigest" TEXT NOT NULL,
  "evidenceArtifactId" TEXT NOT NULL,
  "assessedAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectiveCapacityAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollectiveCapacityAssessment_evaluatorRef_check" CHECK (length(btrim("evaluatorRef")) > 0),
  CONSTRAINT "CollectiveCapacityAssessment_method_check" CHECK (length(btrim("method")) > 0),
  CONSTRAINT "CollectiveCapacityAssessment_methodVersion_check" CHECK (length(btrim("methodVersion")) > 0),
  CONSTRAINT "CollectiveCapacityAssessment_disposition_check" CHECK ("disposition" IN ('SUPPORTED', 'NOT_SUPPORTED', 'PARTIALLY_SUPPORTED', 'INDETERMINATE', 'DISPUTED')),
  CONSTRAINT "CollectiveCapacityAssessment_basisDigest_check" CHECK ("basisDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "CollectiveCapacityAssessment_idempotencyKey_check" CHECK (length(btrim("idempotencyKey")) >= 8)
);
CREATE UNIQUE INDEX "CollectiveCapacityAssessment_basisDigest_key" ON "CollectiveCapacityAssessment"("basisDigest");
CREATE UNIQUE INDEX "CollectiveCapacityAssessment_idempotencyKey_key" ON "CollectiveCapacityAssessment"("idempotencyKey");
CREATE INDEX "CollectiveCapacityAssessment_actionBindingId_assessedAt_idx" ON "CollectiveCapacityAssessment"("actionBindingId", "assessedAt");
CREATE INDEX "CollectiveCapacityAssessment_evaluatorRef_assessedAt_idx" ON "CollectiveCapacityAssessment"("evaluatorRef", "assessedAt");
CREATE INDEX "CollectiveCapacityAssessment_method_methodVersion_idx" ON "CollectiveCapacityAssessment"("method", "methodVersion");
CREATE INDEX "CollectiveCapacityAssessment_evidenceArtifactId_idx" ON "CollectiveCapacityAssessment"("evidenceArtifactId");

CREATE OR REPLACE FUNCTION noe_collective_c2_decision_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  epoch "CollectiveEpoch"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'collective decisions are immutable';
  END IF;

  SELECT * INTO epoch FROM "CollectiveEpoch" WHERE "id" = NEW."epochId";
  IF NOT FOUND OR epoch."collectiveActorId" <> NEW."collectiveActorId" THEN
    RAISE EXCEPTION 'collective decision epoch is invalid';
  END IF;
  IF NEW."decidedAt" < epoch."startedAt" OR (epoch."endedAt" IS NOT NULL AND NEW."decidedAt" >= epoch."endedAt") THEN
    RAISE EXCEPTION 'collective decision time is outside its epoch';
  END IF;
  IF NEW."decisionPolicyDigest" <> epoch."decisionPolicyDigest" OR NEW."constitutionDigest" <> epoch."constitutionDigest" THEN
    RAISE EXCEPTION 'collective decision must snapshot the exact epoch policy and constitution';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "EvidenceArtifact" WHERE "id" = NEW."evidenceArtifactId") THEN
    RAISE EXCEPTION 'collective decision evidence does not exist';
  END IF;

  RETURN NEW;
END
$fn$;
CREATE TRIGGER "CollectiveDecision_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "CollectiveDecision"
FOR EACH ROW EXECUTE FUNCTION noe_collective_c2_decision_guard();

CREATE OR REPLACE FUNCTION noe_collective_c2_participation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  decision_row "CollectiveDecision"%ROWTYPE;
  snapshot "CollectiveEpochMembership"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'collective decision participation is immutable';
  END IF;

  SELECT * INTO decision_row FROM "CollectiveDecision" WHERE "id" = NEW."decisionId";
  IF NOT FOUND OR decision_row."epochId" <> NEW."epochId" THEN
    RAISE EXCEPTION 'collective decision participation epoch is invalid';
  END IF;

  SELECT * INTO snapshot
  FROM "CollectiveEpochMembership"
  WHERE "epochId" = NEW."epochId" AND "memberActorId" = NEW."memberActorId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'collective decision participant is not in the epoch roster';
  END IF;
  IF snapshot."membershipId" <> NEW."membershipId"
    OR snapshot."role" <> NEW."role"
    OR snapshot."weightBps" IS DISTINCT FROM NEW."weightBps"
  THEN
    RAISE EXCEPTION 'collective decision participation must copy the immutable epoch membership snapshot';
  END IF;
  IF NEW."evidenceArtifactId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "EvidenceArtifact" WHERE "id" = NEW."evidenceArtifactId")
  THEN
    RAISE EXCEPTION 'collective decision participation evidence does not exist';
  END IF;

  RETURN NEW;
END
$fn$;
CREATE TRIGGER "CollectiveDecisionParticipation_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "CollectiveDecisionParticipation"
FOR EACH ROW EXECUTE FUNCTION noe_collective_c2_participation_guard();

CREATE OR REPLACE FUNCTION noe_collective_c2_action_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  epoch "CollectiveEpoch"%ROWTYPE;
  snapshot "CollectiveEpochMembership"%ROWTYPE;
  decision_row "CollectiveDecision"%ROWTYPE;
  source_actor_id TEXT;
  source_time TIMESTAMP(3);
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'collective action bindings are immutable';
  END IF;

  SELECT * INTO epoch FROM "CollectiveEpoch" WHERE "id" = NEW."epochId";
  IF NOT FOUND OR epoch."collectiveActorId" <> NEW."collectiveActorId" THEN
    RAISE EXCEPTION 'collective action epoch is invalid';
  END IF;
  IF NEW."actedAt" < epoch."startedAt" OR (epoch."endedAt" IS NOT NULL AND NEW."actedAt" >= epoch."endedAt") THEN
    RAISE EXCEPTION 'collective action time is outside its epoch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "EvidenceArtifact" WHERE "id" = NEW."bindingEvidenceArtifactId") THEN
    RAISE EXCEPTION 'collective action binding evidence does not exist';
  END IF;

  IF NEW."capacity" = 'COLLECTIVE_DIRECT' THEN
    IF NEW."memberActorId" IS NOT NULL OR NEW."membershipId" IS NOT NULL THEN
      RAISE EXCEPTION 'collective-direct action cannot claim an executing member snapshot';
    END IF;
  ELSE
    IF NEW."memberActorId" IS NULL OR NEW."membershipId" IS NULL THEN
      RAISE EXCEPTION 'member-capacity action requires an epoch membership snapshot';
    END IF;
    SELECT * INTO snapshot
    FROM "CollectiveEpochMembership"
    WHERE "epochId" = NEW."epochId" AND "memberActorId" = NEW."memberActorId";
    IF NOT FOUND OR snapshot."membershipId" <> NEW."membershipId" THEN
      RAISE EXCEPTION 'collective action member is not the exact epoch membership snapshot';
    END IF;
  END IF;

  IF NEW."decisionId" IS NOT NULL THEN
    SELECT * INTO decision_row FROM "CollectiveDecision" WHERE "id" = NEW."decisionId";
    IF NOT FOUND OR decision_row."collectiveActorId" <> NEW."collectiveActorId" OR decision_row."epochId" <> NEW."epochId" THEN
      RAISE EXCEPTION 'collective action decision must belong to the same collective epoch';
    END IF;
    IF decision_row."decidedAt" > NEW."actedAt" THEN
      RAISE EXCEPTION 'future collective decision cannot pre-authorize a past action';
    END IF;
  END IF;

  IF NEW."capacity" = 'MEMBER_ON_BEHALF' AND NEW."decisionId" IS NULL AND NEW."sourceKind" <> 'AUTHORITY_EXERCISE' THEN
    RAISE EXCEPTION 'member-on-behalf action requires a prior decision or an authority exercise source';
  END IF;
  IF NEW."capacity" IN ('MEMBER_PERSONAL', 'UNAUTHORIZED_COLLECTIVE_CLAIM') AND NEW."decisionId" IS NOT NULL THEN
    RAISE EXCEPTION 'personal or unauthorized claims cannot carry a pre-authorizing collective decision';
  END IF;

  IF NEW."sourceKind" = 'AUTHORITY_EXERCISE' THEN
    SELECT "actorId", "exercisedAt" INTO source_actor_id, source_time
    FROM "AuthorityExercise" WHERE "id" = NEW."sourceRef";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'collective action authority exercise source does not exist';
    END IF;
    IF source_time <> NEW."actedAt" THEN
      RAISE EXCEPTION 'collective action time must equal the authority exercise time';
    END IF;
  ELSIF NEW."sourceKind" = 'ACTOR_EVENT' THEN
    SELECT "actorId", "occurredAt" INTO source_actor_id, source_time
    FROM "ActorEvent" WHERE "id" = NEW."sourceRef";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'collective action actor-event source does not exist';
    END IF;
    IF source_time <> NEW."actedAt" THEN
      RAISE EXCEPTION 'collective action time must equal the actor event time';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM "EvidenceArtifact" WHERE "id" = NEW."sourceRef") THEN
      RAISE EXCEPTION 'collective action evidence source does not exist';
    END IF;
  END IF;

  IF NEW."sourceKind" IN ('AUTHORITY_EXERCISE', 'ACTOR_EVENT') THEN
    IF NEW."capacity" = 'COLLECTIVE_DIRECT' AND source_actor_id <> NEW."collectiveActorId" THEN
      RAISE EXCEPTION 'collective-direct source actor must be the collective actor';
    END IF;
    IF NEW."capacity" <> 'COLLECTIVE_DIRECT' AND source_actor_id <> NEW."memberActorId" THEN
      RAISE EXCEPTION 'member-capacity source actor must be the claimed member actor';
    END IF;
  END IF;

  RETURN NEW;
END
$fn$;
CREATE TRIGGER "CollectiveActionBinding_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "CollectiveActionBinding"
FOR EACH ROW EXECUTE FUNCTION noe_collective_c2_action_guard();

CREATE OR REPLACE FUNCTION noe_collective_c2_ratification_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  binding_row "CollectiveActionBinding"%ROWTYPE;
  decision_row "CollectiveDecision"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'collective action ratifications are immutable';
  END IF;

  SELECT * INTO binding_row FROM "CollectiveActionBinding" WHERE "id" = NEW."actionBindingId";
  IF NOT FOUND OR binding_row."collectiveActorId" <> NEW."collectiveActorId" THEN
    RAISE EXCEPTION 'collective action ratification binding is invalid';
  END IF;
  SELECT * INTO decision_row FROM "CollectiveDecision" WHERE "id" = NEW."decisionId";
  IF NOT FOUND OR decision_row."collectiveActorId" <> NEW."collectiveActorId" THEN
    RAISE EXCEPTION 'collective action ratification decision is invalid';
  END IF;
  IF decision_row."decidedAt" < binding_row."actedAt" THEN
    RAISE EXCEPTION 'ratification decision must occur at or after the original action';
  END IF;
  IF NEW."ratifiedAt" < decision_row."decidedAt" THEN
    RAISE EXCEPTION 'ratification time cannot precede its decision';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "EvidenceArtifact" WHERE "id" = NEW."evidenceArtifactId") THEN
    RAISE EXCEPTION 'collective action ratification evidence does not exist';
  END IF;

  RETURN NEW;
END
$fn$;
CREATE TRIGGER "CollectiveActionRatification_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "CollectiveActionRatification"
FOR EACH ROW EXECUTE FUNCTION noe_collective_c2_ratification_guard();

CREATE OR REPLACE FUNCTION noe_collective_c2_assessment_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  binding_row "CollectiveActionBinding"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'collective capacity assessments are immutable';
  END IF;

  SELECT * INTO binding_row FROM "CollectiveActionBinding" WHERE "id" = NEW."actionBindingId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'collective capacity assessment binding does not exist';
  END IF;
  IF NEW."assessedAt" < binding_row."claimedAt" THEN
    RAISE EXCEPTION 'collective capacity assessment cannot predate the action binding claim';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "EvidenceArtifact" WHERE "id" = NEW."evidenceArtifactId") THEN
    RAISE EXCEPTION 'collective capacity assessment evidence does not exist';
  END IF;

  RETURN NEW;
END
$fn$;
CREATE TRIGGER "CollectiveCapacityAssessment_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "CollectiveCapacityAssessment"
FOR EACH ROW EXECUTE FUNCTION noe_collective_c2_assessment_guard();

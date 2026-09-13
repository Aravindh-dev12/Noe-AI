-- C1: persisted collective actor continuity.
--
-- Trust boundary: database invariants, not API convention.
-- - collective profiles can only attach to ORGANIZATION actors
-- - evidence references must exist
-- - exactly one active epoch per collective
-- - epoch sequences must advance from the exact predecessor
-- - historical epochs and snapshots are immutable
-- - memberships are temporal tenures; role changes create new tenures
-- - no self-membership and no duplicate active membership
-- - merge/split/dissolution are intentionally outside C1 ordinary continuation

CREATE TABLE "CollectiveProfile" (
  "actorId" TEXT NOT NULL,
  "governanceMethod" TEXT NOT NULL,
  "formationEvidenceArtifactId" TEXT NOT NULL,
  "formedAt" TIMESTAMP(3) NOT NULL,
  "profileDigest" TEXT NOT NULL,
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectiveProfile_pkey" PRIMARY KEY ("actorId"),
  CONSTRAINT "CollectiveProfile_governanceMethod_check" CHECK (length(btrim("governanceMethod")) > 0),
  CONSTRAINT "CollectiveProfile_profileDigest_check" CHECK (length(btrim("profileDigest")) > 0),
  CONSTRAINT "CollectiveProfile_basisDigest_check" CHECK (length(btrim("basisDigest")) > 0),
  CONSTRAINT "CollectiveProfile_idempotencyKey_check" CHECK (length(btrim("idempotencyKey")) >= 8)
);

CREATE UNIQUE INDEX "CollectiveProfile_profileDigest_key" ON "CollectiveProfile"("profileDigest");
CREATE UNIQUE INDEX "CollectiveProfile_idempotencyKey_key" ON "CollectiveProfile"("idempotencyKey");
CREATE INDEX "CollectiveProfile_formedAt_idx" ON "CollectiveProfile"("formedAt");
CREATE INDEX "CollectiveProfile_formationEvidenceArtifactId_idx" ON "CollectiveProfile"("formationEvidenceArtifactId");

CREATE TABLE "CollectiveEpoch" (
  "id" TEXT NOT NULL,
  "collectiveActorId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "predecessorEpochId" TEXT,
  "transitionKind" TEXT NOT NULL,
  "constitutionDigest" TEXT NOT NULL,
  "topologyDigest" TEXT NOT NULL,
  "decisionPolicyDigest" TEXT NOT NULL,
  "rosterDigest" TEXT NOT NULL,
  "stateDigest" TEXT NOT NULL,
  "transitionEvidenceArtifactId" TEXT NOT NULL,
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectiveEpoch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollectiveEpoch_sequence_check" CHECK ("sequence" >= 1),
  CONSTRAINT "CollectiveEpoch_transitionKind_check" CHECK (
    "transitionKind" IN (
      'formation',
      'roster_change',
      'role_change',
      'topology_change',
      'constitution_change',
      'control_change',
      'restore'
    )
  ),
  CONSTRAINT "CollectiveEpoch_endedAt_check" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt"),
  CONSTRAINT "CollectiveEpoch_constitutionDigest_check" CHECK (length(btrim("constitutionDigest")) > 0),
  CONSTRAINT "CollectiveEpoch_topologyDigest_check" CHECK (length(btrim("topologyDigest")) > 0),
  CONSTRAINT "CollectiveEpoch_decisionPolicyDigest_check" CHECK (length(btrim("decisionPolicyDigest")) > 0),
  CONSTRAINT "CollectiveEpoch_rosterDigest_check" CHECK (length(btrim("rosterDigest")) > 0),
  CONSTRAINT "CollectiveEpoch_stateDigest_check" CHECK (length(btrim("stateDigest")) > 0),
  CONSTRAINT "CollectiveEpoch_basisDigest_check" CHECK (length(btrim("basisDigest")) > 0),
  CONSTRAINT "CollectiveEpoch_idempotencyKey_check" CHECK (length(btrim("idempotencyKey")) >= 8)
);

CREATE UNIQUE INDEX "CollectiveEpoch_stateDigest_key" ON "CollectiveEpoch"("stateDigest");
CREATE UNIQUE INDEX "CollectiveEpoch_idempotencyKey_key" ON "CollectiveEpoch"("idempotencyKey");
CREATE UNIQUE INDEX "CollectiveEpoch_collectiveActorId_sequence_key" ON "CollectiveEpoch"("collectiveActorId", "sequence");
CREATE UNIQUE INDEX "CollectiveEpoch_one_active_per_collective_key"
  ON "CollectiveEpoch"("collectiveActorId") WHERE "endedAt" IS NULL;
CREATE INDEX "CollectiveEpoch_collectiveActorId_startedAt_idx" ON "CollectiveEpoch"("collectiveActorId", "startedAt");
CREATE INDEX "CollectiveEpoch_predecessorEpochId_idx" ON "CollectiveEpoch"("predecessorEpochId");
CREATE INDEX "CollectiveEpoch_transitionEvidenceArtifactId_idx" ON "CollectiveEpoch"("transitionEvidenceArtifactId");

CREATE TABLE "CollectiveMembership" (
  "id" TEXT NOT NULL,
  "collectiveActorId" TEXT NOT NULL,
  "memberActorId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "weightBps" INTEGER,
  "joinedAt" TIMESTAMP(3) NOT NULL,
  "leftAt" TIMESTAMP(3),
  "joinEpochId" TEXT NOT NULL,
  "leaveEpochId" TEXT,
  "joinEvidenceArtifactId" TEXT,
  "leaveEvidenceArtifactId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectiveMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollectiveMembership_role_check" CHECK (length(btrim("role")) > 0),
  CONSTRAINT "CollectiveMembership_weightBps_check" CHECK ("weightBps" IS NULL OR ("weightBps" >= 0 AND "weightBps" <= 10000)),
  CONSTRAINT "CollectiveMembership_leftAt_check" CHECK ("leftAt" IS NULL OR "leftAt" >= "joinedAt"),
  CONSTRAINT "CollectiveMembership_leave_fields_check" CHECK (
    ("leftAt" IS NULL AND "leaveEpochId" IS NULL AND "leaveEvidenceArtifactId" IS NULL)
    OR
    ("leftAt" IS NOT NULL AND "leaveEpochId" IS NOT NULL AND "leaveEvidenceArtifactId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "CollectiveMembership_one_active_member_key"
  ON "CollectiveMembership"("collectiveActorId", "memberActorId") WHERE "leftAt" IS NULL;
CREATE INDEX "CollectiveMembership_collectiveActorId_joinedAt_idx" ON "CollectiveMembership"("collectiveActorId", "joinedAt");
CREATE INDEX "CollectiveMembership_memberActorId_joinedAt_idx" ON "CollectiveMembership"("memberActorId", "joinedAt");
CREATE INDEX "CollectiveMembership_joinEpochId_idx" ON "CollectiveMembership"("joinEpochId");
CREATE INDEX "CollectiveMembership_leaveEpochId_idx" ON "CollectiveMembership"("leaveEpochId");

CREATE TABLE "CollectiveEpochMembership" (
  "epochId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "collectiveActorId" TEXT NOT NULL,
  "memberActorId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "weightBps" INTEGER,
  "snapshotDigest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectiveEpochMembership_pkey" PRIMARY KEY ("epochId", "memberActorId"),
  CONSTRAINT "CollectiveEpochMembership_role_check" CHECK (length(btrim("role")) > 0),
  CONSTRAINT "CollectiveEpochMembership_weightBps_check" CHECK ("weightBps" IS NULL OR ("weightBps" >= 0 AND "weightBps" <= 10000)),
  CONSTRAINT "CollectiveEpochMembership_snapshotDigest_check" CHECK (length(btrim("snapshotDigest")) > 0)
);

CREATE UNIQUE INDEX "CollectiveEpochMembership_epochId_membershipId_key" ON "CollectiveEpochMembership"("epochId", "membershipId");
CREATE INDEX "CollectiveEpochMembership_collectiveActorId_epochId_idx" ON "CollectiveEpochMembership"("collectiveActorId", "epochId");
CREATE INDEX "CollectiveEpochMembership_memberActorId_epochId_idx" ON "CollectiveEpochMembership"("memberActorId", "epochId");

CREATE OR REPLACE FUNCTION noe_collective_profile_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'collective profiles are immutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Actor"
    WHERE "id" = NEW."actorId" AND "actorType" = 'ORGANIZATION' AND "status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'collective profile actor must be an active ORGANIZATION actor';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "EvidenceArtifact" WHERE "id" = NEW."formationEvidenceArtifactId") THEN
    RAISE EXCEPTION 'collective formation evidence artifact does not exist';
  END IF;

  RETURN NEW;
END
$fn$;

CREATE TRIGGER "CollectiveProfile_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "CollectiveProfile"
FOR EACH ROW EXECUTE FUNCTION noe_collective_profile_guard();

CREATE OR REPLACE FUNCTION noe_collective_epoch_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  predecessor "CollectiveEpoch"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'collective epochs are immutable';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
      OR NEW."collectiveActorId" IS DISTINCT FROM OLD."collectiveActorId"
      OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
      OR NEW."predecessorEpochId" IS DISTINCT FROM OLD."predecessorEpochId"
      OR NEW."transitionKind" IS DISTINCT FROM OLD."transitionKind"
      OR NEW."constitutionDigest" IS DISTINCT FROM OLD."constitutionDigest"
      OR NEW."topologyDigest" IS DISTINCT FROM OLD."topologyDigest"
      OR NEW."decisionPolicyDigest" IS DISTINCT FROM OLD."decisionPolicyDigest"
      OR NEW."rosterDigest" IS DISTINCT FROM OLD."rosterDigest"
      OR NEW."stateDigest" IS DISTINCT FROM OLD."stateDigest"
      OR NEW."transitionEvidenceArtifactId" IS DISTINCT FROM OLD."transitionEvidenceArtifactId"
      OR NEW."basisDigest" IS DISTINCT FROM OLD."basisDigest"
      OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
      OR NEW."startedAt" IS DISTINCT FROM OLD."startedAt"
      OR NEW."metadata" IS DISTINCT FROM OLD."metadata"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    THEN
      RAISE EXCEPTION 'collective epoch historical state is immutable';
    END IF;

    IF OLD."endedAt" IS NOT NULL OR NEW."endedAt" IS NULL OR NEW."endedAt" < OLD."startedAt" THEN
      RAISE EXCEPTION 'collective epoch may only be closed once at or after its start';
    END IF;

    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "CollectiveProfile" WHERE "actorId" = NEW."collectiveActorId") THEN
    RAISE EXCEPTION 'collective profile does not exist';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "EvidenceArtifact" WHERE "id" = NEW."transitionEvidenceArtifactId") THEN
    RAISE EXCEPTION 'collective transition evidence artifact does not exist';
  END IF;

  IF NEW."sequence" = 1 THEN
    IF NEW."predecessorEpochId" IS NOT NULL OR NEW."transitionKind" <> 'formation' THEN
      RAISE EXCEPTION 'collective epoch sequence 1 must be a formation without predecessor';
    END IF;
  ELSE
    IF NEW."predecessorEpochId" IS NULL OR NEW."transitionKind" = 'formation' THEN
      RAISE EXCEPTION 'collective continuation epoch requires a non-formation predecessor';
    END IF;

    SELECT * INTO predecessor FROM "CollectiveEpoch" WHERE "id" = NEW."predecessorEpochId";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'collective predecessor epoch does not exist';
    END IF;

    IF predecessor."collectiveActorId" <> NEW."collectiveActorId"
      OR predecessor."sequence" <> NEW."sequence" - 1
    THEN
      RAISE EXCEPTION 'collective predecessor must be the exact previous epoch';
    END IF;

    IF predecessor."endedAt" IS NULL OR predecessor."endedAt" <> NEW."startedAt" THEN
      RAISE EXCEPTION 'collective predecessor must close exactly when the next epoch starts';
    END IF;
  END IF;

  RETURN NEW;
END
$fn$;

CREATE TRIGGER "CollectiveEpoch_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "CollectiveEpoch"
FOR EACH ROW EXECUTE FUNCTION noe_collective_epoch_guard();

CREATE OR REPLACE FUNCTION noe_collective_membership_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  join_epoch "CollectiveEpoch"%ROWTYPE;
  leave_epoch "CollectiveEpoch"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'collective membership tenures are immutable';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
      OR NEW."collectiveActorId" IS DISTINCT FROM OLD."collectiveActorId"
      OR NEW."memberActorId" IS DISTINCT FROM OLD."memberActorId"
      OR NEW."role" IS DISTINCT FROM OLD."role"
      OR NEW."weightBps" IS DISTINCT FROM OLD."weightBps"
      OR NEW."joinedAt" IS DISTINCT FROM OLD."joinedAt"
      OR NEW."joinEpochId" IS DISTINCT FROM OLD."joinEpochId"
      OR NEW."joinEvidenceArtifactId" IS DISTINCT FROM OLD."joinEvidenceArtifactId"
      OR NEW."metadata" IS DISTINCT FROM OLD."metadata"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    THEN
      RAISE EXCEPTION 'collective membership historical state is immutable';
    END IF;

    IF OLD."leftAt" IS NOT NULL
      OR NEW."leftAt" IS NULL
      OR NEW."leaveEpochId" IS NULL
      OR NEW."leaveEvidenceArtifactId" IS NULL
    THEN
      RAISE EXCEPTION 'collective membership may only be closed once with epoch and evidence';
    END IF;

    SELECT * INTO leave_epoch FROM "CollectiveEpoch" WHERE "id" = NEW."leaveEpochId";
    IF NOT FOUND OR leave_epoch."collectiveActorId" <> OLD."collectiveActorId" THEN
      RAISE EXCEPTION 'collective membership leave epoch is invalid';
    END IF;
    IF leave_epoch."startedAt" <> NEW."leftAt" OR NEW."leftAt" < OLD."joinedAt" THEN
      RAISE EXCEPTION 'collective membership leave time must equal the leave epoch start';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "EvidenceArtifact" WHERE "id" = NEW."leaveEvidenceArtifactId") THEN
      RAISE EXCEPTION 'collective membership leave evidence does not exist';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW."memberActorId" = NEW."collectiveActorId" THEN
    RAISE EXCEPTION 'collective actor cannot be its own member';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "CollectiveProfile" WHERE "actorId" = NEW."collectiveActorId") THEN
    RAISE EXCEPTION 'collective profile does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Actor" WHERE "id" = NEW."memberActorId") THEN
    RAISE EXCEPTION 'collective member actor does not exist';
  END IF;

  SELECT * INTO join_epoch FROM "CollectiveEpoch" WHERE "id" = NEW."joinEpochId";
  IF NOT FOUND OR join_epoch."collectiveActorId" <> NEW."collectiveActorId" THEN
    RAISE EXCEPTION 'collective membership join epoch is invalid';
  END IF;
  IF join_epoch."startedAt" <> NEW."joinedAt" THEN
    RAISE EXCEPTION 'collective membership join time must equal the join epoch start';
  END IF;
  IF NEW."joinEvidenceArtifactId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "EvidenceArtifact" WHERE "id" = NEW."joinEvidenceArtifactId")
  THEN
    RAISE EXCEPTION 'collective membership join evidence does not exist';
  END IF;

  RETURN NEW;
END
$fn$;

CREATE TRIGGER "CollectiveMembership_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "CollectiveMembership"
FOR EACH ROW EXECUTE FUNCTION noe_collective_membership_guard();

CREATE OR REPLACE FUNCTION noe_collective_epoch_membership_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  epoch_row "CollectiveEpoch"%ROWTYPE;
  membership_row "CollectiveMembership"%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'collective epoch membership snapshots are immutable';
  END IF;

  SELECT * INTO epoch_row FROM "CollectiveEpoch" WHERE "id" = NEW."epochId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'collective epoch snapshot references missing epoch';
  END IF;

  SELECT * INTO membership_row FROM "CollectiveMembership" WHERE "id" = NEW."membershipId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'collective epoch snapshot references missing membership';
  END IF;

  IF epoch_row."collectiveActorId" <> NEW."collectiveActorId"
    OR membership_row."collectiveActorId" <> NEW."collectiveActorId"
    OR membership_row."memberActorId" <> NEW."memberActorId"
    OR membership_row."role" <> NEW."role"
    OR membership_row."weightBps" IS DISTINCT FROM NEW."weightBps"
  THEN
    RAISE EXCEPTION 'collective epoch snapshot does not match epoch/membership state';
  END IF;

  IF membership_row."joinedAt" > epoch_row."startedAt"
    OR (membership_row."leftAt" IS NOT NULL AND membership_row."leftAt" <= epoch_row."startedAt")
  THEN
    RAISE EXCEPTION 'collective membership was not active at epoch start';
  END IF;

  RETURN NEW;
END
$fn$;

CREATE TRIGGER "CollectiveEpochMembership_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "CollectiveEpochMembership"
FOR EACH ROW EXECUTE FUNCTION noe_collective_epoch_membership_guard();

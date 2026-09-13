-- C1 hardening after the base collective schema.
--
-- Nested collectives are intentionally excluded from C1. Allowing a collective
-- to contain another collective creates recursive identity/liability graphs and
-- permits cycles (A contains B while B contains A). That needs a separate,
-- explicit semantic layer, not accidental support.
--
-- Every committed epoch must also contain at least one epoch-pinned membership
-- snapshot. This is a deferred constraint because formation/transition writes
-- the epoch first and its snapshots later in the same transaction.

CREATE OR REPLACE FUNCTION noe_collective_c1_no_nested_members()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CollectiveProfile" WHERE "actorId" = NEW."memberActorId"
  ) THEN
    RAISE EXCEPTION 'nested collective membership is not supported in C1';
  END IF;

  RETURN NEW;
END
$fn$;

CREATE TRIGGER "CollectiveMembership_no_nested_collectives"
BEFORE INSERT ON "CollectiveMembership"
FOR EACH ROW EXECUTE FUNCTION noe_collective_c1_no_nested_members();

CREATE OR REPLACE FUNCTION noe_collective_epoch_requires_roster()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "CollectiveEpochMembership" WHERE "epochId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'collective epoch must commit with at least one membership snapshot';
  END IF;

  RETURN NULL;
END
$fn$;

CREATE CONSTRAINT TRIGGER "CollectiveEpoch_requires_roster"
AFTER INSERT ON "CollectiveEpoch"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION noe_collective_epoch_requires_roster();

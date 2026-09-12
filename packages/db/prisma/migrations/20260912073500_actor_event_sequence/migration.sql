ALTER TABLE "ActorEvent" ADD COLUMN "sequence" INTEGER;

-- Reconstruct canonical order from the signed/hash-linked history itself rather
-- than from timestamps. This makes the migration deterministic even when two
-- existing events share the same millisecond timestamp.
WITH RECURSIVE event_chain AS (
  SELECT
    e."id",
    e."actorId",
    e."hash",
    1 AS seq
  FROM "ActorEvent" e
  WHERE e."previousEventHash" IS NULL

  UNION ALL

  SELECT
    child."id",
    child."actorId",
    child."hash",
    parent.seq + 1
  FROM event_chain parent
  JOIN "ActorEvent" child
    ON child."actorId" = parent."actorId"
   AND child."previousEventHash" = parent."hash"
)
UPDATE "ActorEvent" target
SET "sequence" = event_chain.seq
FROM event_chain
WHERE target."id" = event_chain."id";

-- Refuse to install a sequence invariant on top of already-corrupt history.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ActorEvent" WHERE "sequence" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill ActorEvent.sequence: one or more events are not reachable from a chain root';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ActorEvent"
    GROUP BY "actorId", "sequence"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot backfill ActorEvent.sequence: actor history contains multiple events at one chain position';
  END IF;
END
$$;

ALTER TABLE "ActorEvent" ALTER COLUMN "sequence" SET NOT NULL;
CREATE UNIQUE INDEX "ActorEvent_actorId_sequence_key" ON "ActorEvent"("actorId", "sequence");

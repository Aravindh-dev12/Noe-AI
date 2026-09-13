-- Decisions describe what should happen. Confirmations prove that an action
-- actually happened in a system authoritative for that state. This separation
-- prevents NOEONE from equating a proposed revocation/transfer/settlement with
-- successful external execution.

CREATE TABLE "ActorResolutionItemConfirmation" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "evidenceArtifactId" TEXT NOT NULL,
  "confirmerType" TEXT NOT NULL,
  "confirmerRef" TEXT,
  "externalFramework" TEXT,
  "externalReference" TEXT,
  "confirmedAt" TIMESTAMP(3) NOT NULL,
  "confirmationDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActorResolutionItemConfirmation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActorResolutionItemConfirmation_confirmer_nonempty" CHECK (length(btrim("confirmerType")) > 0),
  CONSTRAINT "ActorResolutionItemConfirmation_digest_shape" CHECK ("confirmationDigest" ~ '^sha256:[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "ActorResolutionItemConfirmation_idempotencyKey_key"
  ON "ActorResolutionItemConfirmation"("idempotencyKey");
CREATE UNIQUE INDEX "ActorResolutionItemConfirmation_confirmationDigest_key"
  ON "ActorResolutionItemConfirmation"("confirmationDigest");
CREATE UNIQUE INDEX "ActorResolutionItemConfirmation_decision_key"
  ON "ActorResolutionItemConfirmation"("decisionId");
CREATE INDEX "ActorResolutionItemConfirmation_item_time_idx"
  ON "ActorResolutionItemConfirmation"("itemId", "confirmedAt");

ALTER TABLE "ActorResolutionItemConfirmation"
  ADD CONSTRAINT "ActorResolutionItemConfirmation_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "ActorResolutionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActorResolutionItemConfirmation"
  ADD CONSTRAINT "ActorResolutionItemConfirmation_decisionId_fkey"
  FOREIGN KEY ("decisionId") REFERENCES "ActorResolutionItemDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorResolutionItemConfirmation"
  ADD CONSTRAINT "ActorResolutionItemConfirmation_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_resolution_confirmation()
RETURNS trigger AS $$
DECLARE
  decision_item TEXT;
  decision_disposition TEXT;
  current_decision TEXT;
  current_status TEXT;
  case_status TEXT;
BEGIN
  SELECT "itemId", "disposition" INTO decision_item, decision_disposition
  FROM "ActorResolutionItemDecision" WHERE "id" = NEW."decisionId";

  SELECT i."latestDecisionId", i."status", c."status"
    INTO current_decision, current_status, case_status
  FROM "ActorResolutionItem" i
  JOIN "ActorResolutionCase" c ON c."id" = i."caseId"
  WHERE i."id" = NEW."itemId"
  FOR UPDATE OF i, c;

  IF decision_item IS NULL OR decision_item <> NEW."itemId" THEN
    RAISE EXCEPTION 'resolution confirmation decision belongs to a different item';
  END IF;
  IF current_decision IS DISTINCT FROM NEW."decisionId" THEN
    RAISE EXCEPTION 'resolution confirmation must reference the current decision';
  END IF;
  IF case_status IN ('RESOLVED', 'SUPERSEDED', 'ABANDONED') THEN
    RAISE EXCEPTION 'cannot confirm action on terminal resolution case %', case_status;
  END IF;
  IF decision_disposition IN ('DISPUTE', 'ORPHAN', 'NO_ACTION_REQUIRED', 'ARCHIVE_ONLY') THEN
    RAISE EXCEPTION 'disposition % does not require action confirmation', decision_disposition;
  END IF;
  IF current_status NOT IN ('ACTION_REQUESTED', 'CONFIRMED') THEN
    RAISE EXCEPTION 'resolution item is not awaiting action confirmation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActorResolutionConfirmation_guard"
BEFORE INSERT ON "ActorResolutionItemConfirmation"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_resolution_confirmation();

-- Enforce the state-machine edges in the database as a backstop for every
-- caller, not merely the HTTP API.
CREATE OR REPLACE FUNCTION noeone_validate_resolution_state_edge()
RETURNS trigger AS $$
BEGIN
  IF NEW."fromStatus" IS NULL THEN
    IF NEW."toStatus" = 'OPEN' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'resolution opening transition must target OPEN';
  END IF;

  IF NEW."fromStatus" = NEW."toStatus" THEN
    RETURN NEW;
  END IF;

  IF (NEW."fromStatus", NEW."toStatus") IN (
    ('OPEN', 'FREEZE_PENDING'), ('OPEN', 'FROZEN'), ('OPEN', 'INVENTORY'), ('OPEN', 'DISPUTED'), ('OPEN', 'ABANDONED'),
    ('FREEZE_PENDING', 'FROZEN'), ('FREEZE_PENDING', 'DISPUTED'), ('FREEZE_PENDING', 'ABANDONED'),
    ('FROZEN', 'INVENTORY'), ('FROZEN', 'AWAITING_EXTERNAL_DECISIONS'), ('FROZEN', 'DISPUTED'), ('FROZEN', 'ABANDONED'),
    ('INVENTORY', 'AWAITING_EXTERNAL_DECISIONS'), ('INVENTORY', 'PARTIALLY_RESOLVED'), ('INVENTORY', 'DISPUTED'), ('INVENTORY', 'ABANDONED'),
    ('AWAITING_EXTERNAL_DECISIONS', 'PARTIALLY_RESOLVED'), ('AWAITING_EXTERNAL_DECISIONS', 'SUCCESSION_PENDING'), ('AWAITING_EXTERNAL_DECISIONS', 'RESOLVED'), ('AWAITING_EXTERNAL_DECISIONS', 'DISPUTED'), ('AWAITING_EXTERNAL_DECISIONS', 'ABANDONED'),
    ('PARTIALLY_RESOLVED', 'AWAITING_EXTERNAL_DECISIONS'), ('PARTIALLY_RESOLVED', 'SUCCESSION_PENDING'), ('PARTIALLY_RESOLVED', 'RESOLVED'), ('PARTIALLY_RESOLVED', 'DISPUTED'), ('PARTIALLY_RESOLVED', 'ABANDONED'),
    ('SUCCESSION_PENDING', 'PARTIALLY_RESOLVED'), ('SUCCESSION_PENDING', 'RESOLVED'), ('SUCCESSION_PENDING', 'DISPUTED'), ('SUCCESSION_PENDING', 'ABANDONED'),
    ('DISPUTED', 'FROZEN'), ('DISPUTED', 'AWAITING_EXTERNAL_DECISIONS'), ('DISPUTED', 'PARTIALLY_RESOLVED'), ('DISPUTED', 'SUCCESSION_PENDING'), ('DISPUTED', 'RESOLVED'), ('DISPUTED', 'ABANDONED')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid actor resolution state transition % -> %', NEW."fromStatus", NEW."toStatus";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActorResolutionTransition_state_edge_guard"
BEFORE INSERT ON "ActorResolutionTransition"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_resolution_state_edge();

-- Reliance Signals / Material-Change Propagation
--
-- One semantic signal binds one immutable Reliance Change Assessment to the
-- exact historical counterparty that relied on the actor. Delivery transports
-- belong to append-only receipts so multiple channels cannot fork the signal's
-- institutional meaning.

CREATE TABLE "RelianceSignal" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "relianceId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "counterpartyType" TEXT NOT NULL,
    "counterpartyRef" TEXT NOT NULL,
    "relationKind" TEXT NOT NULL,
    "originalActorStateDigest" TEXT NOT NULL,
    "successorStateDigest" TEXT NOT NULL,
    "successorLineageId" TEXT NOT NULL,
    "successorExecutionId" TEXT NOT NULL,
    "successorEventSequence" INTEGER NOT NULL,
    "structuralChanges" JSONB NOT NULL,
    "disposition" TEXT NOT NULL,
    "emittedAt" TIMESTAMP(3) NOT NULL,
    "signalDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelianceSignal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RelianceSignal_relation_kind_check" CHECK (
      "relationKind" IN ('AUTHORIZE','TRANSACT','INSURE','HIRE','FOLLOW','HOST','CERTIFY','DELEGATE','OTHER')
    ),
    CONSTRAINT "RelianceSignal_disposition_check" CHECK (
      "disposition" IN ('UNAFFECTED','REVIEW_REQUIRED','INVALIDATED','DISPUTED')
    ),
    CONSTRAINT "RelianceSignal_original_hash_check" CHECK ("originalActorStateDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceSignal_successor_hash_check" CHECK ("successorStateDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceSignal_digest_check" CHECK ("signalDigest" ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT "RelianceSignal_sequence_check" CHECK ("successorEventSequence" >= 0),
    CONSTRAINT "RelianceSignal_changes_shape_check" CHECK (jsonb_typeof("structuralChanges") = 'array')
);

CREATE TABLE "RelianceSignalReceipt" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "relianceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "partyRef" TEXT NOT NULL,
    "transportProfile" TEXT,
    "transportRef" TEXT,
    "evidenceArtifactId" TEXT,
    "successorRelianceId" TEXT,
    "detailDigest" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "receiptDigest" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelianceSignalReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RelianceSignalReceipt_kind_check" CHECK (
      "kind" IN (
        'DELIVERED','DELIVERY_FAILED','ACKNOWLEDGED','REVIEW_STARTED',
        'RELIANCE_RENEWED','RELIANCE_REJECTED','EXPIRED'
      )
    ),
    CONSTRAINT "RelianceSignalReceipt_transport_profile_check" CHECK (
      "transportProfile" IS NULL OR
      "transportProfile" IN ('INTERNAL','SSF','CAEP','WEBHOOK','MANUAL','OTHER')
    ),
    CONSTRAINT "RelianceSignalReceipt_transport_ref_check" CHECK (
      "transportRef" IS NULL OR "transportProfile" IS NOT NULL
    ),
    CONSTRAINT "RelianceSignalReceipt_delivery_transport_check" CHECK (
      "kind" NOT IN ('DELIVERED','DELIVERY_FAILED') OR "transportProfile" IS NOT NULL
    ),
    CONSTRAINT "RelianceSignalReceipt_detail_hash_check" CHECK (
      "detailDigest" IS NULL OR "detailDigest" ~ '^sha256:[0-9a-f]{64}$'
    ),
    CONSTRAINT "RelianceSignalReceipt_digest_check" CHECK ("receiptDigest" ~ '^sha256:[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "RelianceSignal_assessmentId_key" ON "RelianceSignal"("assessmentId");
CREATE UNIQUE INDEX "RelianceSignal_signalDigest_key" ON "RelianceSignal"("signalDigest");
CREATE UNIQUE INDEX "RelianceSignal_idempotencyKey_key" ON "RelianceSignal"("idempotencyKey");
CREATE INDEX "RelianceSignal_actorId_emittedAt_idx" ON "RelianceSignal"("actorId", "emittedAt");
CREATE INDEX "RelianceSignal_relianceId_emittedAt_idx" ON "RelianceSignal"("relianceId", "emittedAt");
CREATE INDEX "RelianceSignal_counterparty_idx" ON "RelianceSignal"("counterpartyType", "counterpartyRef", "emittedAt");
CREATE INDEX "RelianceSignal_disposition_idx" ON "RelianceSignal"("disposition", "emittedAt");

CREATE UNIQUE INDEX "RelianceSignalReceipt_receiptDigest_key" ON "RelianceSignalReceipt"("receiptDigest");
CREATE UNIQUE INDEX "RelianceSignalReceipt_idempotencyKey_key" ON "RelianceSignalReceipt"("idempotencyKey");
CREATE INDEX "RelianceSignalReceipt_signalId_observedAt_idx" ON "RelianceSignalReceipt"("signalId", "observedAt");
CREATE INDEX "RelianceSignalReceipt_actorId_observedAt_idx" ON "RelianceSignalReceipt"("actorId", "observedAt");
CREATE INDEX "RelianceSignalReceipt_relianceId_observedAt_idx" ON "RelianceSignalReceipt"("relianceId", "observedAt");
CREATE INDEX "RelianceSignalReceipt_kind_observedAt_idx" ON "RelianceSignalReceipt"("kind", "observedAt");
CREATE INDEX "RelianceSignalReceipt_transportProfile_observedAt_idx" ON "RelianceSignalReceipt"("transportProfile", "observedAt");
CREATE INDEX "RelianceSignalReceipt_evidenceArtifactId_idx" ON "RelianceSignalReceipt"("evidenceArtifactId");
CREATE INDEX "RelianceSignalReceipt_successorRelianceId_idx" ON "RelianceSignalReceipt"("successorRelianceId");

ALTER TABLE "RelianceSignal"
  ADD CONSTRAINT "RelianceSignal_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceSignal_relianceId_fkey"
  FOREIGN KEY ("relianceId") REFERENCES "RelianceBasis"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceSignal_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "RelianceChangeAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceSignal_successorExecutionId_fkey"
  FOREIGN KEY ("successorExecutionId") REFERENCES "ActorExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceSignal_successorLineageId_fkey"
  FOREIGN KEY ("successorLineageId") REFERENCES "LineageNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RelianceSignalReceipt"
  ADD CONSTRAINT "RelianceSignalReceipt_signalId_fkey"
  FOREIGN KEY ("signalId") REFERENCES "RelianceSignal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceSignalReceipt_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceSignalReceipt_relianceId_fkey"
  FOREIGN KEY ("relianceId") REFERENCES "RelianceBasis"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceSignalReceipt_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RelianceSignalReceipt_successorRelianceId_fkey"
  FOREIGN KEY ("successorRelianceId") REFERENCES "RelianceBasis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_reliance_signal()
RETURNS TRIGGER AS $$
DECLARE
  basis "RelianceBasis"%ROWTYPE;
  assessment "RelianceChangeAssessment"%ROWTYPE;
BEGIN
  SELECT * INTO basis FROM "RelianceBasis" WHERE "id" = NEW."relianceId";
  IF NOT FOUND THEN RAISE EXCEPTION 'reliance signal basis not found'; END IF;

  SELECT * INTO assessment FROM "RelianceChangeAssessment" WHERE "id" = NEW."assessmentId";
  IF NOT FOUND THEN RAISE EXCEPTION 'reliance signal assessment not found'; END IF;

  IF basis."actorId" <> NEW."actorId"
     OR assessment."actorId" <> NEW."actorId"
     OR assessment."relianceId" <> NEW."relianceId" THEN
    RAISE EXCEPTION 'reliance signal actor/basis/assessment mismatch';
  END IF;

  IF NEW."counterpartyType" <> basis."counterpartyType"
     OR NEW."counterpartyRef" <> basis."counterpartyRef"
     OR NEW."relationKind" <> basis."relationKind" THEN
    RAISE EXCEPTION 'reliance signal counterparty semantics differ from basis';
  END IF;

  IF NEW."originalActorStateDigest" <> basis."actorStateDigest" THEN
    RAISE EXCEPTION 'reliance signal original state digest mismatch';
  END IF;

  IF NEW."successorStateDigest" <> assessment."successorStateDigest"
     OR NEW."successorLineageId" <> assessment."successorLineageId"
     OR NEW."successorExecutionId" <> assessment."successorExecutionId"
     OR NEW."successorEventSequence" <> assessment."successorEventSequence"
     OR NEW."disposition" <> assessment."disposition"
     OR NEW."structuralChanges" <> assessment."structuralChanges" THEN
    RAISE EXCEPTION 'reliance signal successor semantics differ from assessment';
  END IF;

  IF NEW."emittedAt" < assessment."assessedAt" THEN
    RAISE EXCEPTION 'reliance signal cannot predate its source assessment';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RelianceSignal_validate_insert"
BEFORE INSERT ON "RelianceSignal"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_reliance_signal();

CREATE OR REPLACE FUNCTION noeone_validate_reliance_signal_receipt()
RETURNS TRIGGER AS $$
DECLARE
  signal_record "RelianceSignal"%ROWTYPE;
  basis "RelianceBasis"%ROWTYPE;
  successor_basis "RelianceBasis"%ROWTYPE;
BEGIN
  SELECT * INTO signal_record FROM "RelianceSignal" WHERE "id" = NEW."signalId";
  IF NOT FOUND THEN RAISE EXCEPTION 'reliance signal receipt source signal not found'; END IF;

  IF signal_record."actorId" <> NEW."actorId"
     OR signal_record."relianceId" <> NEW."relianceId" THEN
    RAISE EXCEPTION 'reliance signal receipt actor/reliance mismatch';
  END IF;

  IF NEW."observedAt" < signal_record."emittedAt" THEN
    RAISE EXCEPTION 'reliance signal receipt cannot predate signal emission';
  END IF;

  IF NEW."kind" IN ('DELIVERED','DELIVERY_FAILED') AND NEW."transportProfile" IS NULL THEN
    RAISE EXCEPTION 'delivery receipt requires transport profile';
  END IF;
  IF NEW."transportRef" IS NOT NULL AND NEW."transportProfile" IS NULL THEN
    RAISE EXCEPTION 'transport reference requires transport profile';
  END IF;

  IF NEW."kind" IN ('ACKNOWLEDGED','REVIEW_STARTED','RELIANCE_RENEWED','RELIANCE_REJECTED')
     AND (
       NEW."partyType" <> signal_record."counterpartyType"
       OR NEW."partyRef" <> signal_record."counterpartyRef"
     ) THEN
    RAISE EXCEPTION 'institutional reliance response must come from original relying counterparty';
  END IF;

  IF NEW."kind" <> 'EXPIRED' AND NEW."evidenceArtifactId" IS NULL THEN
    RAISE EXCEPTION 'non-expiry reliance signal receipt requires evidence';
  END IF;

  IF NEW."kind" = 'RELIANCE_RENEWED' THEN
    IF NEW."successorRelianceId" IS NULL THEN
      RAISE EXCEPTION 'reliance renewal receipt requires successor reliance';
    END IF;

    SELECT * INTO basis FROM "RelianceBasis" WHERE "id" = NEW."relianceId";
    IF NOT FOUND THEN RAISE EXCEPTION 'renewal source reliance not found'; END IF;

    SELECT * INTO successor_basis FROM "RelianceBasis" WHERE "id" = NEW."successorRelianceId";
    IF NOT FOUND THEN RAISE EXCEPTION 'renewal successor reliance not found'; END IF;

    IF successor_basis."supersedesRelianceId" IS DISTINCT FROM basis."id" THEN
      RAISE EXCEPTION 'renewal successor must explicitly supersede original reliance';
    END IF;
    IF successor_basis."actorId" <> basis."actorId"
       OR successor_basis."counterpartyType" <> basis."counterpartyType"
       OR successor_basis."counterpartyRef" <> basis."counterpartyRef"
       OR successor_basis."relationKind" <> basis."relationKind" THEN
      RAISE EXCEPTION 'renewal successor reliance changes actor/counterparty semantics';
    END IF;
    IF successor_basis."capturedAt" < signal_record."emittedAt" THEN
      RAISE EXCEPTION 'renewal successor reliance predates source signal';
    END IF;
    IF NEW."observedAt" < successor_basis."capturedAt" THEN
      RAISE EXCEPTION 'renewal receipt predates successor reliance capture';
    END IF;
  ELSIF NEW."successorRelianceId" IS NOT NULL THEN
    RAISE EXCEPTION 'only renewal receipts may reference successor reliance';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RelianceSignalReceipt_validate_insert"
BEFORE INSERT ON "RelianceSignalReceipt"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_reliance_signal_receipt();

CREATE OR REPLACE FUNCTION noeone_guard_reliance_signal_history()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'reliance signal history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RelianceSignal_guard_update"
BEFORE UPDATE ON "RelianceSignal"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_reliance_signal_history();
CREATE TRIGGER "RelianceSignal_guard_delete"
BEFORE DELETE ON "RelianceSignal"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_reliance_signal_history();
CREATE TRIGGER "RelianceSignalReceipt_guard_update"
BEFORE UPDATE ON "RelianceSignalReceipt"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_reliance_signal_history();
CREATE TRIGGER "RelianceSignalReceipt_guard_delete"
BEFORE DELETE ON "RelianceSignalReceipt"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_reliance_signal_history();

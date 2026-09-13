-- Counterparty response hardening
--
-- Delivery evidence may come from a transport operator. Institutional response
-- events (acknowledgement, review, renewal, rejection) must be attributable to
-- the original counterparty recorded on the immutable Reliance Basis.

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

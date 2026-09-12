-- Actor Resolution is the failure-mode counterpart to transition clearing.
-- It coordinates the winding down/freeze of distributed actor state when
-- ordinary continuation or clean succession is unavailable. These records
-- are evidence/workflow state only; they do not claim authority over external
-- credentials, contracts, wallets, courts, or counterparties.

CREATE TABLE "ActorResolutionCase" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "primaryTrigger" TEXT NOT NULL,
  "resolutionContext" TEXT NOT NULL,
  "openedByType" TEXT NOT NULL,
  "openedByRef" TEXT,
  "sourceEvidenceArtifactId" TEXT,
  "freezePolicyVersion" TEXT NOT NULL,
  "successorActorId" TEXT,
  "caseDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL,
  "frozenAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "finalDisposition" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActorResolutionCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActorResolutionCase_status_check" CHECK ("status" IN (
    'OPEN', 'FREEZE_PENDING', 'FROZEN', 'INVENTORY',
    'AWAITING_EXTERNAL_DECISIONS', 'PARTIALLY_RESOLVED',
    'SUCCESSION_PENDING', 'RESOLVED', 'DISPUTED', 'SUPERSEDED', 'ABANDONED'
  )),
  CONSTRAINT "ActorResolutionCase_trigger_check" CHECK ("primaryTrigger" IN (
    'PLANNED_RETIREMENT', 'PRINCIPAL_LOSS', 'PRINCIPAL_INCAPACITY',
    'OPERATOR_DISSOLUTION', 'KEY_COMPROMISE', 'KEY_LOSS',
    'SECURITY_EMERGENCY', 'REGULATORY_OR_POLICY_BLOCK', 'RESOURCE_INSOLVENCY',
    'PROVIDER_FAILURE', 'CONTESTED_SUCCESSION', 'BEHAVIORAL_DISCONTINUITY', 'OTHER'
  )),
  CONSTRAINT "ActorResolutionCase_context_nonempty" CHECK (length(btrim("resolutionContext")) > 0),
  CONSTRAINT "ActorResolutionCase_opened_by_nonempty" CHECK (length(btrim("openedByType")) > 0),
  CONSTRAINT "ActorResolutionCase_policy_nonempty" CHECK (length(btrim("freezePolicyVersion")) > 0),
  CONSTRAINT "ActorResolutionCase_case_digest_shape" CHECK ("caseDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "ActorResolutionCase_freeze_order" CHECK ("frozenAt" IS NULL OR "frozenAt" >= "openedAt"),
  CONSTRAINT "ActorResolutionCase_resolve_order" CHECK ("resolvedAt" IS NULL OR "resolvedAt" >= "openedAt"),
  CONSTRAINT "ActorResolutionCase_resolved_fields" CHECK (
    ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "finalDisposition" IS NOT NULL) OR
    ("status" <> 'RESOLVED')
  ),
  CONSTRAINT "ActorResolutionCase_successor_distinct" CHECK ("successorActorId" IS NULL OR "successorActorId" <> "actorId")
);

CREATE UNIQUE INDEX "ActorResolutionCase_idempotencyKey_key"
  ON "ActorResolutionCase"("idempotencyKey");
CREATE UNIQUE INDEX "ActorResolutionCase_caseDigest_key"
  ON "ActorResolutionCase"("caseDigest");
CREATE INDEX "ActorResolutionCase_actor_idx"
  ON "ActorResolutionCase"("actorId", "openedAt" DESC);
CREATE INDEX "ActorResolutionCase_status_idx"
  ON "ActorResolutionCase"("status", "openedAt" DESC);
CREATE UNIQUE INDEX "ActorResolutionCase_one_live_case_per_actor"
  ON "ActorResolutionCase"("actorId")
  WHERE "status" NOT IN ('RESOLVED', 'SUPERSEDED', 'ABANDONED');

CREATE TABLE "ActorResolutionTransition" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT,
  "evidenceArtifactId" TEXT,
  "decidedByType" TEXT NOT NULL,
  "decidedByRef" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "transitionDigest" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActorResolutionTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActorResolutionTransition_to_status_check" CHECK ("toStatus" IN (
    'OPEN', 'FREEZE_PENDING', 'FROZEN', 'INVENTORY',
    'AWAITING_EXTERNAL_DECISIONS', 'PARTIALLY_RESOLVED',
    'SUCCESSION_PENDING', 'RESOLVED', 'DISPUTED', 'SUPERSEDED', 'ABANDONED'
  )),
  CONSTRAINT "ActorResolutionTransition_from_status_check" CHECK (
    "fromStatus" IS NULL OR "fromStatus" IN (
      'OPEN', 'FREEZE_PENDING', 'FROZEN', 'INVENTORY',
      'AWAITING_EXTERNAL_DECISIONS', 'PARTIALLY_RESOLVED',
      'SUCCESSION_PENDING', 'RESOLVED', 'DISPUTED', 'SUPERSEDED', 'ABANDONED'
    )
  ),
  CONSTRAINT "ActorResolutionTransition_decider_nonempty" CHECK (length(btrim("decidedByType")) > 0),
  CONSTRAINT "ActorResolutionTransition_digest_shape" CHECK ("transitionDigest" ~ '^sha256:[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "ActorResolutionTransition_idempotencyKey_key"
  ON "ActorResolutionTransition"("idempotencyKey");
CREATE UNIQUE INDEX "ActorResolutionTransition_digest_key"
  ON "ActorResolutionTransition"("transitionDigest");
CREATE INDEX "ActorResolutionTransition_case_time_idx"
  ON "ActorResolutionTransition"("caseId", "occurredAt");

CREATE TABLE "ActorResolutionItem" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "itemClass" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "externalPrincipalType" TEXT,
  "externalPrincipalRef" TEXT,
  "requiredAction" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "latestDecisionId" TEXT,
  "itemDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActorResolutionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActorResolutionItem_class_check" CHECK ("itemClass" IN (
    'AUTHORITY', 'CREDENTIAL', 'COMMITMENT', 'CLAIM', 'REMEDY',
    'EXTERNAL_STATE', 'DEPENDENCY', 'HOST_RELATIONSHIP', 'RELATIONSHIP',
    'AUDIENCE', 'RESOURCE', 'PENDING_WORK', 'EVIDENCE_RETENTION', 'OTHER'
  )),
  CONSTRAINT "ActorResolutionItem_status_check" CHECK ("status" IN (
    'PENDING', 'ACTION_REQUESTED', 'CONFIRMED', 'RESOLVED', 'DISPUTED', 'ORPHANED'
  )),
  CONSTRAINT "ActorResolutionItem_source_type_nonempty" CHECK (length(btrim("sourceType")) > 0),
  CONSTRAINT "ActorResolutionItem_source_ref_nonempty" CHECK (length(btrim("sourceRef")) > 0),
  CONSTRAINT "ActorResolutionItem_required_action_nonempty" CHECK (length(btrim("requiredAction")) > 0),
  CONSTRAINT "ActorResolutionItem_source_digest_shape" CHECK ("sourceDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "ActorResolutionItem_item_digest_shape" CHECK ("itemDigest" ~ '^sha256:[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "ActorResolutionItem_idempotencyKey_key"
  ON "ActorResolutionItem"("idempotencyKey");
CREATE UNIQUE INDEX "ActorResolutionItem_case_source_key"
  ON "ActorResolutionItem"("caseId", "sourceType", "sourceRef");
CREATE UNIQUE INDEX "ActorResolutionItem_case_digest_key"
  ON "ActorResolutionItem"("caseId", "itemDigest");
CREATE INDEX "ActorResolutionItem_case_status_idx"
  ON "ActorResolutionItem"("caseId", "status", "createdAt");
CREATE INDEX "ActorResolutionItem_principal_idx"
  ON "ActorResolutionItem"("externalPrincipalType", "externalPrincipalRef")
  WHERE "externalPrincipalType" IS NOT NULL;

CREATE TABLE "ActorResolutionItemDecision" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "successorActorId" TEXT,
  "evidenceArtifactId" TEXT,
  "externalPrincipalType" TEXT,
  "externalPrincipalRef" TEXT,
  "decidedByType" TEXT NOT NULL,
  "decidedByRef" TEXT,
  "reason" TEXT,
  "basisDigest" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActorResolutionItemDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActorResolutionItemDecision_disposition_check" CHECK ("disposition" IN (
    'REVOKE', 'FREEZE', 'CONTINUE_UNDER_PRINCIPAL', 'TRANSFER_TO_SUCCESSOR',
    'REISSUE_TO_SUCCESSOR', 'SETTLE', 'ESCROW_OR_HOLD', 'EXPIRE', 'TERMINATE',
    'ARCHIVE_ONLY', 'DISPUTE', 'ORPHAN', 'NO_ACTION_REQUIRED'
  )),
  CONSTRAINT "ActorResolutionItemDecision_successor_required" CHECK (
    "disposition" NOT IN ('TRANSFER_TO_SUCCESSOR', 'REISSUE_TO_SUCCESSOR') OR "successorActorId" IS NOT NULL
  ),
  CONSTRAINT "ActorResolutionItemDecision_decider_nonempty" CHECK (length(btrim("decidedByType")) > 0),
  CONSTRAINT "ActorResolutionItemDecision_basis_digest_shape" CHECK ("basisDigest" ~ '^sha256:[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "ActorResolutionItemDecision_idempotencyKey_key"
  ON "ActorResolutionItemDecision"("idempotencyKey");
CREATE UNIQUE INDEX "ActorResolutionItemDecision_basisDigest_key"
  ON "ActorResolutionItemDecision"("basisDigest");
CREATE INDEX "ActorResolutionItemDecision_item_time_idx"
  ON "ActorResolutionItemDecision"("itemId", "occurredAt");

ALTER TABLE "ActorResolutionCase"
  ADD CONSTRAINT "ActorResolutionCase_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorResolutionCase"
  ADD CONSTRAINT "ActorResolutionCase_successorActorId_fkey"
  FOREIGN KEY ("successorActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorResolutionCase"
  ADD CONSTRAINT "ActorResolutionCase_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActorResolutionTransition"
  ADD CONSTRAINT "ActorResolutionTransition_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "ActorResolutionCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActorResolutionTransition"
  ADD CONSTRAINT "ActorResolutionTransition_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActorResolutionItem"
  ADD CONSTRAINT "ActorResolutionItem_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "ActorResolutionCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActorResolutionItemDecision"
  ADD CONSTRAINT "ActorResolutionItemDecision_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "ActorResolutionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActorResolutionItemDecision"
  ADD CONSTRAINT "ActorResolutionItemDecision_successorActorId_fkey"
  FOREIGN KEY ("successorActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorResolutionItemDecision"
  ADD CONSTRAINT "ActorResolutionItemDecision_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- latestDecisionId is intentionally wired after the decision table exists.
ALTER TABLE "ActorResolutionItem"
  ADD CONSTRAINT "ActorResolutionItem_latestDecisionId_fkey"
  FOREIGN KEY ("latestDecisionId") REFERENCES "ActorResolutionItemDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep the projection pointer honest: the decision referenced as latest must
-- belong to this exact item.
CREATE OR REPLACE FUNCTION noeone_validate_resolution_latest_decision()
RETURNS trigger AS $$
DECLARE
  actual_item TEXT;
BEGIN
  IF NEW."latestDecisionId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "itemId" INTO actual_item
  FROM "ActorResolutionItemDecision"
  WHERE "id" = NEW."latestDecisionId";

  IF actual_item IS NULL OR actual_item <> NEW."id" THEN
    RAISE EXCEPTION 'resolution latest decision belongs to a different item';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActorResolutionItem_latest_decision_guard"
BEFORE INSERT OR UPDATE OF "latestDecisionId"
ON "ActorResolutionItem"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_resolution_latest_decision();

-- Once a case reaches a terminal state, no new resolution work or decisions
-- may be attached. This closes the race where a case could be marked resolved
-- and then receive a late unresolved item.
CREATE OR REPLACE FUNCTION noeone_guard_resolution_item_case_state()
RETURNS trigger AS $$
DECLARE
  case_status TEXT;
BEGIN
  SELECT "status" INTO case_status FROM "ActorResolutionCase" WHERE "id" = NEW."caseId" FOR SHARE;
  IF case_status IS NULL THEN
    RAISE EXCEPTION 'actor resolution case does not exist';
  END IF;
  IF case_status IN ('RESOLVED', 'SUPERSEDED', 'ABANDONED') THEN
    RAISE EXCEPTION 'cannot mutate resolution inventory for terminal case %', case_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActorResolutionItem_case_state_guard"
BEFORE INSERT OR UPDATE OF "caseId", "status", "latestDecisionId"
ON "ActorResolutionItem"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_resolution_item_case_state();

CREATE OR REPLACE FUNCTION noeone_guard_resolution_decision_case_state()
RETURNS trigger AS $$
DECLARE
  case_status TEXT;
BEGIN
  SELECT c."status" INTO case_status
  FROM "ActorResolutionCase" c
  JOIN "ActorResolutionItem" i ON i."caseId" = c."id"
  WHERE i."id" = NEW."itemId"
  FOR SHARE OF c;

  IF case_status IS NULL THEN
    RAISE EXCEPTION 'resolution item/case does not exist';
  END IF;
  IF case_status IN ('RESOLVED', 'SUPERSEDED', 'ABANDONED') THEN
    RAISE EXCEPTION 'cannot append decision to terminal resolution case %', case_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActorResolutionDecision_case_state_guard"
BEFORE INSERT
ON "ActorResolutionItemDecision"
FOR EACH ROW EXECUTE FUNCTION noeone_guard_resolution_decision_case_state();

-- Validate the transition log against the current projection. The opening
-- transition is the only transition allowed from NULL; later transitions must
-- start from the case's current status.
CREATE OR REPLACE FUNCTION noeone_validate_resolution_transition()
RETURNS trigger AS $$
DECLARE
  current_status TEXT;
BEGIN
  SELECT "status" INTO current_status
  FROM "ActorResolutionCase"
  WHERE "id" = NEW."caseId"
  FOR UPDATE;

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'actor resolution case does not exist';
  END IF;

  IF NEW."fromStatus" IS NULL THEN
    IF NEW."toStatus" <> 'OPEN' OR current_status <> 'OPEN' THEN
      RAISE EXCEPTION 'invalid actor resolution opening transition';
    END IF;
    RETURN NEW;
  END IF;

  IF current_status <> NEW."fromStatus" THEN
    RAISE EXCEPTION 'resolution transition source status mismatch: expected %, got %', current_status, NEW."fromStatus";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActorResolutionTransition_projection_guard"
BEFORE INSERT
ON "ActorResolutionTransition"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_resolution_transition();

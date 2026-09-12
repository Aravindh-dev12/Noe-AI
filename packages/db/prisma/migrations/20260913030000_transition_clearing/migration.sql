-- Transition clearing coordinates the external state that may be affected by a
-- single accepted actor migration or ancestry/fork edge. The clearing records
-- do not transfer rights themselves; they snapshot what must be reconciled and
-- bind each item to the decision of the external principal that owns/controls
-- that state.

CREATE TABLE "TransitionClearingCase" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "sourceActorId" TEXT NOT NULL,
  "continuityTransitionId" TEXT,
  "ancestryId" TEXT,
  "context" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "targetDigest" TEXT NOT NULL,
  "caseDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  "manifestDigest" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TransitionClearingCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransitionClearingCase_exactly_one_target" CHECK (
    (("continuityTransitionId" IS NOT NULL)::int + ("ancestryId" IS NOT NULL)::int) = 1
  ),
  CONSTRAINT "TransitionClearingCase_context_nonempty" CHECK (length(btrim("context")) > 0),
  CONSTRAINT "TransitionClearingCase_policy_nonempty" CHECK (length(btrim("policyVersion")) > 0),
  CONSTRAINT "TransitionClearingCase_target_digest_shape" CHECK ("targetDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "TransitionClearingCase_case_digest_shape" CHECK ("caseDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "TransitionClearingCase_manifest_digest_shape" CHECK (
    "manifestDigest" IS NULL OR "manifestDigest" ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT "TransitionClearingCase_close_pair" CHECK (
    ("closedAt" IS NULL AND "manifestDigest" IS NULL) OR
    ("closedAt" IS NOT NULL AND "manifestDigest" IS NOT NULL)
  ),
  CONSTRAINT "TransitionClearingCase_close_order" CHECK (
    "closedAt" IS NULL OR "closedAt" >= "openedAt"
  )
);

CREATE UNIQUE INDEX "TransitionClearingCase_idempotencyKey_key"
  ON "TransitionClearingCase"("idempotencyKey");
CREATE UNIQUE INDEX "TransitionClearingCase_caseDigest_key"
  ON "TransitionClearingCase"("caseDigest");
CREATE INDEX "TransitionClearingCase_actor_idx"
  ON "TransitionClearingCase"("actorId", "openedAt" DESC);
CREATE INDEX "TransitionClearingCase_source_actor_idx"
  ON "TransitionClearingCase"("sourceActorId", "openedAt" DESC);
CREATE INDEX "TransitionClearingCase_transition_idx"
  ON "TransitionClearingCase"("continuityTransitionId", "openedAt" DESC);
CREATE INDEX "TransitionClearingCase_ancestry_idx"
  ON "TransitionClearingCase"("ancestryId", "openedAt" DESC);

CREATE TABLE "TransitionClearingItem" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "stateClass" TEXT NOT NULL,
  "sourceStateType" TEXT NOT NULL,
  "sourceStateRef" TEXT NOT NULL,
  "sourceStateDigest" TEXT NOT NULL,
  "externalPrincipalType" TEXT NOT NULL,
  "externalPrincipalRef" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "acceptableDispositions" TEXT[] NOT NULL,
  "decisionId" TEXT,
  "itemDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TransitionClearingItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransitionClearingItem_stateClass" CHECK (
    "stateClass" IN ('RELATIONSHIP', 'INSTITUTIONAL_STATUS', 'DEONTIC', 'AUDIENCE')
  ),
  CONSTRAINT "TransitionClearingItem_state_type_nonempty" CHECK (length(btrim("sourceStateType")) > 0),
  CONSTRAINT "TransitionClearingItem_state_ref_nonempty" CHECK (length(btrim("sourceStateRef")) > 0),
  CONSTRAINT "TransitionClearingItem_principal_type_nonempty" CHECK (length(btrim("externalPrincipalType")) > 0),
  CONSTRAINT "TransitionClearingItem_principal_ref_nonempty" CHECK (length(btrim("externalPrincipalRef")) > 0),
  CONSTRAINT "TransitionClearingItem_context_nonempty" CHECK (length(btrim("context")) > 0),
  CONSTRAINT "TransitionClearingItem_source_digest_shape" CHECK ("sourceStateDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "TransitionClearingItem_item_digest_shape" CHECK ("itemDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "TransitionClearingItem_acceptable_nonempty" CHECK (cardinality("acceptableDispositions") > 0),
  CONSTRAINT "TransitionClearingItem_acceptable_values" CHECK (
    "acceptableDispositions" <@ ARRAY['CONTINUED', 'CONDITIONAL', 'REISSUED', 'REJECTED', 'TERMINATED', 'DISPUTED']::TEXT[]
  )
);

CREATE UNIQUE INDEX "TransitionClearingItem_idempotencyKey_key"
  ON "TransitionClearingItem"("idempotencyKey");
CREATE UNIQUE INDEX "TransitionClearingItem_case_itemDigest_key"
  ON "TransitionClearingItem"("caseId", "itemDigest");
CREATE INDEX "TransitionClearingItem_case_idx"
  ON "TransitionClearingItem"("caseId", "required", "createdAt");
CREATE INDEX "TransitionClearingItem_principal_idx"
  ON "TransitionClearingItem"("externalPrincipalType", "externalPrincipalRef");
CREATE INDEX "TransitionClearingItem_decision_idx"
  ON "TransitionClearingItem"("decisionId");

ALTER TABLE "TransitionClearingCase"
  ADD CONSTRAINT "TransitionClearingCase_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransitionClearingCase"
  ADD CONSTRAINT "TransitionClearingCase_sourceActorId_fkey"
  FOREIGN KEY ("sourceActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransitionClearingCase"
  ADD CONSTRAINT "TransitionClearingCase_transition_fkey"
  FOREIGN KEY ("continuityTransitionId") REFERENCES "ContinuityTransition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransitionClearingCase"
  ADD CONSTRAINT "TransitionClearingCase_ancestry_fkey"
  FOREIGN KEY ("ancestryId") REFERENCES "ActorAncestry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransitionClearingItem"
  ADD CONSTRAINT "TransitionClearingItem_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "TransitionClearingCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransitionClearingItem"
  ADD CONSTRAINT "TransitionClearingItem_decisionId_fkey"
  FOREIGN KEY ("decisionId") REFERENCES "ExternalStateContinuationDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_transition_clearing_case()
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
      RAISE EXCEPTION 'transition clearing target does not exist';
    END IF;
    IF transition_status <> 'ACCEPTED' THEN
      RAISE EXCEPTION 'transition clearing requires an accepted continuity transition';
    END IF;
    IF transition_actor <> NEW."actorId" OR transition_actor <> NEW."sourceActorId" THEN
      RAISE EXCEPTION 'migration clearing actor/source actor mismatch';
    END IF;
  ELSE
    SELECT "childActorId", "parentActorId" INTO ancestry_child, ancestry_parent
    FROM "ActorAncestry"
    WHERE "id" = NEW."ancestryId";

    IF ancestry_child IS NULL THEN
      RAISE EXCEPTION 'transition clearing ancestry does not exist';
    END IF;
    IF ancestry_child <> NEW."actorId" OR ancestry_parent <> NEW."sourceActorId" THEN
      RAISE EXCEPTION 'fork clearing actor/source actor mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransitionClearingCase_context_guard"
BEFORE INSERT OR UPDATE OF "actorId", "sourceActorId", "continuityTransitionId", "ancestryId"
ON "TransitionClearingCase"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_transition_clearing_case();

CREATE OR REPLACE FUNCTION noeone_validate_transition_clearing_decision()
RETURNS trigger AS $$
DECLARE
  case_actor TEXT;
  case_source_actor TEXT;
  case_transition TEXT;
  case_ancestry TEXT;
  decision_actor TEXT;
  decision_source_actor TEXT;
  decision_transition TEXT;
  decision_ancestry TEXT;
  decision_state_class TEXT;
  decision_state_type TEXT;
  decision_state_ref TEXT;
  decision_state_digest TEXT;
  decision_principal_type TEXT;
  decision_principal_ref TEXT;
  decision_context TEXT;
BEGIN
  IF NEW."decisionId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "actorId", "sourceActorId", "continuityTransitionId", "ancestryId"
    INTO case_actor, case_source_actor, case_transition, case_ancestry
  FROM "TransitionClearingCase" WHERE "id" = NEW."caseId";

  SELECT "actorId", "sourceActorId", "continuityTransitionId", "ancestryId",
         "stateClass", "sourceStateType", "sourceStateRef", "sourceStateDigest",
         "externalPrincipalType", "externalPrincipalRef", "context"
    INTO decision_actor, decision_source_actor, decision_transition, decision_ancestry,
         decision_state_class, decision_state_type, decision_state_ref, decision_state_digest,
         decision_principal_type, decision_principal_ref, decision_context
  FROM "ExternalStateContinuationDecision" WHERE "id" = NEW."decisionId";

  IF decision_actor IS NULL THEN
    RAISE EXCEPTION 'transition clearing decision does not exist';
  END IF;

  IF decision_actor <> case_actor OR decision_source_actor <> case_source_actor OR
     decision_transition IS DISTINCT FROM case_transition OR
     decision_ancestry IS DISTINCT FROM case_ancestry THEN
    RAISE EXCEPTION 'transition clearing decision target mismatch';
  END IF;

  IF decision_state_class <> NEW."stateClass" OR
     decision_state_type <> NEW."sourceStateType" OR
     decision_state_ref <> NEW."sourceStateRef" OR
     decision_state_digest <> NEW."sourceStateDigest" OR
     decision_principal_type <> NEW."externalPrincipalType" OR
     decision_principal_ref <> NEW."externalPrincipalRef" OR
     decision_context <> NEW."context" THEN
    RAISE EXCEPTION 'transition clearing decision does not match reconciliation item';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransitionClearingItem_decision_guard"
BEFORE INSERT OR UPDATE OF "caseId", "decisionId", "stateClass", "sourceStateType",
  "sourceStateRef", "sourceStateDigest", "externalPrincipalType", "externalPrincipalRef", "context"
ON "TransitionClearingItem"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_transition_clearing_decision();

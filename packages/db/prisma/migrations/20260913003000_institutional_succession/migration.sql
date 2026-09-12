-- Institutional succession sits downstream from actor continuity and recognition.
-- Recognition never transfers institutional state by itself. These tables record
-- explicit evidence, required parties, consent, object-level transfer semantics,
-- residual predecessor liability, and resulting-object provenance.

CREATE TABLE "InstitutionalSuccessionAgreement" (
  "id" TEXT NOT NULL,
  "predecessorActorId" TEXT NOT NULL,
  "successorActorId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "successionKind" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "policyFramework" TEXT,
  "policyVersion" TEXT NOT NULL,
  "legalContextSnapshotId" TEXT,
  "sourceEvidenceArtifactId" TEXT NOT NULL,
  "recognitionAssessmentId" TEXT,
  "proposedAt" TIMESTAMP(3) NOT NULL,
  "effectiveAt" TIMESTAMP(3),
  "agreementDigest" TEXT NOT NULL,
  "activationBasis" JSONB,
  "activationBasisDigest" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InstitutionalSuccessionAgreement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstitutionalSuccessionAgreement_distinct_actors" CHECK ("predecessorActorId" <> "successorActorId"),
  CONSTRAINT "InstitutionalSuccessionAgreement_status" CHECK ("status" IN ('PROPOSED', 'EFFECTIVE', 'REJECTED', 'SUPERSEDED')),
  CONSTRAINT "InstitutionalSuccessionAgreement_kind" CHECK ("successionKind" IN ('NOVATION', 'ASSIGNMENT', 'REAUTHORIZATION', 'MIXED')),
  CONSTRAINT "InstitutionalSuccessionAgreement_context_nonempty" CHECK (length(btrim("context")) > 0),
  CONSTRAINT "InstitutionalSuccessionAgreement_policy_nonempty" CHECK (length(btrim("policyVersion")) > 0),
  CONSTRAINT "InstitutionalSuccessionAgreement_digest_shape" CHECK ("agreementDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "InstitutionalSuccessionAgreement_activation_digest_shape" CHECK ("activationBasisDigest" IS NULL OR "activationBasisDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "InstitutionalSuccessionAgreement_effective_state" CHECK (
    ("status" = 'EFFECTIVE' AND "effectiveAt" IS NOT NULL AND "activationBasis" IS NOT NULL AND "activationBasisDigest" IS NOT NULL)
    OR
    ("status" <> 'EFFECTIVE' AND "effectiveAt" IS NULL AND "activationBasis" IS NULL AND "activationBasisDigest" IS NULL)
  )
);

CREATE UNIQUE INDEX "InstitutionalSuccessionAgreement_idempotencyKey_key"
  ON "InstitutionalSuccessionAgreement"("idempotencyKey");
CREATE UNIQUE INDEX "InstitutionalSuccessionAgreement_agreementDigest_key"
  ON "InstitutionalSuccessionAgreement"("agreementDigest");
CREATE INDEX "InstitutionalSuccessionAgreement_predecessor_idx"
  ON "InstitutionalSuccessionAgreement"("predecessorActorId", "status", "proposedAt" DESC);
CREATE INDEX "InstitutionalSuccessionAgreement_successor_idx"
  ON "InstitutionalSuccessionAgreement"("successorActorId", "status", "proposedAt" DESC);
CREATE INDEX "InstitutionalSuccessionAgreement_context_idx"
  ON "InstitutionalSuccessionAgreement"("context", "status", "proposedAt" DESC);
CREATE INDEX "InstitutionalSuccessionAgreement_evidence_idx"
  ON "InstitutionalSuccessionAgreement"("sourceEvidenceArtifactId");

ALTER TABLE "InstitutionalSuccessionAgreement"
  ADD CONSTRAINT "InstitutionalSuccessionAgreement_predecessor_fkey"
  FOREIGN KEY ("predecessorActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalSuccessionAgreement"
  ADD CONSTRAINT "InstitutionalSuccessionAgreement_successor_fkey"
  FOREIGN KEY ("successorActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalSuccessionAgreement"
  ADD CONSTRAINT "InstitutionalSuccessionAgreement_legal_context_fkey"
  FOREIGN KEY ("legalContextSnapshotId") REFERENCES "LegalContextSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalSuccessionAgreement"
  ADD CONSTRAINT "InstitutionalSuccessionAgreement_evidence_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalSuccessionAgreement"
  ADD CONSTRAINT "InstitutionalSuccessionAgreement_recognition_fkey"
  FOREIGN KEY ("recognitionAssessmentId") REFERENCES "ContinuityRecognitionAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InstitutionalSuccessionParty" (
  "id" TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "principalType" TEXT NOT NULL,
  "principalRef" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InstitutionalSuccessionParty_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstitutionalSuccessionParty_role" CHECK ("role" IN ('PREDECESSOR', 'SUCCESSOR', 'COUNTERPARTY', 'AUTHORITY_ISSUER', 'ADJUDICATOR')),
  CONSTRAINT "InstitutionalSuccessionParty_type_nonempty" CHECK (length(btrim("principalType")) > 0),
  CONSTRAINT "InstitutionalSuccessionParty_ref_nonempty" CHECK (length(btrim("principalRef")) > 0)
);

CREATE UNIQUE INDEX "InstitutionalSuccessionParty_identity_key"
  ON "InstitutionalSuccessionParty"("agreementId", "role", "principalType", "principalRef");
CREATE INDEX "InstitutionalSuccessionParty_agreement_required_idx"
  ON "InstitutionalSuccessionParty"("agreementId", "required");

ALTER TABLE "InstitutionalSuccessionParty"
  ADD CONSTRAINT "InstitutionalSuccessionParty_agreement_fkey"
  FOREIGN KEY ("agreementId") REFERENCES "InstitutionalSuccessionAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InstitutionalSuccessionConsent" (
  "id" TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "evidenceArtifactId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "methodVersion" TEXT NOT NULL,
  "assessedAt" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3),
  "conditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InstitutionalSuccessionConsent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstitutionalSuccessionConsent_disposition" CHECK ("disposition" IN ('CONSENTED', 'CONDITIONAL', 'REJECTED')),
  CONSTRAINT "InstitutionalSuccessionConsent_method_nonempty" CHECK (length(btrim("method")) > 0),
  CONSTRAINT "InstitutionalSuccessionConsent_method_version_nonempty" CHECK (length(btrim("methodVersion")) > 0),
  CONSTRAINT "InstitutionalSuccessionConsent_basis_digest_shape" CHECK ("basisDigest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "InstitutionalSuccessionConsent_time_order" CHECK ("validUntil" IS NULL OR "validUntil" > "assessedAt")
);

CREATE UNIQUE INDEX "InstitutionalSuccessionConsent_idempotencyKey_key"
  ON "InstitutionalSuccessionConsent"("idempotencyKey");
CREATE UNIQUE INDEX "InstitutionalSuccessionConsent_basisDigest_key"
  ON "InstitutionalSuccessionConsent"("basisDigest");
CREATE INDEX "InstitutionalSuccessionConsent_party_idx"
  ON "InstitutionalSuccessionConsent"("partyId", "assessedAt" DESC);
CREATE INDEX "InstitutionalSuccessionConsent_agreement_idx"
  ON "InstitutionalSuccessionConsent"("agreementId", "assessedAt" DESC);
CREATE INDEX "InstitutionalSuccessionConsent_evidence_idx"
  ON "InstitutionalSuccessionConsent"("evidenceArtifactId");

ALTER TABLE "InstitutionalSuccessionConsent"
  ADD CONSTRAINT "InstitutionalSuccessionConsent_agreement_fkey"
  FOREIGN KEY ("agreementId") REFERENCES "InstitutionalSuccessionAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstitutionalSuccessionConsent"
  ADD CONSTRAINT "InstitutionalSuccessionConsent_party_fkey"
  FOREIGN KEY ("partyId") REFERENCES "InstitutionalSuccessionParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalSuccessionConsent"
  ADD CONSTRAINT "InstitutionalSuccessionConsent_evidence_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InstitutionalSuccessionItem" (
  "id" TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "itemType" TEXT NOT NULL,
  "sourceCommitmentId" TEXT,
  "sourceAuthorityGrantId" TEXT,
  "requestedAuthorityGrantId" TEXT,
  "resultingCommitmentId" TEXT,
  "resultingAuthorityGrantId" TEXT,
  "predecessorLiabilityMode" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "itemDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InstitutionalSuccessionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InstitutionalSuccessionItem_type" CHECK ("itemType" IN ('DEBTOR_NOVATION', 'CREDITOR_ASSIGNMENT', 'AUTHORITY_REISSUANCE')),
  CONSTRAINT "InstitutionalSuccessionItem_status" CHECK ("status" IN ('PENDING', 'EFFECTIVE', 'REJECTED')),
  CONSTRAINT "InstitutionalSuccessionItem_liability" CHECK ("predecessorLiabilityMode" IN ('RELEASED', 'RETAINED_SECONDARY', 'GUARANTOR', 'NOT_APPLICABLE')),
  CONSTRAINT "InstitutionalSuccessionItem_source_shape" CHECK (
    ("itemType" IN ('DEBTOR_NOVATION', 'CREDITOR_ASSIGNMENT') AND "sourceCommitmentId" IS NOT NULL AND "sourceAuthorityGrantId" IS NULL AND "requestedAuthorityGrantId" IS NULL)
    OR
    ("itemType" = 'AUTHORITY_REISSUANCE' AND "sourceCommitmentId" IS NULL AND "sourceAuthorityGrantId" IS NOT NULL AND "requestedAuthorityGrantId" IS NOT NULL)
  ),
  CONSTRAINT "InstitutionalSuccessionItem_liability_shape" CHECK (
    ("itemType" = 'DEBTOR_NOVATION' AND "predecessorLiabilityMode" IN ('RELEASED', 'RETAINED_SECONDARY', 'GUARANTOR'))
    OR
    ("itemType" <> 'DEBTOR_NOVATION' AND "predecessorLiabilityMode" = 'NOT_APPLICABLE')
  ),
  CONSTRAINT "InstitutionalSuccessionItem_result_shape" CHECK (
    ("status" = 'EFFECTIVE' AND "effectiveAt" IS NOT NULL AND (
      ("itemType" IN ('DEBTOR_NOVATION', 'CREDITOR_ASSIGNMENT') AND "resultingCommitmentId" IS NOT NULL AND "resultingAuthorityGrantId" IS NULL)
      OR
      ("itemType" = 'AUTHORITY_REISSUANCE' AND "resultingCommitmentId" IS NULL AND "resultingAuthorityGrantId" IS NOT NULL)
    ))
    OR
    ("status" <> 'EFFECTIVE' AND "effectiveAt" IS NULL AND "resultingCommitmentId" IS NULL AND "resultingAuthorityGrantId" IS NULL)
  ),
  CONSTRAINT "InstitutionalSuccessionItem_digest_shape" CHECK ("itemDigest" ~ '^sha256:[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "InstitutionalSuccessionItem_idempotencyKey_key"
  ON "InstitutionalSuccessionItem"("idempotencyKey");
CREATE UNIQUE INDEX "InstitutionalSuccessionItem_itemDigest_key"
  ON "InstitutionalSuccessionItem"("itemDigest");
CREATE INDEX "InstitutionalSuccessionItem_agreement_idx"
  ON "InstitutionalSuccessionItem"("agreementId", "status", "createdAt");
CREATE INDEX "InstitutionalSuccessionItem_source_commitment_idx"
  ON "InstitutionalSuccessionItem"("sourceCommitmentId");
CREATE INDEX "InstitutionalSuccessionItem_source_authority_idx"
  ON "InstitutionalSuccessionItem"("sourceAuthorityGrantId");
CREATE INDEX "InstitutionalSuccessionItem_result_commitment_idx"
  ON "InstitutionalSuccessionItem"("resultingCommitmentId");
CREATE INDEX "InstitutionalSuccessionItem_result_authority_idx"
  ON "InstitutionalSuccessionItem"("resultingAuthorityGrantId");

ALTER TABLE "InstitutionalSuccessionItem"
  ADD CONSTRAINT "InstitutionalSuccessionItem_agreement_fkey"
  FOREIGN KEY ("agreementId") REFERENCES "InstitutionalSuccessionAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstitutionalSuccessionItem"
  ADD CONSTRAINT "InstitutionalSuccessionItem_source_commitment_fkey"
  FOREIGN KEY ("sourceCommitmentId") REFERENCES "Commitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalSuccessionItem"
  ADD CONSTRAINT "InstitutionalSuccessionItem_source_authority_fkey"
  FOREIGN KEY ("sourceAuthorityGrantId") REFERENCES "AuthorityGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalSuccessionItem"
  ADD CONSTRAINT "InstitutionalSuccessionItem_requested_authority_fkey"
  FOREIGN KEY ("requestedAuthorityGrantId") REFERENCES "AuthorityGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalSuccessionItem"
  ADD CONSTRAINT "InstitutionalSuccessionItem_result_commitment_fkey"
  FOREIGN KEY ("resultingCommitmentId") REFERENCES "Commitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstitutionalSuccessionItem"
  ADD CONSTRAINT "InstitutionalSuccessionItem_result_authority_fkey"
  FOREIGN KEY ("resultingAuthorityGrantId") REFERENCES "AuthorityGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION noeone_validate_succession_consent_party()
RETURNS trigger AS $$
DECLARE
  party_agreement TEXT;
BEGIN
  SELECT "agreementId" INTO party_agreement
  FROM "InstitutionalSuccessionParty"
  WHERE "id" = NEW."partyId";

  IF party_agreement IS NULL THEN
    RAISE EXCEPTION 'succession consent party does not exist';
  END IF;
  IF party_agreement <> NEW."agreementId" THEN
    RAISE EXCEPTION 'succession consent party belongs to another agreement';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InstitutionalSuccessionConsent_party_guard"
BEFORE INSERT OR UPDATE OF "agreementId", "partyId"
ON "InstitutionalSuccessionConsent"
FOR EACH ROW EXECUTE FUNCTION noeone_validate_succession_consent_party();

CREATE OR REPLACE FUNCTION noeone_touch_succession_agreement()
RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InstitutionalSuccessionAgreement_touch"
BEFORE UPDATE ON "InstitutionalSuccessionAgreement"
FOR EACH ROW EXECUTE FUNCTION noeone_touch_succession_agreement();
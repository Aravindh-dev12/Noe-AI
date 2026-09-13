-- Backfill the claims/adjudication schema introduced in PR #13.
-- The Prisma models were merged without a committed migration; actor resolution
-- legitimately depends on these tables when inventorying unresolved claims/remedies.

CREATE TYPE "ClaimStatus" AS ENUM (
  'FILED',
  'RESPONDED',
  'UNDER_REVIEW',
  'ADJUDICATED',
  'SETTLED',
  'DISMISSED',
  'WITHDRAWN'
);

CREATE TYPE "ClaimPartyRole" AS ENUM (
  'CLAIMANT',
  'RESPONDENT',
  'INTERESTED'
);

CREATE TYPE "ClaimActorRole" AS ENUM (
  'EXECUTOR',
  'DELEGATE',
  'SUBJECT',
  'COUNTERPARTY_AGENT',
  'WITNESS'
);

CREATE TYPE "AdjudicationDisposition" AS ENUM (
  'GRANTED',
  'PARTIALLY_GRANTED',
  'DENIED',
  'DISMISSED',
  'NO_JURISDICTION'
);

CREATE TYPE "RemedyStatus" AS ENUM (
  'ORDERED',
  'SATISFIED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "LegalContextSnapshot" (
  "id" TEXT NOT NULL,
  "framework" TEXT NOT NULL,
  "termsDigest" TEXT NOT NULL,
  "termsUri" TEXT,
  "disputeClauseDigest" TEXT,
  "method" TEXT,
  "jurisdiction" TEXT,
  "forumRef" TEXT,
  "acceptanceEvidenceArtifactId" TEXT,
  "sourceEvidenceArtifactId" TEXT,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contextDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "LegalContextSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Claim" (
  "id" TEXT NOT NULL,
  "claimType" TEXT NOT NULL,
  "status" "ClaimStatus" NOT NULL DEFAULT 'FILED',
  "consequenceId" TEXT,
  "commitmentId" TEXT,
  "authorityExerciseId" TEXT,
  "legalContextSnapshotId" TEXT,
  "statementEvidenceArtifactId" TEXT NOT NULL,
  "claimDigest" TEXT NOT NULL,
  "amountMinor" TEXT,
  "currency" TEXT,
  "externalFramework" TEXT,
  "externalReference" TEXT,
  "appealOfClaimId" TEXT,
  "filedAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClaimParty" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "role" "ClaimPartyRole" NOT NULL,
  "principalType" TEXT NOT NULL,
  "principalRef" TEXT NOT NULL,
  "identityEvidenceArtifactId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "ClaimParty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClaimActorLink" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "role" "ClaimActorRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "ClaimActorLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClaimEvidenceBinding" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "evidenceArtifactId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "submittedByPartyId" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "ClaimEvidenceBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClaimTransition" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "fromStatus" "ClaimStatus",
  "toStatus" "ClaimStatus" NOT NULL,
  "evidenceArtifactId" TEXT,
  "decidedByType" TEXT NOT NULL,
  "decidedByRef" TEXT,
  "reason" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "ClaimTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdjudicationDecision" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "disposition" "AdjudicationDisposition" NOT NULL,
  "adjudicatorType" TEXT NOT NULL,
  "adjudicatorRef" TEXT NOT NULL,
  "decisionEvidenceArtifactId" TEXT NOT NULL,
  "decisionDigest" TEXT NOT NULL,
  "legalContextSnapshotId" TEXT,
  "decidedAt" TIMESTAMP(3) NOT NULL,
  "externalFramework" TEXT,
  "externalReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdjudicationDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RemedyOrder" (
  "id" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "decisionId" TEXT,
  "kind" TEXT NOT NULL,
  "obligorPrincipalPartyId" TEXT NOT NULL,
  "beneficiaryPrincipalPartyId" TEXT NOT NULL,
  "amountMinor" TEXT,
  "currency" TEXT,
  "termsDigest" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "status" "RemedyStatus" NOT NULL DEFAULT 'ORDERED',
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RemedyOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RemedyTransition" (
  "id" TEXT NOT NULL,
  "remedyId" TEXT NOT NULL,
  "fromStatus" "RemedyStatus",
  "toStatus" "RemedyStatus" NOT NULL,
  "evidenceArtifactId" TEXT,
  "decidedByType" TEXT NOT NULL,
  "decidedByRef" TEXT,
  "reason" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "RemedyTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegalContextSnapshot_idempotencyKey_key" ON "LegalContextSnapshot"("idempotencyKey");
CREATE INDEX "LegalContextSnapshot_framework_effectiveAt_idx" ON "LegalContextSnapshot"("framework", "effectiveAt");
CREATE INDEX "LegalContextSnapshot_termsDigest_idx" ON "LegalContextSnapshot"("termsDigest");
CREATE INDEX "LegalContextSnapshot_disputeClauseDigest_idx" ON "LegalContextSnapshot"("disputeClauseDigest");
CREATE INDEX "LegalContextSnapshot_forumRef_idx" ON "LegalContextSnapshot"("forumRef");

CREATE UNIQUE INDEX "Claim_idempotencyKey_key" ON "Claim"("idempotencyKey");
CREATE INDEX "Claim_status_filedAt_idx" ON "Claim"("status", "filedAt");
CREATE INDEX "Claim_consequenceId_idx" ON "Claim"("consequenceId");
CREATE INDEX "Claim_commitmentId_idx" ON "Claim"("commitmentId");
CREATE INDEX "Claim_authorityExerciseId_idx" ON "Claim"("authorityExerciseId");
CREATE INDEX "Claim_legalContextSnapshotId_idx" ON "Claim"("legalContextSnapshotId");
CREATE INDEX "Claim_appealOfClaimId_idx" ON "Claim"("appealOfClaimId");
CREATE INDEX "Claim_externalFramework_externalReference_idx" ON "Claim"("externalFramework", "externalReference");

CREATE UNIQUE INDEX "ClaimParty_claimId_role_principalType_principalRef_key" ON "ClaimParty"("claimId", "role", "principalType", "principalRef");
CREATE INDEX "ClaimParty_principalType_principalRef_idx" ON "ClaimParty"("principalType", "principalRef");
CREATE INDEX "ClaimParty_identityEvidenceArtifactId_idx" ON "ClaimParty"("identityEvidenceArtifactId");

CREATE UNIQUE INDEX "ClaimActorLink_claimId_actorId_role_key" ON "ClaimActorLink"("claimId", "actorId", "role");
CREATE INDEX "ClaimActorLink_actorId_createdAt_idx" ON "ClaimActorLink"("actorId", "createdAt");

CREATE UNIQUE INDEX "ClaimEvidenceBinding_idempotencyKey_key" ON "ClaimEvidenceBinding"("idempotencyKey");
CREATE INDEX "ClaimEvidenceBinding_claimId_submittedAt_idx" ON "ClaimEvidenceBinding"("claimId", "submittedAt");
CREATE INDEX "ClaimEvidenceBinding_evidenceArtifactId_idx" ON "ClaimEvidenceBinding"("evidenceArtifactId");
CREATE INDEX "ClaimEvidenceBinding_submittedByPartyId_idx" ON "ClaimEvidenceBinding"("submittedByPartyId");

CREATE UNIQUE INDEX "ClaimTransition_idempotencyKey_key" ON "ClaimTransition"("idempotencyKey");
CREATE INDEX "ClaimTransition_claimId_occurredAt_idx" ON "ClaimTransition"("claimId", "occurredAt");
CREATE INDEX "ClaimTransition_evidenceArtifactId_idx" ON "ClaimTransition"("evidenceArtifactId");

CREATE UNIQUE INDEX "AdjudicationDecision_idempotencyKey_key" ON "AdjudicationDecision"("idempotencyKey");
CREATE INDEX "AdjudicationDecision_claimId_decidedAt_idx" ON "AdjudicationDecision"("claimId", "decidedAt");
CREATE INDEX "AdjudicationDecision_adjudicatorType_adjudicatorRef_idx" ON "AdjudicationDecision"("adjudicatorType", "adjudicatorRef");
CREATE INDEX "AdjudicationDecision_decisionEvidenceArtifactId_idx" ON "AdjudicationDecision"("decisionEvidenceArtifactId");
CREATE INDEX "AdjudicationDecision_externalFramework_externalReference_idx" ON "AdjudicationDecision"("externalFramework", "externalReference");

CREATE UNIQUE INDEX "RemedyOrder_idempotencyKey_key" ON "RemedyOrder"("idempotencyKey");
CREATE INDEX "RemedyOrder_claimId_status_dueAt_idx" ON "RemedyOrder"("claimId", "status", "dueAt");
CREATE INDEX "RemedyOrder_decisionId_idx" ON "RemedyOrder"("decisionId");
CREATE INDEX "RemedyOrder_obligorPrincipalPartyId_idx" ON "RemedyOrder"("obligorPrincipalPartyId");
CREATE INDEX "RemedyOrder_beneficiaryPrincipalPartyId_idx" ON "RemedyOrder"("beneficiaryPrincipalPartyId");

CREATE UNIQUE INDEX "RemedyTransition_idempotencyKey_key" ON "RemedyTransition"("idempotencyKey");
CREATE INDEX "RemedyTransition_remedyId_occurredAt_idx" ON "RemedyTransition"("remedyId", "occurredAt");
CREATE INDEX "RemedyTransition_evidenceArtifactId_idx" ON "RemedyTransition"("evidenceArtifactId");

ALTER TABLE "LegalContextSnapshot" ADD CONSTRAINT "LegalContextSnapshot_acceptanceEvidenceArtifactId_fkey"
  FOREIGN KEY ("acceptanceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegalContextSnapshot" ADD CONSTRAINT "LegalContextSnapshot_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Claim" ADD CONSTRAINT "Claim_consequenceId_fkey"
  FOREIGN KEY ("consequenceId") REFERENCES "ConsequenceObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_commitmentId_fkey"
  FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_authorityExerciseId_fkey"
  FOREIGN KEY ("authorityExerciseId") REFERENCES "AuthorityExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_legalContextSnapshotId_fkey"
  FOREIGN KEY ("legalContextSnapshotId") REFERENCES "LegalContextSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_statementEvidenceArtifactId_fkey"
  FOREIGN KEY ("statementEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_appealOfClaimId_fkey"
  FOREIGN KEY ("appealOfClaimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimParty" ADD CONSTRAINT "ClaimParty_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimParty" ADD CONSTRAINT "ClaimParty_identityEvidenceArtifactId_fkey"
  FOREIGN KEY ("identityEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimActorLink" ADD CONSTRAINT "ClaimActorLink_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimActorLink" ADD CONSTRAINT "ClaimActorLink_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimEvidenceBinding" ADD CONSTRAINT "ClaimEvidenceBinding_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimEvidenceBinding" ADD CONSTRAINT "ClaimEvidenceBinding_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClaimEvidenceBinding" ADD CONSTRAINT "ClaimEvidenceBinding_submittedByPartyId_fkey"
  FOREIGN KEY ("submittedByPartyId") REFERENCES "ClaimParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimTransition" ADD CONSTRAINT "ClaimTransition_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimTransition" ADD CONSTRAINT "ClaimTransition_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdjudicationDecision" ADD CONSTRAINT "AdjudicationDecision_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdjudicationDecision" ADD CONSTRAINT "AdjudicationDecision_decisionEvidenceArtifactId_fkey"
  FOREIGN KEY ("decisionEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdjudicationDecision" ADD CONSTRAINT "AdjudicationDecision_legalContextSnapshotId_fkey"
  FOREIGN KEY ("legalContextSnapshotId") REFERENCES "LegalContextSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RemedyOrder" ADD CONSTRAINT "RemedyOrder_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RemedyOrder" ADD CONSTRAINT "RemedyOrder_decisionId_fkey"
  FOREIGN KEY ("decisionId") REFERENCES "AdjudicationDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RemedyOrder" ADD CONSTRAINT "RemedyOrder_obligorPrincipalPartyId_fkey"
  FOREIGN KEY ("obligorPrincipalPartyId") REFERENCES "ClaimParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RemedyOrder" ADD CONSTRAINT "RemedyOrder_beneficiaryPrincipalPartyId_fkey"
  FOREIGN KEY ("beneficiaryPrincipalPartyId") REFERENCES "ClaimParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RemedyTransition" ADD CONSTRAINT "RemedyTransition_remedyId_fkey"
  FOREIGN KEY ("remedyId") REFERENCES "RemedyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemedyTransition" ADD CONSTRAINT "RemedyTransition_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

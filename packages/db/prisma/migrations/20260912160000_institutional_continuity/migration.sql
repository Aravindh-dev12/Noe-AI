-- Institutional continuity separates evidence integrity from obligation state.
-- Commitments attach to persistent actor IDs rather than transient executions so
-- governed migrations preserve obligations while forks remain separate actors.

CREATE TYPE "EvidenceVerificationStatus" AS ENUM ('CLAIMED', 'VERIFIED', 'REJECTED', 'REVOKED');
CREATE TYPE "CommitmentStatus" AS ENUM ('OPEN', 'FULFILLED', 'BREACHED', 'CANCELLED', 'DISPUTED');

CREATE TABLE "EvidenceRef" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "externalId" TEXT,
  "uri" TEXT,
  "digest" TEXT NOT NULL,
  "digestAlgorithm" TEXT NOT NULL DEFAULT 'sha256',
  "verificationStatus" "EvidenceVerificationStatus" NOT NULL DEFAULT 'CLAIMED',
  "observedAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EvidenceRef_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Commitment" (
  "id" TEXT NOT NULL,
  "debtorActorId" TEXT NOT NULL,
  "creditorActorId" TEXT,
  "creditorExternalRef" TEXT,
  "kind" TEXT NOT NULL,
  "status" "CommitmentStatus" NOT NULL DEFAULT 'OPEN',
  "termsDigest" TEXT NOT NULL,
  "termsUri" TEXT,
  "sourceEvidenceId" TEXT,
  "externalFramework" TEXT,
  "externalReference" TEXT,
  "dueAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "createdByType" TEXT NOT NULL,
  "createdById" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Commitment_creditor_required" CHECK (
    "creditorActorId" IS NOT NULL OR "creditorExternalRef" IS NOT NULL
  ),
  CONSTRAINT "Commitment_distinct_actor_counterparties" CHECK (
    "creditorActorId" IS NULL OR "creditorActorId" <> "debtorActorId"
  )
);

CREATE TABLE "CommitmentTransition" (
  "id" TEXT NOT NULL,
  "commitmentId" TEXT NOT NULL,
  "fromStatus" "CommitmentStatus",
  "toStatus" "CommitmentStatus" NOT NULL,
  "evidenceRefId" TEXT,
  "reason" TEXT,
  "decidedByType" TEXT NOT NULL,
  "decidedById" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT "CommitmentTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvidenceRef_issuer_digest_key"
  ON "EvidenceRef"("issuer", "digest");
CREATE INDEX "EvidenceRef_actorId_observedAt_idx"
  ON "EvidenceRef"("actorId", "observedAt");
CREATE INDEX "EvidenceRef_actorId_verificationStatus_observedAt_idx"
  ON "EvidenceRef"("actorId", "verificationStatus", "observedAt");
CREATE INDEX "EvidenceRef_kind_verificationStatus_idx"
  ON "EvidenceRef"("kind", "verificationStatus");

CREATE UNIQUE INDEX "Commitment_idempotencyKey_key"
  ON "Commitment"("idempotencyKey");
CREATE INDEX "Commitment_debtorActorId_status_dueAt_idx"
  ON "Commitment"("debtorActorId", "status", "dueAt");
CREATE INDEX "Commitment_creditorActorId_status_dueAt_idx"
  ON "Commitment"("creditorActorId", "status", "dueAt");
CREATE INDEX "Commitment_sourceEvidenceId_idx"
  ON "Commitment"("sourceEvidenceId");
CREATE INDEX "Commitment_externalFramework_externalReference_idx"
  ON "Commitment"("externalFramework", "externalReference");

CREATE UNIQUE INDEX "CommitmentTransition_idempotencyKey_key"
  ON "CommitmentTransition"("idempotencyKey");
CREATE INDEX "CommitmentTransition_commitmentId_occurredAt_idx"
  ON "CommitmentTransition"("commitmentId", "occurredAt");
CREATE INDEX "CommitmentTransition_evidenceRefId_idx"
  ON "CommitmentTransition"("evidenceRefId");

ALTER TABLE "EvidenceRef"
  ADD CONSTRAINT "EvidenceRef_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Commitment"
  ADD CONSTRAINT "Commitment_debtorActorId_fkey"
  FOREIGN KEY ("debtorActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Commitment"
  ADD CONSTRAINT "Commitment_creditorActorId_fkey"
  FOREIGN KEY ("creditorActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Commitment"
  ADD CONSTRAINT "Commitment_sourceEvidenceId_fkey"
  FOREIGN KEY ("sourceEvidenceId") REFERENCES "EvidenceRef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommitmentTransition"
  ADD CONSTRAINT "CommitmentTransition_commitmentId_fkey"
  FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommitmentTransition"
  ADD CONSTRAINT "CommitmentTransition_evidenceRefId_fkey"
  FOREIGN KEY ("evidenceRefId") REFERENCES "EvidenceRef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

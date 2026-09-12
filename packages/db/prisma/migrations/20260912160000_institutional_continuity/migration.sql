-- Institutional continuity separates immutable evidence artifacts, actor-specific
-- bindings, validator judgments, and obligation state. Commitments attach to
-- persistent actor IDs rather than transient executions, so governed migrations
-- preserve obligations while forks remain separate actors.

CREATE TYPE "EvidenceValidationStatus" AS ENUM ('VERIFIED', 'REJECTED', 'REVOKED');
CREATE TYPE "CommitmentStatus" AS ENUM ('OPEN', 'FULFILLED', 'BREACHED', 'CANCELLED', 'DISPUTED');

CREATE TABLE "EvidenceArtifact" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "externalId" TEXT,
  "uri" TEXT,
  "digest" TEXT NOT NULL,
  "digestAlgorithm" TEXT NOT NULL DEFAULT 'sha256',
  "observedAt" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EvidenceArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActorEvidenceBinding" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "evidenceArtifactId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT "ActorEvidenceBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceValidation" (
  "id" TEXT NOT NULL,
  "evidenceArtifactId" TEXT NOT NULL,
  "validator" TEXT NOT NULL,
  "status" "EvidenceValidationStatus" NOT NULL,
  "method" TEXT,
  "reason" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT "EvidenceValidation_pkey" PRIMARY KEY ("id")
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
  "sourceEvidenceArtifactId" TEXT,
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
  "evidenceArtifactId" TEXT,
  "reason" TEXT,
  "decidedByType" TEXT NOT NULL,
  "decidedById" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT "CommitmentTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvidenceArtifact_issuer_digest_key"
  ON "EvidenceArtifact"("issuer", "digest");
CREATE INDEX "EvidenceArtifact_kind_observedAt_idx"
  ON "EvidenceArtifact"("kind", "observedAt");

CREATE UNIQUE INDEX "ActorEvidenceBinding_actorId_evidenceArtifactId_role_key"
  ON "ActorEvidenceBinding"("actorId", "evidenceArtifactId", "role");
CREATE INDEX "ActorEvidenceBinding_actorId_boundAt_idx"
  ON "ActorEvidenceBinding"("actorId", "boundAt");
CREATE INDEX "ActorEvidenceBinding_evidenceArtifactId_role_idx"
  ON "ActorEvidenceBinding"("evidenceArtifactId", "role");

CREATE UNIQUE INDEX "EvidenceValidation_idempotencyKey_key"
  ON "EvidenceValidation"("idempotencyKey");
CREATE INDEX "EvidenceValidation_evidenceArtifactId_checkedAt_idx"
  ON "EvidenceValidation"("evidenceArtifactId", "checkedAt");
CREATE INDEX "EvidenceValidation_validator_status_checkedAt_idx"
  ON "EvidenceValidation"("validator", "status", "checkedAt");

CREATE UNIQUE INDEX "Commitment_idempotencyKey_key"
  ON "Commitment"("idempotencyKey");
CREATE INDEX "Commitment_debtorActorId_status_dueAt_idx"
  ON "Commitment"("debtorActorId", "status", "dueAt");
CREATE INDEX "Commitment_creditorActorId_status_dueAt_idx"
  ON "Commitment"("creditorActorId", "status", "dueAt");
CREATE INDEX "Commitment_sourceEvidenceArtifactId_idx"
  ON "Commitment"("sourceEvidenceArtifactId");
CREATE INDEX "Commitment_externalFramework_externalReference_idx"
  ON "Commitment"("externalFramework", "externalReference");

CREATE UNIQUE INDEX "CommitmentTransition_idempotencyKey_key"
  ON "CommitmentTransition"("idempotencyKey");
CREATE INDEX "CommitmentTransition_commitmentId_occurredAt_idx"
  ON "CommitmentTransition"("commitmentId", "occurredAt");
CREATE INDEX "CommitmentTransition_evidenceArtifactId_idx"
  ON "CommitmentTransition"("evidenceArtifactId");

ALTER TABLE "ActorEvidenceBinding"
  ADD CONSTRAINT "ActorEvidenceBinding_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorEvidenceBinding"
  ADD CONSTRAINT "ActorEvidenceBinding_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EvidenceValidation"
  ADD CONSTRAINT "EvidenceValidation_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Commitment"
  ADD CONSTRAINT "Commitment_debtorActorId_fkey"
  FOREIGN KEY ("debtorActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Commitment"
  ADD CONSTRAINT "Commitment_creditorActorId_fkey"
  FOREIGN KEY ("creditorActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Commitment"
  ADD CONSTRAINT "Commitment_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommitmentTransition"
  ADD CONSTRAINT "CommitmentTransition_commitmentId_fkey"
  FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommitmentTransition"
  ADD CONSTRAINT "CommitmentTransition_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

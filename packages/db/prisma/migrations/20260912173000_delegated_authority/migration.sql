-- Delegated authority is attached to persistent actor IDs rather than model/runtime
-- executions. Child grants are historical objects; revoking an ancestor invalidates
-- descendants logically without rewriting their rows.

CREATE TYPE "AuthorityGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "AuthorityGrant" (
  "id" TEXT NOT NULL,
  "subjectActorId" TEXT NOT NULL,
  "parentGrantId" TEXT,
  "grantorType" TEXT NOT NULL,
  "grantorRef" TEXT NOT NULL,
  "status" "AuthorityGrantStatus" NOT NULL DEFAULT 'ACTIVE',
  "actions" TEXT[] NOT NULL,
  "resources" TEXT[] NOT NULL,
  "canRedelegate" BOOLEAN NOT NULL DEFAULT false,
  "remainingDelegationDepth" INTEGER NOT NULL DEFAULT 0,
  "maxAmountMinor" TEXT,
  "currency" TEXT,
  "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "externalFramework" TEXT,
  "externalReference" TEXT,
  "sourceEvidenceArtifactId" TEXT,
  "issuedByType" TEXT NOT NULL,
  "issuedById" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedByType" TEXT,
  "revokedById" TEXT,
  "revocationReason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AuthorityGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthorityGrant_nonnegative_depth" CHECK ("remainingDelegationDepth" >= 0),
  CONSTRAINT "AuthorityGrant_scope_nonempty" CHECK (
    cardinality("actions") > 0 AND cardinality("resources") > 0
  ),
  CONSTRAINT "AuthorityGrant_money_pair" CHECK (
    ("maxAmountMinor" IS NULL AND "currency" IS NULL) OR
    ("maxAmountMinor" IS NOT NULL AND "currency" IS NOT NULL)
  ),
  CONSTRAINT "AuthorityGrant_window" CHECK (
    "expiresAt" IS NULL OR "expiresAt" > "notBefore"
  ),
  CONSTRAINT "AuthorityGrant_revocation_projection" CHECK (
    ("status" = 'ACTIVE' AND "revokedAt" IS NULL AND "revokedByType" IS NULL) OR
    ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "revokedByType" IS NOT NULL)
  )
);

CREATE TABLE "AuthorityGrantTransition" (
  "id" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "fromStatus" "AuthorityGrantStatus",
  "toStatus" "AuthorityGrantStatus" NOT NULL,
  "reason" TEXT,
  "decidedByType" TEXT NOT NULL,
  "decidedById" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT "AuthorityGrantTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthorityGrant_idempotencyKey_key"
  ON "AuthorityGrant"("idempotencyKey");
CREATE INDEX "AuthorityGrant_subjectActorId_status_expiresAt_idx"
  ON "AuthorityGrant"("subjectActorId", "status", "expiresAt");
CREATE INDEX "AuthorityGrant_parentGrantId_idx"
  ON "AuthorityGrant"("parentGrantId");
CREATE INDEX "AuthorityGrant_grantorType_grantorRef_idx"
  ON "AuthorityGrant"("grantorType", "grantorRef");
CREATE INDEX "AuthorityGrant_externalFramework_externalReference_idx"
  ON "AuthorityGrant"("externalFramework", "externalReference");
CREATE INDEX "AuthorityGrant_sourceEvidenceArtifactId_idx"
  ON "AuthorityGrant"("sourceEvidenceArtifactId");

CREATE UNIQUE INDEX "AuthorityGrantTransition_idempotencyKey_key"
  ON "AuthorityGrantTransition"("idempotencyKey");
CREATE INDEX "AuthorityGrantTransition_grantId_occurredAt_idx"
  ON "AuthorityGrantTransition"("grantId", "occurredAt");

ALTER TABLE "AuthorityGrant"
  ADD CONSTRAINT "AuthorityGrant_subjectActorId_fkey"
  FOREIGN KEY ("subjectActorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthorityGrant"
  ADD CONSTRAINT "AuthorityGrant_parentGrantId_fkey"
  FOREIGN KEY ("parentGrantId") REFERENCES "AuthorityGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthorityGrant"
  ADD CONSTRAINT "AuthorityGrant_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthorityGrantTransition"
  ADD CONSTRAINT "AuthorityGrantTransition_grantId_fkey"
  FOREIGN KEY ("grantId") REFERENCES "AuthorityGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Accountability is deliberately split into historical authority exercises,
-- externally evidenced outcome observations, and method-specific attribution
-- assessments. An observation is never itself a causal claim.

CREATE TYPE "AuthorityExerciseCoverage" AS ENUM ('COVERED', 'NOT_COVERED');
CREATE TYPE "ConsequenceAttributionDisposition" AS ENUM (
  'SUPPORTED',
  'NOT_SUPPORTED',
  'INDETERMINATE',
  'DISPUTED'
);

CREATE TABLE "AuthorityExercise" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "executionId" TEXT,
  "grantId" TEXT NOT NULL,
  "evidenceArtifactId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "amountMinor" TEXT,
  "currency" TEXT,
  "exercisedAt" TIMESTAMP(3) NOT NULL,
  "coverageStatus" "AuthorityExerciseCoverage" NOT NULL,
  "chainDigest" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "evaluatorVersion" TEXT NOT NULL,
  "reasons" TEXT[] NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuthorityExercise_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthorityExercise_money_pair" CHECK (
    ("amountMinor" IS NULL AND "currency" IS NULL) OR
    ("amountMinor" IS NOT NULL AND "currency" IS NOT NULL)
  ),
  CONSTRAINT "AuthorityExercise_amount_nonnegative" CHECK (
    "amountMinor" IS NULL OR "amountMinor" ~ '^(0|[1-9][0-9]*)$'
  ),
  CONSTRAINT "AuthorityExercise_currency_format" CHECK (
    "currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'
  )
);

CREATE TABLE "ConsequenceObservation" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceEvidenceArtifactId" TEXT NOT NULL,
  "sourceAuthorityExerciseId" TEXT,
  "commitmentId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "valueMinor" TEXT,
  "currency" TEXT,
  "externalFramework" TEXT,
  "externalReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConsequenceObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsequenceObservation_money_pair" CHECK (
    ("valueMinor" IS NULL AND "currency" IS NULL) OR
    ("valueMinor" IS NOT NULL AND "currency" IS NOT NULL)
  ),
  CONSTRAINT "ConsequenceObservation_value_nonnegative" CHECK (
    "valueMinor" IS NULL OR "valueMinor" ~ '^(0|[1-9][0-9]*)$'
  ),
  CONSTRAINT "ConsequenceObservation_currency_format" CHECK (
    "currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'
  )
);

CREATE TABLE "ConsequenceAttribution" (
  "id" TEXT NOT NULL,
  "consequenceId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "assessmentType" TEXT NOT NULL,
  "disposition" "ConsequenceAttributionDisposition" NOT NULL,
  "method" TEXT NOT NULL,
  "methodVersion" TEXT NOT NULL,
  "evaluator" TEXT NOT NULL,
  "scoreBps" INTEGER,
  "sourceEvidenceArtifactId" TEXT,
  "basisDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConsequenceAttribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsequenceAttribution_score_bounds" CHECK (
    "scoreBps" IS NULL OR ("scoreBps" >= 0 AND "scoreBps" <= 10000)
  )
);

CREATE UNIQUE INDEX "AuthorityExercise_idempotencyKey_key"
  ON "AuthorityExercise"("idempotencyKey");
CREATE INDEX "AuthorityExercise_actorId_exercisedAt_idx"
  ON "AuthorityExercise"("actorId", "exercisedAt");
CREATE INDEX "AuthorityExercise_grantId_exercisedAt_idx"
  ON "AuthorityExercise"("grantId", "exercisedAt");
CREATE INDEX "AuthorityExercise_evidenceArtifactId_idx"
  ON "AuthorityExercise"("evidenceArtifactId");
CREATE INDEX "AuthorityExercise_executionId_idx"
  ON "AuthorityExercise"("executionId");

CREATE UNIQUE INDEX "ConsequenceObservation_idempotencyKey_key"
  ON "ConsequenceObservation"("idempotencyKey");
CREATE INDEX "ConsequenceObservation_kind_occurredAt_idx"
  ON "ConsequenceObservation"("kind", "occurredAt");
CREATE INDEX "ConsequenceObservation_sourceEvidenceArtifactId_idx"
  ON "ConsequenceObservation"("sourceEvidenceArtifactId");
CREATE INDEX "ConsequenceObservation_sourceAuthorityExerciseId_idx"
  ON "ConsequenceObservation"("sourceAuthorityExerciseId");
CREATE INDEX "ConsequenceObservation_commitmentId_idx"
  ON "ConsequenceObservation"("commitmentId");

CREATE UNIQUE INDEX "ConsequenceAttribution_idempotencyKey_key"
  ON "ConsequenceAttribution"("idempotencyKey");
CREATE INDEX "ConsequenceAttribution_actorId_createdAt_idx"
  ON "ConsequenceAttribution"("actorId", "createdAt");
CREATE INDEX "ConsequenceAttribution_consequenceId_createdAt_idx"
  ON "ConsequenceAttribution"("consequenceId", "createdAt");
CREATE INDEX "ConsequenceAttribution_method_methodVersion_idx"
  ON "ConsequenceAttribution"("method", "methodVersion");
CREATE INDEX "ConsequenceAttribution_sourceEvidenceArtifactId_idx"
  ON "ConsequenceAttribution"("sourceEvidenceArtifactId");

ALTER TABLE "AuthorityExercise"
  ADD CONSTRAINT "AuthorityExercise_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthorityExercise"
  ADD CONSTRAINT "AuthorityExercise_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "ActorExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuthorityExercise"
  ADD CONSTRAINT "AuthorityExercise_grantId_fkey"
  FOREIGN KEY ("grantId") REFERENCES "AuthorityGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuthorityExercise"
  ADD CONSTRAINT "AuthorityExercise_evidenceArtifactId_fkey"
  FOREIGN KEY ("evidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsequenceObservation"
  ADD CONSTRAINT "ConsequenceObservation_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsequenceObservation"
  ADD CONSTRAINT "ConsequenceObservation_sourceAuthorityExerciseId_fkey"
  FOREIGN KEY ("sourceAuthorityExerciseId") REFERENCES "AuthorityExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsequenceObservation"
  ADD CONSTRAINT "ConsequenceObservation_commitmentId_fkey"
  FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsequenceAttribution"
  ADD CONSTRAINT "ConsequenceAttribution_consequenceId_fkey"
  FOREIGN KEY ("consequenceId") REFERENCES "ConsequenceObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsequenceAttribution"
  ADD CONSTRAINT "ConsequenceAttribution_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsequenceAttribution"
  ADD CONSTRAINT "ConsequenceAttribution_sourceEvidenceArtifactId_fkey"
  FOREIGN KEY ("sourceEvidenceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

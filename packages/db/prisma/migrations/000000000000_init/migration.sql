-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'PROVIDER', 'RESEARCH', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ActorStatus" AS ENUM ('ACTIVE', 'PAUSED', 'RETIRED');

-- CreateEnum
CREATE TYPE "LineageKind" AS ENUM ('ORIGIN', 'MIGRATION', 'FORK', 'MERGE', 'RESTORE');

-- CreateEnum
CREATE TYPE "CanonicalStatus" AS ENUM ('ACCEPTED', 'DISPUTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "EnvironmentStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Actor" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "ownerId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "status" "ActorStatus" NOT NULL DEFAULT 'ACTIVE',
    "canonicalLineageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Actor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActorExecution" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "runtime" TEXT,
    "configHash" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ActorExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineageNode" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "parentNodeId" TEXT,
    "kind" "LineageKind" NOT NULL,
    "canonical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "LineageNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Host" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "publicKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Host_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "EnvironmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActorEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "executionId" TEXT,
    "hostId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "environmentVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "issuer" TEXT NOT NULL,
    "signature" TEXT,
    "previousEventHash" TEXT,
    "hash" TEXT NOT NULL,
    "canonicalStatus" "CanonicalStatus" NOT NULL DEFAULT 'ACCEPTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("userId","actorId")
);

-- CreateTable
CREATE TABLE "RelationshipEdge" (
    "id" TEXT NOT NULL,
    "subjectActorId" TEXT NOT NULL,
    "objectActorId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "firstObservedAt" TIMESTAMP(3) NOT NULL,
    "lastObservedAt" TIMESTAMP(3) NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "RelationshipEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "actorAId" TEXT NOT NULL,
    "actorBId" TEXT NOT NULL,
    "winnerActorId" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "seed" TEXT,
    "result" JSONB,
    "trajectory" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Actor_handle_key" ON "Actor"("handle");

-- CreateIndex
CREATE INDEX "Actor_ownerId_idx" ON "Actor"("ownerId");

-- CreateIndex
CREATE INDEX "Actor_actorType_status_idx" ON "Actor"("actorType", "status");

-- CreateIndex
CREATE INDEX "Actor_createdAt_idx" ON "Actor"("createdAt");

-- CreateIndex
CREATE INDEX "ActorExecution_actorId_startedAt_idx" ON "ActorExecution"("actorId", "startedAt");

-- CreateIndex
CREATE INDEX "ActorExecution_provider_model_idx" ON "ActorExecution"("provider", "model");

-- CreateIndex
CREATE INDEX "LineageNode_actorId_canonical_idx" ON "LineageNode"("actorId", "canonical");

-- CreateIndex
CREATE INDEX "LineageNode_parentNodeId_idx" ON "LineageNode"("parentNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Host_slug_key" ON "Host"("slug");

-- CreateIndex
CREATE INDEX "Environment_slug_status_idx" ON "Environment"("slug", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_hostId_slug_version_key" ON "Environment"("hostId", "slug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ActorEvent_sourceKey_key" ON "ActorEvent"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "ActorEvent_previousEventHash_key" ON "ActorEvent"("previousEventHash");

-- CreateIndex
CREATE UNIQUE INDEX "ActorEvent_hash_key" ON "ActorEvent"("hash");

-- CreateIndex
CREATE INDEX "ActorEvent_actorId_occurredAt_idx" ON "ActorEvent"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActorEvent_actorId_canonicalStatus_occurredAt_idx" ON "ActorEvent"("actorId", "canonicalStatus", "occurredAt");

-- CreateIndex
CREATE INDEX "ActorEvent_type_occurredAt_idx" ON "ActorEvent"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "ActorEvent_hostId_occurredAt_idx" ON "ActorEvent"("hostId", "occurredAt");

-- CreateIndex
CREATE INDEX "Follow_actorId_createdAt_idx" ON "Follow"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "RelationshipEdge_subjectActorId_relation_lastObservedAt_idx" ON "RelationshipEdge"("subjectActorId", "relation", "lastObservedAt");

-- CreateIndex
CREATE INDEX "RelationshipEdge_objectActorId_relation_lastObservedAt_idx" ON "RelationshipEdge"("objectActorId", "relation", "lastObservedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipEdge_subjectActorId_objectActorId_relation_key" ON "RelationshipEdge"("subjectActorId", "objectActorId", "relation");

-- CreateIndex
CREATE INDEX "Match_environmentId_status_scheduledAt_idx" ON "Match"("environmentId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Match_actorAId_completedAt_idx" ON "Match"("actorAId", "completedAt");

-- CreateIndex
CREATE INDEX "Match_actorBId_completedAt_idx" ON "Match"("actorBId", "completedAt");

-- AddForeignKey
ALTER TABLE "Actor" ADD CONSTRAINT "Actor_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorExecution" ADD CONSTRAINT "ActorExecution_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineageNode" ADD CONSTRAINT "LineageNode_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineageNode" ADD CONSTRAINT "LineageNode_parentNodeId_fkey" FOREIGN KEY ("parentNodeId") REFERENCES "LineageNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorEvent" ADD CONSTRAINT "ActorEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorEvent" ADD CONSTRAINT "ActorEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ActorExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorEvent" ADD CONSTRAINT "ActorEvent_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipEdge" ADD CONSTRAINT "RelationshipEdge_subjectActorId_fkey" FOREIGN KEY ("subjectActorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipEdge" ADD CONSTRAINT "RelationshipEdge_objectActorId_fkey" FOREIGN KEY ("objectActorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_actorAId_fkey" FOREIGN KEY ("actorAId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_actorBId_fkey" FOREIGN KEY ("actorBId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerActorId_fkey" FOREIGN KEY ("winnerActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Onbae integrity constraints not representable in Prisma schema syntax.
CREATE UNIQUE INDEX "ActorExecution_one_active_per_actor_key"
  ON "ActorExecution"("actorId")
  WHERE "endedAt" IS NULL;

CREATE UNIQUE INDEX "LineageNode_one_canonical_per_actor_key"
  ON "LineageNode"("actorId")
  WHERE "canonical" = true;

-- Host signing keys are versioned independently from hosts so key rotation does not
-- invalidate historical receipts.
CREATE TABLE "HostKey" (
  "id" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL DEFAULT 'ed25519',
  "publicKeyPem" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),

  CONSTRAINT "HostKey_pkey" PRIMARY KEY ("id")
);

-- A HostReceipt preserves the host's original signed statement separately from
-- NOEONE's canonical actor-event acceptance record.
CREATE TABLE "HostReceipt" (
  "id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "executionId" TEXT,
  "environmentId" TEXT NOT NULL,
  "actorEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "environmentVersion" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "signature" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HostReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HostKey_hostId_status_idx" ON "HostKey"("hostId", "status");

CREATE UNIQUE INDEX "HostReceipt_actorEventId_key" ON "HostReceipt"("actorEventId");
CREATE UNIQUE INDEX "HostReceipt_contentHash_key" ON "HostReceipt"("contentHash");
CREATE UNIQUE INDEX "HostReceipt_hostId_receiptId_key" ON "HostReceipt"("hostId", "receiptId");
CREATE INDEX "HostReceipt_actorId_occurredAt_idx" ON "HostReceipt"("actorId", "occurredAt");
CREATE INDEX "HostReceipt_hostId_occurredAt_idx" ON "HostReceipt"("hostId", "occurredAt");
CREATE INDEX "HostReceipt_keyId_receivedAt_idx" ON "HostReceipt"("keyId", "receivedAt");

ALTER TABLE "HostKey"
  ADD CONSTRAINT "HostKey_hostId_fkey"
  FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HostReceipt"
  ADD CONSTRAINT "HostReceipt_hostId_fkey"
  FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HostReceipt"
  ADD CONSTRAINT "HostReceipt_keyId_fkey"
  FOREIGN KEY ("keyId") REFERENCES "HostKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HostReceipt"
  ADD CONSTRAINT "HostReceipt_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HostReceipt"
  ADD CONSTRAINT "HostReceipt_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "ActorExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HostReceipt"
  ADD CONSTRAINT "HostReceipt_environmentId_fkey"
  FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HostReceipt"
  ADD CONSTRAINT "HostReceipt_actorEventId_fkey"
  FOREIGN KEY ("actorEventId") REFERENCES "ActorEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

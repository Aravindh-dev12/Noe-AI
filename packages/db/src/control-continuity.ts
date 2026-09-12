import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

type JsonObject = Record<string, unknown>;

type ControlTransitionKind = 'ROTATION' | 'TRANSFER' | 'RECOVERY' | 'QUARANTINE' | 'RESTORE';
type ControlTransitionStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
type ControlEpochState = 'ACTIVE' | 'QUARANTINED';
type ControlApprovalDisposition = 'APPROVE' | 'OBJECT';

export type ControlRegistryContext = {
  signingSecret: string;
  hostId: string;
  environmentVersion: string;
  issuer: string;
};

export type ControlGuardianInput = {
  principalType: string;
  principalRef: string;
  role?: string;
};

export type CreateActorControlPolicyInput = {
  actorId: string;
  threshold: number;
  challengeWindowSeconds?: number;
  guardians: ControlGuardianInput[];
  sourceEvidenceArtifactId?: string | null;
  externalFramework?: string | null;
  externalReference?: string | null;
  effectiveAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type InitializeActorControlEpochInput = {
  actorId: string;
  policyId: string;
  controllerType: string;
  controllerRef: string;
  keyStateDigest?: string | null;
  sourceEvidenceArtifactId?: string | null;
  externalFramework?: string | null;
  externalReference?: string | null;
  startedAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type ProposeActorControlTransitionInput = {
  actorId: string;
  kind: ControlTransitionKind;
  sourceEvidenceArtifactId: string;
  proposedControllerType?: string | null;
  proposedControllerRef?: string | null;
  proposedKeyStateDigest?: string | null;
  proposedAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type RecordActorControlApprovalInput = {
  transitionId: string;
  principalType: string;
  principalRef: string;
  disposition: ControlApprovalDisposition;
  sourceEvidenceArtifactId: string;
  observedAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export class ControlContinuityConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ControlContinuityConflictError';
  }
}

export type ActorControlPolicyRow = {
  id: string;
  actorId: string;
  version: number;
  threshold: number;
  challengeWindowSeconds: number;
  objectionMode: 'VETO';
  sourceEvidenceArtifactId: string | null;
  externalFramework: string | null;
  externalReference: string | null;
  policyDigest: string;
  idempotencyKey: string;
  effectiveAt: Date;
  retiredAt: Date | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export type ActorControlGuardianRow = {
  id: string;
  policyId: string;
  principalType: string;
  principalRef: string;
  role: string;
  createdAt: Date;
};

export type ActorControlEpochRow = {
  id: string;
  actorId: string;
  policyId: string;
  epoch: number;
  controllerType: string;
  controllerRef: string;
  state: ControlEpochState;
  keyStateDigest: string | null;
  sourceEvidenceArtifactId: string | null;
  externalFramework: string | null;
  externalReference: string | null;
  startedAt: Date;
  endedAt: Date | null;
  basisDigest: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export type ActorControlTransitionRow = {
  id: string;
  actorId: string;
  fromEpochId: string;
  policyId: string;
  kind: ControlTransitionKind;
  status: ControlTransitionStatus;
  proposedControllerType: string | null;
  proposedControllerRef: string | null;
  proposedKeyStateDigest: string | null;
  sourceEvidenceArtifactId: string;
  policyDigest: string;
  proposedAt: Date;
  challengeUntil: Date;
  decidedAt: Date | null;
  decisionReason: string | null;
  resultingEpochId: string | null;
  basisDigest: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export type ActorControlApprovalRow = {
  id: string;
  transitionId: string;
  principalType: string;
  principalRef: string;
  disposition: ControlApprovalDisposition;
  sourceEvidenceArtifactId: string;
  observedAt: Date;
  basisDigest: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function json(value: unknown): Prisma.Sql {
  return Prisma.sql`CAST(${JSON.stringify(value)} AS jsonb)`;
}

function normalizeText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw Object.assign(new Error(`${field} is required.`), { statusCode: 400 });
  }
  return normalized;
}

function normalizeGuardians(guardians: ControlGuardianInput[]) {
  const normalized = guardians
    .map((guardian) => ({
      principalType: normalizeText(guardian.principalType, 'guardian principalType').toLowerCase(),
      principalRef: normalizeText(guardian.principalRef, 'guardian principalRef'),
      role: normalizeText(guardian.role ?? 'guardian', 'guardian role').toLowerCase(),
    }))
    .sort(
      (a, b) =>
        a.principalType.localeCompare(b.principalType) ||
        a.principalRef.localeCompare(b.principalRef) ||
        a.role.localeCompare(b.role),
    );

  const unique = new Set(normalized.map((guardian) => `${guardian.principalType}\u0000${guardian.principalRef}`));
  if (unique.size !== normalized.length) {
    throw Object.assign(new Error('Control-policy guardians must be unique principals.'), {
      statusCode: 400,
    });
  }
  if (normalized.length === 0) {
    throw Object.assign(new Error('At least one control guardian is required.'), { statusCode: 400 });
  }
  return normalized;
}

async function assertEvidenceExists(
  tx: Prisma.TransactionClient,
  evidenceArtifactId: string | null | undefined,
) {
  if (!evidenceArtifactId) return;
  const evidence = await tx.evidenceArtifact.findUnique({
    where: { id: evidenceArtifactId },
    select: { id: true },
  });
  if (!evidence) {
    throw Object.assign(new Error('Evidence artifact not found.'), { statusCode: 404 });
  }
}

function policyBasis(row: {
  actorId: string;
  version: number;
  threshold: number;
  challengeWindowSeconds: number;
  objectionMode: 'VETO';
  guardians: Array<{ principalType: string; principalRef: string; role: string }>;
  sourceEvidenceArtifactId: string | null;
  externalFramework: string | null;
  externalReference: string | null;
  effectiveAt: Date;
}) {
  return {
    version: 'noeone.control-policy.v1',
    actorId: row.actorId,
    policyVersion: row.version,
    threshold: row.threshold,
    challengeWindowSeconds: row.challengeWindowSeconds,
    objectionMode: row.objectionMode,
    guardians: row.guardians,
    sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
    externalFramework: row.externalFramework,
    externalReference: row.externalReference,
    effectiveAt: row.effectiveAt.toISOString(),
  };
}

function epochBasis(row: {
  actorId: string;
  policyId: string;
  epoch: number;
  controllerType: string;
  controllerRef: string;
  state: ControlEpochState;
  keyStateDigest: string | null;
  sourceEvidenceArtifactId: string | null;
  externalFramework: string | null;
  externalReference: string | null;
  startedAt: Date;
}) {
  return {
    version: 'noeone.control-epoch.v1',
    actorId: row.actorId,
    policyId: row.policyId,
    epoch: row.epoch,
    controllerType: row.controllerType,
    controllerRef: row.controllerRef,
    state: row.state,
    keyStateDigest: row.keyStateDigest,
    sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
    externalFramework: row.externalFramework,
    externalReference: row.externalReference,
    startedAt: row.startedAt.toISOString(),
  };
}

function transitionBasis(row: {
  actorId: string;
  fromEpochId: string;
  policyId: string;
  kind: ControlTransitionKind;
  proposedControllerType: string | null;
  proposedControllerRef: string | null;
  proposedKeyStateDigest: string | null;
  sourceEvidenceArtifactId: string;
  policyDigest: string;
  proposedAt: Date;
  challengeUntil: Date;
}) {
  return {
    version: 'noeone.control-transition.v1',
    actorId: row.actorId,
    fromEpochId: row.fromEpochId,
    policyId: row.policyId,
    kind: row.kind,
    proposedControllerType: row.proposedControllerType,
    proposedControllerRef: row.proposedControllerRef,
    proposedKeyStateDigest: row.proposedKeyStateDigest,
    sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
    policyDigest: row.policyDigest,
    proposedAt: row.proposedAt.toISOString(),
    challengeUntil: row.challengeUntil.toISOString(),
  };
}

function approvalBasis(row: {
  transitionId: string;
  principalType: string;
  principalRef: string;
  disposition: ControlApprovalDisposition;
  sourceEvidenceArtifactId: string;
  observedAt: Date;
}) {
  return {
    version: 'noeone.control-approval.v1',
    transitionId: row.transitionId,
    principalType: row.principalType,
    principalRef: row.principalRef,
    disposition: row.disposition,
    sourceEvidenceArtifactId: row.sourceEvidenceArtifactId,
    observedAt: row.observedAt.toISOString(),
  };
}

async function getPolicyGuardians(
  tx: Prisma.TransactionClient,
  policyId: string,
): Promise<ActorControlGuardianRow[]> {
  return tx.$queryRaw<ActorControlGuardianRow[]>(Prisma.sql`
    SELECT * FROM "ActorControlGuardian"
    WHERE "policyId" = ${policyId}
    ORDER BY "principalType", "principalRef", "role", "id"
  `);
}

async function getControlPolicy(
  tx: Prisma.TransactionClient,
  policyId: string,
): Promise<ActorControlPolicyRow | null> {
  const rows = await tx.$queryRaw<ActorControlPolicyRow[]>(Prisma.sql`
    SELECT * FROM "ActorControlPolicy" WHERE "id" = ${policyId} LIMIT 1
  `);
  return rows[0] ?? null;
}

async function getCurrentEpoch(
  tx: Prisma.TransactionClient,
  actorId: string,
): Promise<ActorControlEpochRow | null> {
  const rows = await tx.$queryRaw<ActorControlEpochRow[]>(Prisma.sql`
    SELECT * FROM "ActorControlEpoch"
    WHERE "actorId" = ${actorId} AND "endedAt" IS NULL
    ORDER BY "epoch" DESC LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function createActorControlPolicy(
  input: CreateActorControlPolicyInput,
  registry: ControlRegistryContext,
) {
  const guardians = normalizeGuardians(input.guardians);
  if (!Number.isInteger(input.threshold) || input.threshold < 1 || input.threshold > guardians.length) {
    throw Object.assign(
      new Error(`threshold must be an integer between 1 and guardian count (${guardians.length}).`),
      { statusCode: 400 },
    );
  }
  const challengeWindowSeconds = input.challengeWindowSeconds ?? 86_400;
  if (
    !Number.isInteger(challengeWindowSeconds) ||
    challengeWindowSeconds < 0 ||
    challengeWindowSeconds > 2_592_000
  ) {
    throw Object.assign(new Error('challengeWindowSeconds must be between 0 and 2592000.'), {
      statusCode: 400,
    });
  }

  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Actor" WHERE "id" = ${input.actorId} FOR UPDATE
    `);
    if (locked.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }
    await assertEvidenceExists(tx, input.sourceEvidenceArtifactId);

    const existingRows = await tx.$queryRaw<ActorControlPolicyRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlPolicy" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
    `);
    const existing = existingRows[0];
    if (existing) {
      const existingGuardians = await getPolicyGuardians(tx, existing.id);
      const expected = policyBasis({
        actorId: input.actorId,
        version: existing.version,
        threshold: input.threshold,
        challengeWindowSeconds,
        objectionMode: 'VETO',
        guardians,
        sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
        externalFramework: input.externalFramework ?? null,
        externalReference: input.externalReference ?? null,
        effectiveAt: input.effectiveAt ?? existing.effectiveAt,
      });
      const existingBasis = policyBasis({
        actorId: existing.actorId,
        version: existing.version,
        threshold: existing.threshold,
        challengeWindowSeconds: existing.challengeWindowSeconds,
        objectionMode: existing.objectionMode,
        guardians: existingGuardians.map(({ principalType, principalRef, role }) => ({
          principalType,
          principalRef,
          role,
        })),
        sourceEvidenceArtifactId: existing.sourceEvidenceArtifactId,
        externalFramework: existing.externalFramework,
        externalReference: existing.externalReference,
        effectiveAt: existing.effectiveAt,
      });
      if (sha256(expected) !== sha256(existingBasis)) {
        throw new ControlContinuityConflictError(
          'Control-policy idempotency key was reused with different input.',
        );
      }
      return { replayed: true, policy: existing, guardians: existingGuardians };
    }

    const versionRows = await tx.$queryRaw<Array<{ version: number }>>(Prisma.sql`
      SELECT COALESCE(MAX("version"), 0)::int AS "version"
      FROM "ActorControlPolicy" WHERE "actorId" = ${input.actorId}
    `);
    const version = (versionRows[0]?.version ?? 0) + 1;
    const effectiveAt = input.effectiveAt ?? new Date();
    const basis = policyBasis({
      actorId: input.actorId,
      version,
      threshold: input.threshold,
      challengeWindowSeconds,
      objectionMode: 'VETO',
      guardians,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
      externalFramework: input.externalFramework ?? null,
      externalReference: input.externalReference ?? null,
      effectiveAt,
    });
    const policyDigest = sha256(basis);
    const id = `ctrlpol_${randomUUID()}`;

    await tx.$executeRaw(Prisma.sql`
      UPDATE "ActorControlPolicy"
      SET "retiredAt" = ${effectiveAt}
      WHERE "actorId" = ${input.actorId} AND "retiredAt" IS NULL
    `);

    const rows = await tx.$queryRaw<ActorControlPolicyRow[]>(Prisma.sql`
      INSERT INTO "ActorControlPolicy" (
        "id", "actorId", "version", "threshold", "challengeWindowSeconds", "objectionMode",
        "sourceEvidenceArtifactId", "externalFramework", "externalReference", "policyDigest",
        "idempotencyKey", "effectiveAt", "metadata"
      ) VALUES (
        ${id}, ${input.actorId}, ${version}, ${input.threshold}, ${challengeWindowSeconds}, 'VETO',
        ${input.sourceEvidenceArtifactId ?? null}, ${input.externalFramework ?? null},
        ${input.externalReference ?? null}, ${policyDigest}, ${input.idempotencyKey}, ${effectiveAt},
        ${json(input.metadata ?? {})}
      ) RETURNING *
    `);
    const policy = rows[0]!;

    for (const guardian of guardians) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ActorControlGuardian" (
          "id", "policyId", "principalType", "principalRef", "role"
        ) VALUES (
          ${`ctrlguard_${randomUUID()}`}, ${policy.id}, ${guardian.principalType},
          ${guardian.principalRef}, ${guardian.role}
        )
      `);
    }

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: input.actorId,
        type: 'actor.control.policy.changed',
        sourceKey: `control-policy:${policy.id}`,
        occurredAt: effectiveAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          policyId: policy.id,
          policyVersion: policy.version,
          policyDigest,
          threshold: policy.threshold,
          guardianCount: guardians.length,
          challengeWindowSeconds: policy.challengeWindowSeconds,
          objectionMode: policy.objectionMode,
        },
      },
      registry.signingSecret,
    );

    return { replayed: false, policy, guardians: await getPolicyGuardians(tx, policy.id) };
  });
}

export async function initializeActorControlEpoch(
  input: InitializeActorControlEpochInput,
  registry: ControlRegistryContext,
) {
  const controllerType = normalizeText(input.controllerType, 'controllerType').toLowerCase();
  const controllerRef = normalizeText(input.controllerRef, 'controllerRef');

  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Actor" WHERE "id" = ${input.actorId} FOR UPDATE
    `);
    if (locked.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }
    await assertEvidenceExists(tx, input.sourceEvidenceArtifactId);

    const policy = await getControlPolicy(tx, input.policyId);
    if (!policy || policy.actorId !== input.actorId || policy.retiredAt !== null) {
      throw new ControlContinuityConflictError('Initial control epoch requires the actor active policy.');
    }

    const existingRows = await tx.$queryRaw<ActorControlEpochRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlEpoch" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
    `);
    const existing = existingRows[0];
    if (existing) {
      const expected = epochBasis({
        actorId: input.actorId,
        policyId: input.policyId,
        epoch: existing.epoch,
        controllerType,
        controllerRef,
        state: 'ACTIVE',
        keyStateDigest: input.keyStateDigest ?? null,
        sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
        externalFramework: input.externalFramework ?? null,
        externalReference: input.externalReference ?? null,
        startedAt: input.startedAt ?? existing.startedAt,
      });
      if (sha256(expected) !== existing.basisDigest) {
        throw new ControlContinuityConflictError(
          'Control-epoch idempotency key was reused with different input.',
        );
      }
      return { replayed: true, epoch: existing };
    }

    if (await getCurrentEpoch(tx, input.actorId)) {
      throw new ControlContinuityConflictError('Actor already has a current control epoch.');
    }

    const numberRows = await tx.$queryRaw<Array<{ epoch: number }>>(Prisma.sql`
      SELECT COALESCE(MAX("epoch"), 0)::int AS "epoch"
      FROM "ActorControlEpoch" WHERE "actorId" = ${input.actorId}
    `);
    const epochNumber = (numberRows[0]?.epoch ?? 0) + 1;
    const startedAt = input.startedAt ?? new Date();
    const basis = epochBasis({
      actorId: input.actorId,
      policyId: input.policyId,
      epoch: epochNumber,
      controllerType,
      controllerRef,
      state: 'ACTIVE',
      keyStateDigest: input.keyStateDigest ?? null,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
      externalFramework: input.externalFramework ?? null,
      externalReference: input.externalReference ?? null,
      startedAt,
    });
    const basisDigest = sha256(basis);
    const id = `ctrlepoch_${randomUUID()}`;
    const rows = await tx.$queryRaw<ActorControlEpochRow[]>(Prisma.sql`
      INSERT INTO "ActorControlEpoch" (
        "id", "actorId", "policyId", "epoch", "controllerType", "controllerRef", "state",
        "keyStateDigest", "sourceEvidenceArtifactId", "externalFramework", "externalReference",
        "startedAt", "basisDigest", "idempotencyKey", "metadata"
      ) VALUES (
        ${id}, ${input.actorId}, ${input.policyId}, ${epochNumber}, ${controllerType}, ${controllerRef},
        'ACTIVE', ${input.keyStateDigest ?? null}, ${input.sourceEvidenceArtifactId ?? null},
        ${input.externalFramework ?? null}, ${input.externalReference ?? null}, ${startedAt},
        ${basisDigest}, ${input.idempotencyKey}, ${json(input.metadata ?? {})}
      ) RETURNING *
    `);
    const epoch = rows[0]!;

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: input.actorId,
        type: 'actor.control.epoch.started',
        sourceKey: `control-epoch:${epoch.id}`,
        occurredAt: startedAt,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          controlEpochId: epoch.id,
          epoch: epoch.epoch,
          state: epoch.state.toLowerCase(),
          policyId: epoch.policyId,
          basisDigest: epoch.basisDigest,
          controllerType: epoch.controllerType,
          keyStateDigest: epoch.keyStateDigest,
        },
      },
      registry.signingSecret,
    );

    return { replayed: false, epoch };
  });
}

function requireProposedController(kind: ControlTransitionKind): boolean {
  return kind !== 'QUARANTINE';
}

export async function proposeActorControlTransition(input: ProposeActorControlTransitionInput) {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Actor" WHERE "id" = ${input.actorId} FOR UPDATE
    `);
    if (locked.length !== 1) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }
    await assertEvidenceExists(tx, input.sourceEvidenceArtifactId);

    const existingRows = await tx.$queryRaw<ActorControlTransitionRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlTransition" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
    `);
    const existing = existingRows[0];
    if (existing) {
      const expectedType = input.proposedControllerType
        ? normalizeText(input.proposedControllerType, 'proposedControllerType').toLowerCase()
        : null;
      const expectedRef = input.proposedControllerRef
        ? normalizeText(input.proposedControllerRef, 'proposedControllerRef')
        : null;
      const same =
        existing.actorId === input.actorId &&
        existing.kind === input.kind &&
        existing.proposedControllerType === expectedType &&
        existing.proposedControllerRef === expectedRef &&
        existing.proposedKeyStateDigest === (input.proposedKeyStateDigest ?? null) &&
        existing.sourceEvidenceArtifactId === input.sourceEvidenceArtifactId;
      if (!same) {
        throw new ControlContinuityConflictError(
          'Control-transition idempotency key was reused with different input.',
        );
      }
      return { replayed: true, transition: existing };
    }

    const current = await getCurrentEpoch(tx, input.actorId);
    if (!current) {
      throw new ControlContinuityConflictError('Actor has no current control epoch.');
    }
    const policyRows = await tx.$queryRaw<ActorControlPolicyRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlPolicy"
      WHERE "actorId" = ${input.actorId} AND "retiredAt" IS NULL
      LIMIT 1
    `);
    const policy = policyRows[0];
    if (!policy) {
      throw new ControlContinuityConflictError('Actor has no active control policy.');
    }

    if (input.kind === 'RESTORE' && current.state !== 'QUARANTINED') {
      throw new ControlContinuityConflictError('RESTORE requires a quarantined current epoch.');
    }
    if (input.kind !== 'RESTORE' && input.kind !== 'QUARANTINE' && current.state !== 'ACTIVE') {
      throw new ControlContinuityConflictError(
        `${input.kind} requires an active current control epoch.`,
      );
    }

    let proposedControllerType: string | null = null;
    let proposedControllerRef: string | null = null;
    if (requireProposedController(input.kind)) {
      proposedControllerType = normalizeText(
        input.proposedControllerType ?? '',
        'proposedControllerType',
      ).toLowerCase();
      proposedControllerRef = normalizeText(input.proposedControllerRef ?? '', 'proposedControllerRef');
    }

    if (
      input.kind === 'ROTATION' &&
      (proposedControllerType !== current.controllerType || proposedControllerRef !== current.controllerRef)
    ) {
      throw new ControlContinuityConflictError(
        'ROTATION must preserve the controller; use TRANSFER or RECOVERY to change controllers.',
      );
    }

    const proposedAt = input.proposedAt ?? new Date();
    const challengeUntil =
      input.kind === 'QUARANTINE'
        ? proposedAt
        : new Date(proposedAt.getTime() + policy.challengeWindowSeconds * 1000);
    const basis = transitionBasis({
      actorId: input.actorId,
      fromEpochId: current.id,
      policyId: policy.id,
      kind: input.kind,
      proposedControllerType,
      proposedControllerRef,
      proposedKeyStateDigest: input.proposedKeyStateDigest ?? null,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
      policyDigest: policy.policyDigest,
      proposedAt,
      challengeUntil,
    });
    const basisDigest = sha256(basis);
    const id = `ctrltrans_${randomUUID()}`;

    const rows = await tx.$queryRaw<ActorControlTransitionRow[]>(Prisma.sql`
      INSERT INTO "ActorControlTransition" (
        "id", "actorId", "fromEpochId", "policyId", "kind", "status",
        "proposedControllerType", "proposedControllerRef", "proposedKeyStateDigest",
        "sourceEvidenceArtifactId", "policyDigest", "proposedAt", "challengeUntil",
        "basisDigest", "idempotencyKey", "metadata"
      ) VALUES (
        ${id}, ${input.actorId}, ${current.id}, ${policy.id}, ${input.kind}, 'PROPOSED',
        ${proposedControllerType}, ${proposedControllerRef}, ${input.proposedKeyStateDigest ?? null},
        ${input.sourceEvidenceArtifactId}, ${policy.policyDigest}, ${proposedAt}, ${challengeUntil},
        ${basisDigest}, ${input.idempotencyKey}, ${json(input.metadata ?? {})}
      ) RETURNING *
    `);
    return { replayed: false, transition: rows[0]! };
  });
}

export async function recordActorControlApproval(input: RecordActorControlApprovalInput) {
  const principalType = normalizeText(input.principalType, 'principalType').toLowerCase();
  const principalRef = normalizeText(input.principalRef, 'principalRef');
  const observedAt = input.observedAt ?? new Date();

  return db.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ActorControlTransition" WHERE "id" = ${input.transitionId} FOR UPDATE
    `);
    const transitionRows = await tx.$queryRaw<ActorControlTransitionRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlTransition" WHERE "id" = ${input.transitionId} LIMIT 1
    `);
    const transition = transitionRows[0];
    if (!transition) {
      throw Object.assign(new Error('Control transition not found.'), { statusCode: 404 });
    }
    if (transition.status !== 'PROPOSED') {
      throw new ControlContinuityConflictError('Only proposed control transitions accept approvals.');
    }
    await assertEvidenceExists(tx, input.sourceEvidenceArtifactId);

    const guardianRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ActorControlGuardian"
      WHERE "policyId" = ${transition.policyId}
        AND "principalType" = ${principalType}
        AND "principalRef" = ${principalRef}
      LIMIT 1
    `);
    if (guardianRows.length !== 1) {
      throw Object.assign(new Error('Approval principal is not a guardian for this policy.'), {
        statusCode: 403,
      });
    }

    const existingRows = await tx.$queryRaw<ActorControlApprovalRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlApproval" WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
    `);
    const existing = existingRows[0];
    if (existing) {
      const same =
        existing.transitionId === input.transitionId &&
        existing.principalType === principalType &&
        existing.principalRef === principalRef &&
        existing.disposition === input.disposition &&
        existing.sourceEvidenceArtifactId === input.sourceEvidenceArtifactId;
      if (!same) {
        throw new ControlContinuityConflictError(
          'Control-approval idempotency key was reused with different input.',
        );
      }
      return { replayed: true, approval: existing };
    }

    const basis = approvalBasis({
      transitionId: input.transitionId,
      principalType,
      principalRef,
      disposition: input.disposition,
      sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
      observedAt,
    });
    const basisDigest = sha256(basis);
    const id = `ctrlappr_${randomUUID()}`;
    try {
      const rows = await tx.$queryRaw<ActorControlApprovalRow[]>(Prisma.sql`
        INSERT INTO "ActorControlApproval" (
          "id", "transitionId", "principalType", "principalRef", "disposition",
          "sourceEvidenceArtifactId", "observedAt", "basisDigest", "idempotencyKey", "metadata"
        ) VALUES (
          ${id}, ${input.transitionId}, ${principalType}, ${principalRef}, ${input.disposition},
          ${input.sourceEvidenceArtifactId}, ${observedAt}, ${basisDigest}, ${input.idempotencyKey},
          ${json(input.metadata ?? {})}
        ) RETURNING *
      `);
      return { replayed: false, approval: rows[0]! };
    } catch (error) {
      if (error instanceof Error && error.message.includes('ActorControlApproval_transition_principal_key')) {
        throw new ControlContinuityConflictError(
          'Guardian already recorded a disposition for this control transition.',
        );
      }
      throw error;
    }
  });
}

export async function finalizeActorControlTransition(
  transitionId: string,
  registry: ControlRegistryContext,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const initialRows = await tx.$queryRaw<Array<{ actorId: string }>>(Prisma.sql`
      SELECT "actorId" FROM "ActorControlTransition" WHERE "id" = ${transitionId} LIMIT 1
    `);
    const initial = initialRows[0];
    if (!initial) {
      throw Object.assign(new Error('Control transition not found.'), { statusCode: 404 });
    }

    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Actor" WHERE "id" = ${initial.actorId} FOR UPDATE
    `);
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ActorControlTransition" WHERE "id" = ${transitionId} FOR UPDATE
    `);

    const transitionRows = await tx.$queryRaw<ActorControlTransitionRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlTransition" WHERE "id" = ${transitionId} LIMIT 1
    `);
    const transition = transitionRows[0]!;
    if (transition.status === 'ACCEPTED') {
      const epochRows = await tx.$queryRaw<ActorControlEpochRow[]>(Prisma.sql`
        SELECT * FROM "ActorControlEpoch" WHERE "id" = ${transition.resultingEpochId} LIMIT 1
      `);
      return { replayed: true, accepted: true, transition, epoch: epochRows[0] ?? null };
    }
    if (transition.status !== 'PROPOSED') {
      return { replayed: true, accepted: false, transition, epoch: null };
    }

    const policy = await getControlPolicy(tx, transition.policyId);
    if (!policy) throw new ControlContinuityConflictError('Control policy is missing.');
    if (policy.policyDigest !== transition.policyDigest) {
      throw new ControlContinuityConflictError('Transition policy digest no longer matches captured policy.');
    }

    const approvals = await tx.$queryRaw<ActorControlApprovalRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlApproval"
      WHERE "transitionId" = ${transition.id}
      ORDER BY "observedAt", "id"
    `);
    const objections = approvals.filter((approval) => approval.disposition === 'OBJECT');
    if (objections.length > 0 && policy.objectionMode === 'VETO') {
      const rejectedRows = await tx.$queryRaw<ActorControlTransitionRow[]>(Prisma.sql`
        UPDATE "ActorControlTransition"
        SET "status" = 'REJECTED', "decidedAt" = ${now},
            "decisionReason" = 'guardian objection under VETO policy'
        WHERE "id" = ${transition.id}
        RETURNING *
      `);
      return { replayed: false, accepted: false, transition: rejectedRows[0]!, epoch: null };
    }

    const approvalCount = approvals.filter((approval) => approval.disposition === 'APPROVE').length;
    if (approvalCount < policy.threshold) {
      throw new ControlContinuityConflictError(
        `Control transition requires ${policy.threshold} approvals; ${approvalCount} recorded.`,
      );
    }
    if (transition.kind !== 'QUARANTINE' && now.getTime() < transition.challengeUntil.getTime()) {
      throw new ControlContinuityConflictError('Control transition challenge window has not elapsed.');
    }

    const current = await getCurrentEpoch(tx, transition.actorId);
    if (!current || current.id !== transition.fromEpochId) {
      const expiredRows = await tx.$queryRaw<ActorControlTransitionRow[]>(Prisma.sql`
        UPDATE "ActorControlTransition"
        SET "status" = 'EXPIRED', "decidedAt" = ${now},
            "decisionReason" = 'predecessor control epoch is no longer current'
        WHERE "id" = ${transition.id}
        RETURNING *
      `);
      return { replayed: false, accepted: false, transition: expiredRows[0]!, epoch: null };
    }

    if (transition.kind === 'RESTORE' && current.state !== 'QUARANTINED') {
      throw new ControlContinuityConflictError('RESTORE predecessor is not quarantined.');
    }

    const nextEpoch = current.epoch + 1;
    const nextState: ControlEpochState = transition.kind === 'QUARANTINE' ? 'QUARANTINED' : 'ACTIVE';
    const controllerType =
      transition.kind === 'QUARANTINE' ? current.controllerType : transition.proposedControllerType;
    const controllerRef =
      transition.kind === 'QUARANTINE' ? current.controllerRef : transition.proposedControllerRef;
    if (!controllerType || !controllerRef) {
      throw new ControlContinuityConflictError('Accepted transition is missing its resulting controller.');
    }
    const keyStateDigest =
      transition.kind === 'QUARANTINE'
        ? current.keyStateDigest
        : (transition.proposedKeyStateDigest ?? current.keyStateDigest);

    const nextBasis = epochBasis({
      actorId: transition.actorId,
      policyId: transition.policyId,
      epoch: nextEpoch,
      controllerType,
      controllerRef,
      state: nextState,
      keyStateDigest,
      sourceEvidenceArtifactId: transition.sourceEvidenceArtifactId,
      externalFramework: null,
      externalReference: null,
      startedAt: now,
    });
    const nextBasisDigest = sha256(nextBasis);
    const nextEpochId = `ctrlepoch_${randomUUID()}`;

    await tx.$executeRaw(Prisma.sql`
      UPDATE "ActorControlEpoch" SET "endedAt" = ${now}
      WHERE "id" = ${current.id} AND "endedAt" IS NULL
    `);
    const epochRows = await tx.$queryRaw<ActorControlEpochRow[]>(Prisma.sql`
      INSERT INTO "ActorControlEpoch" (
        "id", "actorId", "policyId", "epoch", "controllerType", "controllerRef", "state",
        "keyStateDigest", "sourceEvidenceArtifactId", "externalFramework", "externalReference",
        "startedAt", "basisDigest", "idempotencyKey", "metadata"
      ) VALUES (
        ${nextEpochId}, ${transition.actorId}, ${transition.policyId}, ${nextEpoch},
        ${controllerType}, ${controllerRef}, ${nextState}, ${keyStateDigest},
        ${transition.sourceEvidenceArtifactId}, NULL, NULL, ${now}, ${nextBasisDigest},
        ${`control-transition-epoch:${transition.id}`},
        ${json({ transitionId: transition.id, transitionKind: transition.kind })}
      ) RETURNING *
    `);
    const epoch = epochRows[0]!;

    const acceptedRows = await tx.$queryRaw<ActorControlTransitionRow[]>(Prisma.sql`
      UPDATE "ActorControlTransition"
      SET "status" = 'ACCEPTED', "decidedAt" = ${now}, "decisionReason" = 'policy satisfied',
          "resultingEpochId" = ${epoch.id}
      WHERE "id" = ${transition.id}
      RETURNING *
    `);
    const accepted = acceptedRows[0]!;

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: transition.actorId,
        type: `actor.control.${transition.kind.toLowerCase()}.accepted`,
        sourceKey: `control-transition:${transition.id}`,
        occurredAt: now,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          controlTransitionId: transition.id,
          transitionKind: transition.kind.toLowerCase(),
          transitionBasisDigest: transition.basisDigest,
          fromEpoch: current.epoch,
          toEpoch: epoch.epoch,
          controlState: epoch.state.toLowerCase(),
          policyId: transition.policyId,
          policyDigest: transition.policyDigest,
          controllerChanged:
            current.controllerType !== epoch.controllerType || current.controllerRef !== epoch.controllerRef,
          keyStateChanged: current.keyStateDigest !== epoch.keyStateDigest,
          approvalCount,
        },
      },
      registry.signingSecret,
    );

    return { replayed: false, accepted: true, transition: accepted, epoch };
  });
}

export async function getActorControlFull(actorId: string) {
  const actor = await db.actor.findUnique({
    where: { id: actorId },
    select: { id: true, handle: true, displayName: true },
  });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });

  const [policies, guardians, epochs, transitions, approvals] = await Promise.all([
    db.$queryRaw<ActorControlPolicyRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlPolicy" WHERE "actorId" = ${actorId}
      ORDER BY "version", "id"
    `),
    db.$queryRaw<ActorControlGuardianRow[]>(Prisma.sql`
      SELECT g.* FROM "ActorControlGuardian" g
      JOIN "ActorControlPolicy" p ON p."id" = g."policyId"
      WHERE p."actorId" = ${actorId}
      ORDER BY p."version", g."principalType", g."principalRef", g."id"
    `),
    db.$queryRaw<ActorControlEpochRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlEpoch" WHERE "actorId" = ${actorId}
      ORDER BY "epoch", "id"
    `),
    db.$queryRaw<ActorControlTransitionRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlTransition" WHERE "actorId" = ${actorId}
      ORDER BY "proposedAt", "id"
    `),
    db.$queryRaw<ActorControlApprovalRow[]>(Prisma.sql`
      SELECT a.* FROM "ActorControlApproval" a
      JOIN "ActorControlTransition" t ON t."id" = a."transitionId"
      WHERE t."actorId" = ${actorId}
      ORDER BY a."observedAt", a."id"
    `),
  ]);

  return { version: 'noeone.control-continuity-full.v1' as const, actor, policies, guardians, epochs, transitions, approvals };
}

export async function getActorControlSummaryByHandle(handle: string) {
  const actor = await db.actor.findUnique({
    where: { handle },
    select: { id: true, handle: true, displayName: true },
  });
  if (!actor) throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });

  const [epochRows, policyRows, guardianCountRows, counts] = await Promise.all([
    db.$queryRaw<ActorControlEpochRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlEpoch"
      WHERE "actorId" = ${actor.id} AND "endedAt" IS NULL LIMIT 1
    `),
    db.$queryRaw<ActorControlPolicyRow[]>(Prisma.sql`
      SELECT * FROM "ActorControlPolicy"
      WHERE "actorId" = ${actor.id} AND "retiredAt" IS NULL LIMIT 1
    `),
    db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count" FROM "ActorControlGuardian" g
      JOIN "ActorControlPolicy" p ON p."id" = g."policyId"
      WHERE p."actorId" = ${actor.id} AND p."retiredAt" IS NULL
    `),
    db.$queryRaw<Array<{ epochs: number; transitions: number; recoveries: number; quarantines: number }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "ActorControlEpoch" WHERE "actorId" = ${actor.id}) AS "epochs",
        (SELECT COUNT(*)::int FROM "ActorControlTransition" WHERE "actorId" = ${actor.id}) AS "transitions",
        (SELECT COUNT(*)::int FROM "ActorControlTransition" WHERE "actorId" = ${actor.id} AND "kind" = 'RECOVERY' AND "status" = 'ACCEPTED') AS "recoveries",
        (SELECT COUNT(*)::int FROM "ActorControlTransition" WHERE "actorId" = ${actor.id} AND "kind" = 'QUARANTINE' AND "status" = 'ACCEPTED') AS "quarantines"
    `),
  ]);
  const epoch = epochRows[0] ?? null;
  const policy = policyRows[0] ?? null;
  const count = counts[0] ?? { epochs: 0, transitions: 0, recoveries: 0, quarantines: 0 };

  return {
    version: 'noeone.control-continuity.v1' as const,
    actor,
    configured: Boolean(epoch && policy),
    control: epoch
      ? {
          epoch: epoch.epoch,
          state: epoch.state.toLowerCase(),
          controllerType: epoch.controllerType,
          keyStateDigest: epoch.keyStateDigest,
          basisDigest: epoch.basisDigest,
          startedAt: epoch.startedAt,
        }
      : null,
    policy: policy
      ? {
          version: policy.version,
          threshold: policy.threshold,
          guardianCount: guardianCountRows[0]?.count ?? 0,
          challengeWindowSeconds: policy.challengeWindowSeconds,
          objectionMode: policy.objectionMode.toLowerCase(),
          policyDigest: policy.policyDigest,
          effectiveAt: policy.effectiveAt,
        }
      : null,
    history: count,
  };
}

export async function verifyActorControlHistory(actorId: string) {
  const full = await getActorControlFull(actorId);
  const issues: string[] = [];

  const guardiansByPolicy = new Map<string, ActorControlGuardianRow[]>();
  for (const guardian of full.guardians) {
    const list = guardiansByPolicy.get(guardian.policyId) ?? [];
    list.push(guardian);
    guardiansByPolicy.set(guardian.policyId, list);
  }

  for (const policy of full.policies) {
    const guardians = (guardiansByPolicy.get(policy.id) ?? []).map(
      ({ principalType, principalRef, role }) => ({ principalType, principalRef, role }),
    );
    if (policy.threshold < 1 || policy.threshold > guardians.length) {
      issues.push(`policy ${policy.id} threshold exceeds guardian set`);
    }
    const digest = sha256(
      policyBasis({
        actorId: policy.actorId,
        version: policy.version,
        threshold: policy.threshold,
        challengeWindowSeconds: policy.challengeWindowSeconds,
        objectionMode: policy.objectionMode,
        guardians,
        sourceEvidenceArtifactId: policy.sourceEvidenceArtifactId,
        externalFramework: policy.externalFramework,
        externalReference: policy.externalReference,
        effectiveAt: policy.effectiveAt,
      }),
    );
    if (digest !== policy.policyDigest) issues.push(`policy ${policy.id} digest mismatch`);
  }

  let openEpochs = 0;
  for (let index = 0; index < full.epochs.length; index += 1) {
    const epoch = full.epochs[index]!;
    if (epoch.epoch !== index + 1) issues.push(`epoch sequence gap at ${epoch.id}`);
    if (epoch.endedAt === null) openEpochs += 1;
    const digest = sha256(
      epochBasis({
        actorId: epoch.actorId,
        policyId: epoch.policyId,
        epoch: epoch.epoch,
        controllerType: epoch.controllerType,
        controllerRef: epoch.controllerRef,
        state: epoch.state,
        keyStateDigest: epoch.keyStateDigest,
        sourceEvidenceArtifactId: epoch.sourceEvidenceArtifactId,
        externalFramework: epoch.externalFramework,
        externalReference: epoch.externalReference,
        startedAt: epoch.startedAt,
      }),
    );
    if (digest !== epoch.basisDigest) issues.push(`epoch ${epoch.id} digest mismatch`);
    const next = full.epochs[index + 1];
    if (next && (!epoch.endedAt || epoch.endedAt.getTime() !== next.startedAt.getTime())) {
      issues.push(`epoch ${epoch.id} does not close exactly at successor start`);
    }
  }
  if (full.epochs.length > 0 && openEpochs !== 1) {
    issues.push(`expected exactly one current control epoch, found ${openEpochs}`);
  }

  const policyById = new Map(full.policies.map((policy) => [policy.id, policy]));
  const epochById = new Map(full.epochs.map((epoch) => [epoch.id, epoch]));
  for (const transition of full.transitions) {
    const policy = policyById.get(transition.policyId);
    const fromEpoch = epochById.get(transition.fromEpochId);
    if (!policy) issues.push(`transition ${transition.id} policy missing`);
    if (!fromEpoch || fromEpoch.actorId !== transition.actorId) {
      issues.push(`transition ${transition.id} predecessor mismatch`);
    }
    if (policy && policy.policyDigest !== transition.policyDigest) {
      issues.push(`transition ${transition.id} captured policy digest mismatch`);
    }
    const digest = sha256(
      transitionBasis({
        actorId: transition.actorId,
        fromEpochId: transition.fromEpochId,
        policyId: transition.policyId,
        kind: transition.kind,
        proposedControllerType: transition.proposedControllerType,
        proposedControllerRef: transition.proposedControllerRef,
        proposedKeyStateDigest: transition.proposedKeyStateDigest,
        sourceEvidenceArtifactId: transition.sourceEvidenceArtifactId,
        policyDigest: transition.policyDigest,
        proposedAt: transition.proposedAt,
        challengeUntil: transition.challengeUntil,
      }),
    );
    if (digest !== transition.basisDigest) issues.push(`transition ${transition.id} digest mismatch`);
    if (transition.status === 'ACCEPTED' && !transition.resultingEpochId) {
      issues.push(`accepted transition ${transition.id} missing resulting epoch`);
    }
  }

  const transitionById = new Map(full.transitions.map((transition) => [transition.id, transition]));
  const guardianKeysByPolicy = new Map(
    full.policies.map((policy) => [
      policy.id,
      new Set(
        (guardiansByPolicy.get(policy.id) ?? []).map(
          (guardian) => `${guardian.principalType}\u0000${guardian.principalRef}`,
        ),
      ),
    ]),
  );
  for (const approval of full.approvals) {
    const transition = transitionById.get(approval.transitionId);
    if (!transition) {
      issues.push(`approval ${approval.id} transition missing`);
      continue;
    }
    const guardianKey = `${approval.principalType}\u0000${approval.principalRef}`;
    if (!guardianKeysByPolicy.get(transition.policyId)?.has(guardianKey)) {
      issues.push(`approval ${approval.id} principal was not a policy guardian`);
    }
    const digest = sha256(
      approvalBasis({
        transitionId: approval.transitionId,
        principalType: approval.principalType,
        principalRef: approval.principalRef,
        disposition: approval.disposition,
        sourceEvidenceArtifactId: approval.sourceEvidenceArtifactId,
        observedAt: approval.observedAt,
      }),
    );
    if (digest !== approval.basisDigest) issues.push(`approval ${approval.id} digest mismatch`);
  }

  const current = full.epochs.find((epoch) => epoch.endedAt === null) ?? null;
  return {
    version: 'noeone.control-continuity-verification.v1' as const,
    actorId,
    valid: issues.length === 0,
    issues,
    policyCount: full.policies.length,
    epochCount: full.epochs.length,
    transitionCount: full.transitions.length,
    approvalCount: full.approvals.length,
    currentEpoch: current?.epoch ?? null,
    currentState: current?.state.toLowerCase() ?? null,
    currentBasisDigest: current?.basisDigest ?? null,
  };
}

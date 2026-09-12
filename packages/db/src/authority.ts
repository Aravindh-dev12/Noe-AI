import { createHash, randomUUID } from 'node:crypto';
import type {
  AuthorityGrant,
  AuthorityGrantStatus,
  AuthorityGrantTransition,
  Prisma,
} from '@prisma/client';
import { canonicalJson } from '@onbae/event-model';

import type { RegistryContext } from './continuity.js';
import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

export type AuthorityPrincipal = {
  type: 'user' | 'admin' | 'provider' | 'system';
  id?: string | null;
};

export type AuthorityGrantor = {
  type: 'user' | 'actor' | 'external' | 'admin' | 'system';
  ref: string;
};

export type CreateAuthorityGrantInput = {
  subjectActorId: string;
  parentGrantId?: string | null;
  grantor?: AuthorityGrantor;
  actions: string[];
  resources: string[];
  canRedelegate?: boolean;
  remainingDelegationDepth?: number;
  maxAmountMinor?: string | null;
  currency?: string | null;
  notBefore?: Date;
  expiresAt?: Date | null;
  externalFramework?: string | null;
  externalReference?: string | null;
  sourceEvidenceArtifactId?: string | null;
  principal: AuthorityPrincipal;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
  now?: Date;
};

export type RevokeAuthorityGrantInput = {
  grantId: string;
  reason?: string | null;
  principal: AuthorityPrincipal;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonObject;
  now?: Date;
};

export type AuthorityRequest = {
  action: string;
  resource: string;
  amountMinor?: string | null;
  currency?: string | null;
  at?: Date;
};

export type AuthorityEvaluation = {
  allowed: boolean;
  grantId: string;
  subjectActorId: string;
  chain: string[];
  reasons: string[];
};

export class AuthorityConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'AuthorityConflictError';
  }
}

export class AuthorityValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'AuthorityValidationError';
  }
}

function normalizeStringSet(values: string[], field: string): string[] {
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
  if (normalized.length === 0) {
    throw new AuthorityValidationError(`${field} must contain at least one value.`);
  }
  if (normalized.some((value) => value.length > 240)) {
    throw new AuthorityValidationError(`${field} values must be at most 240 characters.`);
  }
  return normalized;
}

function normalizeMoney(
  amountMinor?: string | null,
  currency?: string | null,
): { amountMinor: string | null; currency: string | null } {
  const amount = amountMinor ?? null;
  const code = currency?.trim().toUpperCase() ?? null;
  if ((amount === null) !== (code === null)) {
    throw new AuthorityValidationError('maxAmountMinor and currency must be supplied together.');
  }
  if (amount !== null && !/^(0|[1-9][0-9]*)$/.test(amount)) {
    throw new AuthorityValidationError('maxAmountMinor must be a non-negative integer string.');
  }
  if (code !== null && !/^[A-Z]{3}$/.test(code)) {
    throw new AuthorityValidationError('currency must be a three-letter uppercase code.');
  }
  return { amountMinor: amount, currency: code };
}

function setAllows(scope: string[], value: string): boolean {
  return scope.includes('*') || scope.includes(value);
}

export function isAuthoritySetSubset(parent: string[], child: string[]): boolean {
  if (parent.includes('*')) return true;
  if (child.includes('*')) return false;
  const allowed = new Set(parent);
  return child.every((value) => allowed.has(value));
}

function scopeDigest(grant: {
  actions: string[];
  resources: string[];
  canRedelegate: boolean;
  remainingDelegationDepth: number;
  maxAmountMinor: string | null;
  currency: string | null;
  notBefore: Date;
  expiresAt: Date | null;
}): string {
  const body = canonicalJson({
    actions: grant.actions,
    resources: grant.resources,
    canRedelegate: grant.canRedelegate,
    remainingDelegationDepth: grant.remainingDelegationDepth,
    maxAmountMinor: grant.maxAmountMinor,
    currency: grant.currency,
    notBefore: grant.notBefore.toISOString(),
    expiresAt: grant.expiresAt?.toISOString() ?? null,
  });
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

function assertDelegationShape(input: {
  canRedelegate: boolean;
  remainingDelegationDepth: number;
  notBefore: Date;
  expiresAt: Date | null;
}): void {
  if (!Number.isInteger(input.remainingDelegationDepth) || input.remainingDelegationDepth < 0) {
    throw new AuthorityValidationError('remainingDelegationDepth must be a non-negative integer.');
  }
  if (input.remainingDelegationDepth > 32) {
    throw new AuthorityValidationError('remainingDelegationDepth cannot exceed 32.');
  }
  if (!input.canRedelegate && input.remainingDelegationDepth !== 0) {
    throw new AuthorityValidationError(
      'A grant that cannot re-delegate must have remainingDelegationDepth = 0.',
    );
  }
  if (input.canRedelegate && input.remainingDelegationDepth < 1) {
    throw new AuthorityValidationError(
      'A grant that can re-delegate must have remainingDelegationDepth >= 1.',
    );
  }
  if (input.expiresAt && input.expiresAt.getTime() <= input.notBefore.getTime()) {
    throw new AuthorityValidationError('expiresAt must be later than notBefore.');
  }
}

export function assertAuthorityAttenuation(
  parent: Pick<
    AuthorityGrant,
    | 'actions'
    | 'resources'
    | 'canRedelegate'
    | 'remainingDelegationDepth'
    | 'maxAmountMinor'
    | 'currency'
    | 'notBefore'
    | 'expiresAt'
  >,
  child: {
    actions: string[];
    resources: string[];
    canRedelegate: boolean;
    remainingDelegationDepth: number;
    maxAmountMinor: string | null;
    currency: string | null;
    notBefore: Date;
    expiresAt: Date | null;
  },
): void {
  if (!parent.canRedelegate || parent.remainingDelegationDepth < 1) {
    throw new AuthorityConflictError('Parent authority does not permit further delegation.');
  }
  if (!isAuthoritySetSubset(parent.actions, child.actions)) {
    throw new AuthorityConflictError('Child actions exceed the parent authority scope.');
  }
  if (!isAuthoritySetSubset(parent.resources, child.resources)) {
    throw new AuthorityConflictError('Child resources exceed the parent authority scope.');
  }
  if (child.notBefore.getTime() < parent.notBefore.getTime()) {
    throw new AuthorityConflictError('Child authority cannot start before its parent authority.');
  }
  if (parent.expiresAt) {
    if (!child.expiresAt || child.expiresAt.getTime() > parent.expiresAt.getTime()) {
      throw new AuthorityConflictError('Child authority cannot outlive its parent authority.');
    }
  }
  if (parent.maxAmountMinor !== null) {
    if (child.maxAmountMinor === null || child.currency !== parent.currency) {
      throw new AuthorityConflictError(
        'Child monetary authority must preserve the parent currency and an equal-or-lower cap.',
      );
    }
    if (BigInt(child.maxAmountMinor) > BigInt(parent.maxAmountMinor)) {
      throw new AuthorityConflictError('Child monetary authority exceeds its parent cap.');
    }
  }
  if (child.canRedelegate && child.remainingDelegationDepth >= parent.remainingDelegationDepth) {
    throw new AuthorityConflictError(
      'Child delegation depth must be strictly smaller than the parent delegation depth.',
    );
  }
  if (!child.canRedelegate && child.remainingDelegationDepth !== 0) {
    throw new AuthorityConflictError(
      'A non-delegable child grant must have remainingDelegationDepth = 0.',
    );
  }
}

function lifecycleIssues(chain: AuthorityGrant[], at: Date): string[] {
  const issues: string[] = [];
  for (const grant of chain) {
    if (grant.status !== 'ACTIVE') {
      issues.push(`grant ${grant.id} is ${grant.status.toLowerCase()}`);
    }
    if (at.getTime() < grant.notBefore.getTime()) {
      issues.push(`grant ${grant.id} is not active yet`);
    }
    if (grant.expiresAt && at.getTime() >= grant.expiresAt.getTime()) {
      issues.push(`grant ${grant.id} is expired`);
    }
  }
  return issues;
}

export function evaluateAuthorityChainRecords(
  chain: AuthorityGrant[],
  request: AuthorityRequest,
): AuthorityEvaluation {
  if (chain.length === 0) {
    return {
      allowed: false,
      grantId: '',
      subjectActorId: '',
      chain: [],
      reasons: ['authority chain is empty'],
    };
  }

  const at = request.at ?? new Date();
  const reasons = lifecycleIssues(chain, at);
  const amount = request.amountMinor ?? null;
  const currency = request.currency?.toUpperCase() ?? null;

  if ((amount === null) !== (currency === null)) {
    reasons.push('amountMinor and currency must be supplied together');
  } else if (amount !== null && !/^(0|[1-9][0-9]*)$/.test(amount)) {
    reasons.push('amountMinor is not a non-negative integer string');
  }

  for (const grant of chain) {
    if (!setAllows(grant.actions, request.action)) {
      reasons.push(`grant ${grant.id} does not allow action ${request.action}`);
    }
    if (!setAllows(grant.resources, request.resource)) {
      reasons.push(`grant ${grant.id} does not allow resource ${request.resource}`);
    }
    if (amount !== null && currency !== null && grant.maxAmountMinor !== null) {
      if (grant.currency !== currency) {
        reasons.push(`grant ${grant.id} does not authorize currency ${currency}`);
      } else if (BigInt(amount) > BigInt(grant.maxAmountMinor)) {
        reasons.push(`grant ${grant.id} monetary cap is exceeded`);
      }
    }
  }

  const leaf = chain[chain.length - 1]!;
  return {
    allowed: reasons.length === 0,
    grantId: leaf.id,
    subjectActorId: leaf.subjectActorId,
    chain: chain.map((grant) => grant.id),
    reasons,
  };
}

async function loadAuthorityChain(
  tx: Prisma.TransactionClient,
  grantId: string,
): Promise<AuthorityGrant[]> {
  const reversed: AuthorityGrant[] = [];
  const seen = new Set<string>();
  let cursor: string | null = grantId;

  while (cursor) {
    if (seen.has(cursor)) {
      throw new AuthorityConflictError('Authority grant ancestry contains a cycle.');
    }
    if (seen.size >= 32) {
      throw new AuthorityConflictError('Authority grant ancestry exceeds the maximum depth.');
    }
    seen.add(cursor);
    const grant: AuthorityGrant | null = await tx.authorityGrant.findUnique({
      where: { id: cursor },
    });
    if (!grant) {
      throw Object.assign(new Error('Authority grant not found.'), { statusCode: 404 });
    }
    reversed.push(grant);
    cursor = grant.parentGrantId;
  }

  return reversed.reverse();
}

type NormalizedGrant = {
  grantor: AuthorityGrantor;
  actions: string[];
  resources: string[];
  canRedelegate: boolean;
  remainingDelegationDepth: number;
  maxAmountMinor: string | null;
  currency: string | null;
};

function sameGrant(
  existing: AuthorityGrant,
  input: CreateAuthorityGrantInput,
  normalized: NormalizedGrant,
): boolean {
  return (
    existing.subjectActorId === input.subjectActorId &&
    existing.parentGrantId === (input.parentGrantId ?? null) &&
    existing.grantorType === normalized.grantor.type &&
    existing.grantorRef === normalized.grantor.ref &&
    canonicalJson(existing.actions) === canonicalJson(normalized.actions) &&
    canonicalJson(existing.resources) === canonicalJson(normalized.resources) &&
    existing.canRedelegate === normalized.canRedelegate &&
    existing.remainingDelegationDepth === normalized.remainingDelegationDepth &&
    existing.maxAmountMinor === normalized.maxAmountMinor &&
    existing.currency === normalized.currency &&
    (input.notBefore === undefined || existing.notBefore.getTime() === input.notBefore.getTime()) &&
    (input.expiresAt === undefined ||
      existing.expiresAt?.getTime() === input.expiresAt?.getTime()) &&
    existing.externalFramework === (input.externalFramework ?? null) &&
    existing.externalReference === (input.externalReference ?? null) &&
    existing.sourceEvidenceArtifactId === (input.sourceEvidenceArtifactId ?? null) &&
    existing.issuedByType === input.principal.type &&
    existing.issuedById === (input.principal.id ?? null) &&
    canonicalJson(existing.metadata) === canonicalJson(input.metadata ?? {})
  );
}

async function resolveGrantor(
  tx: Prisma.TransactionClient,
  input: CreateAuthorityGrantInput,
): Promise<{ parent: AuthorityGrant | null; grantor: AuthorityGrantor }> {
  if (input.parentGrantId) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "AuthorityGrant" WHERE "id" = ${input.parentGrantId} FOR UPDATE
    `;
    const parent: AuthorityGrant | null = await tx.authorityGrant.findUnique({
      where: { id: input.parentGrantId },
    });
    if (!parent) {
      throw Object.assign(new Error('Parent authority grant not found.'), { statusCode: 404 });
    }
    return { parent, grantor: { type: 'actor', ref: parent.subjectActorId } };
  }

  if (!input.grantor) {
    throw new AuthorityValidationError('Root authority requires a grantor.');
  }
  const ref = input.grantor.ref.trim();
  if (!ref) {
    throw new AuthorityValidationError('grantor.ref is required.');
  }
  const grantor = { type: input.grantor.type, ref } satisfies AuthorityGrantor;

  if (grantor.type === 'actor') {
    const grantorActor = await tx.actor.findUnique({
      where: { id: grantor.ref },
      select: { id: true },
    });
    if (!grantorActor) {
      throw Object.assign(new Error('Grantor actor not found.'), { statusCode: 404 });
    }
  }

  return { parent: null, grantor };
}

export async function createAuthorityGrant(
  input: CreateAuthorityGrantInput,
  registry: RegistryContext,
): Promise<{
  grant: AuthorityGrant;
  transition: AuthorityGrantTransition;
  replayed: boolean;
}> {
  const actions = normalizeStringSet(input.actions, 'actions');
  const resources = normalizeStringSet(input.resources, 'resources');
  const money = normalizeMoney(input.maxAmountMinor, input.currency);
  const now = input.now ?? new Date();
  const notBefore = input.notBefore ?? now;
  const expiresAt = input.expiresAt ?? null;
  const canRedelegate = input.canRedelegate ?? false;
  const remainingDelegationDepth = input.remainingDelegationDepth ?? 0;
  assertDelegationShape({ canRedelegate, remainingDelegationDepth, notBefore, expiresAt });

  return db.$transaction(async (tx) => {
    const lockedActors = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${input.subjectActorId} FOR UPDATE
    `;
    if (lockedActors.length !== 1) {
      throw Object.assign(new Error('Authority subject actor not found.'), { statusCode: 404 });
    }

    const { parent, grantor } = await resolveGrantor(tx, input);
    const normalized: NormalizedGrant = {
      grantor,
      actions,
      resources,
      canRedelegate,
      remainingDelegationDepth,
      maxAmountMinor: money.amountMinor,
      currency: money.currency,
    };

    // Idempotent replays are historical lookups: they must not begin failing
    // merely because a parent grant was later revoked or expired.
    const existing = await tx.authorityGrant.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: {
        transitions: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 1 },
      },
    });
    if (existing) {
      if (!sameGrant(existing, input, normalized)) {
        throw new AuthorityConflictError(
          `Authority idempotency key ${input.idempotencyKey} was reused with conflicting data.`,
        );
      }
      const transition = existing.transitions[0];
      if (!transition) {
        throw new AuthorityConflictError('Existing authority grant is missing its opening transition.');
      }
      return { grant: existing, transition, replayed: true };
    }

    if (parent) {
      const parentChain = await loadAuthorityChain(tx, parent.id);
      const parentIssues = lifecycleIssues(parentChain, now);
      if (parentIssues.length > 0) {
        throw new AuthorityConflictError(
          `Parent authority is not currently effective: ${parentIssues.join('; ')}.`,
        );
      }
      assertAuthorityAttenuation(parent, {
        actions,
        resources,
        canRedelegate,
        remainingDelegationDepth,
        maxAmountMinor: money.amountMinor,
        currency: money.currency,
        notBefore,
        expiresAt,
      });
    }

    if (input.sourceEvidenceArtifactId) {
      const artifact = await tx.evidenceArtifact.findUnique({
        where: { id: input.sourceEvidenceArtifactId },
        select: { id: true },
      });
      if (!artifact) {
        throw Object.assign(new Error('Source evidence artifact not found.'), { statusCode: 404 });
      }
    }

    const grant = await tx.authorityGrant.create({
      data: {
        id: `auth_${randomUUID()}`,
        subjectActorId: input.subjectActorId,
        parentGrantId: parent?.id ?? null,
        grantorType: grantor.type,
        grantorRef: grantor.ref,
        status: 'ACTIVE',
        actions,
        resources,
        canRedelegate,
        remainingDelegationDepth,
        maxAmountMinor: money.amountMinor,
        currency: money.currency,
        notBefore,
        expiresAt,
        externalFramework: input.externalFramework ?? null,
        externalReference: input.externalReference ?? null,
        sourceEvidenceArtifactId: input.sourceEvidenceArtifactId ?? null,
        issuedByType: input.principal.type,
        issuedById: input.principal.id ?? null,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      },
    });

    const transition = await tx.authorityGrantTransition.create({
      data: {
        id: `authx_${randomUUID()}`,
        grantId: grant.id,
        fromStatus: null,
        toStatus: 'ACTIVE',
        reason: parent ? 'delegated authority created' : 'root authority created',
        decidedByType: input.principal.type,
        decidedById: input.principal.id ?? null,
        idempotencyKey: `${input.idempotencyKey}:open`,
        occurredAt: now,
        metadata: {},
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: grant.subjectActorId,
        type: parent ? 'actor.authority.delegated' : 'actor.authority.granted',
        sourceKey: `authority:grant:${grant.id}:opened`,
        occurredAt: now,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          authorityGrantId: grant.id,
          parentGrantId: grant.parentGrantId,
          grantorType: grant.grantorType,
          actionCount: grant.actions.length,
          resourceCount: grant.resources.length,
          canRedelegate: grant.canRedelegate,
          remainingDelegationDepth: grant.remainingDelegationDepth,
          externalFramework: grant.externalFramework,
          sourceEvidenceArtifactId: grant.sourceEvidenceArtifactId,
          notBefore: grant.notBefore.toISOString(),
          expiresAt: grant.expiresAt?.toISOString() ?? null,
          scopeDigest: scopeDigest(grant),
        },
      },
      registry.signingSecret,
    );

    return { grant, transition, replayed: false };
  });
}

function sameRevocation(
  transition: AuthorityGrantTransition,
  input: RevokeAuthorityGrantInput,
): boolean {
  return (
    transition.grantId === input.grantId &&
    transition.toStatus === 'REVOKED' &&
    transition.reason === (input.reason ?? null) &&
    transition.decidedByType === input.principal.type &&
    transition.decidedById === (input.principal.id ?? null) &&
    canonicalJson(transition.metadata) === canonicalJson(input.metadata ?? {})
  );
}

export async function revokeAuthorityGrant(
  input: RevokeAuthorityGrantInput,
  registry: RegistryContext,
): Promise<{
  grant: AuthorityGrant;
  transition: AuthorityGrantTransition;
  replayed: boolean;
}> {
  return db.$transaction(async (tx) => {
    const existingTransition = await tx.authorityGrantTransition.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingTransition) {
      if (!sameRevocation(existingTransition, input)) {
        throw new AuthorityConflictError(
          `Authority revocation idempotency key ${input.idempotencyKey} was reused with conflicting data.`,
        );
      }
      const grant = await tx.authorityGrant.findUniqueOrThrow({
        where: { id: input.grantId },
      });
      return { grant, transition: existingTransition, replayed: true };
    }

    const initial = await tx.authorityGrant.findUnique({
      where: { id: input.grantId },
      select: { id: true, subjectActorId: true },
    });
    if (!initial) {
      throw Object.assign(new Error('Authority grant not found.'), { statusCode: 404 });
    }

    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Actor" WHERE "id" = ${initial.subjectActorId} FOR UPDATE
    `;
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "AuthorityGrant" WHERE "id" = ${input.grantId} FOR UPDATE
    `;

    const current = await tx.authorityGrant.findUniqueOrThrow({ where: { id: input.grantId } });
    if (current.status !== 'ACTIVE') {
      throw new AuthorityConflictError(`Authority grant ${current.id} is already revoked.`);
    }

    const now = input.now ?? new Date();
    const transition = await tx.authorityGrantTransition.create({
      data: {
        id: `authx_${randomUUID()}`,
        grantId: current.id,
        fromStatus: 'ACTIVE',
        toStatus: 'REVOKED',
        reason: input.reason ?? null,
        decidedByType: input.principal.type,
        decidedById: input.principal.id ?? null,
        idempotencyKey: input.idempotencyKey,
        occurredAt: now,
        metadata: input.metadata ?? {},
      },
    });

    const grant = await tx.authorityGrant.update({
      where: { id: current.id },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revokedByType: input.principal.type,
        revokedById: input.principal.id ?? null,
        revocationReason: input.reason ?? null,
      },
    });

    await appendCanonicalActorEvent(
      tx,
      {
        actorId: grant.subjectActorId,
        type: 'actor.authority.revoked',
        sourceKey: `authority:grant:${grant.id}:revoked`,
        occurredAt: now,
        hostId: registry.hostId,
        environmentVersion: registry.environmentVersion,
        issuer: registry.issuer,
        payload: {
          authorityGrantId: grant.id,
          parentGrantId: grant.parentGrantId,
          status: grant.status.toLowerCase(),
        },
      },
      registry.signingSecret,
    );

    return { grant, transition, replayed: false };
  });
}

export async function evaluateAuthorityGrant(
  grantId: string,
  request: AuthorityRequest,
): Promise<AuthorityEvaluation> {
  return db.$transaction(async (tx) => {
    const chain = await loadAuthorityChain(tx, grantId);
    return evaluateAuthorityChainRecords(chain, request);
  });
}

export async function evaluateActorAuthority(
  actorId: string,
  request: AuthorityRequest,
): Promise<{
  allowed: boolean;
  actorId: string;
  matchedGrantId: string | null;
  evaluations: AuthorityEvaluation[];
}> {
  return db.$transaction(async (tx) => {
    const actor = await tx.actor.findUnique({ where: { id: actorId }, select: { id: true } });
    if (!actor) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    const candidates = await tx.authorityGrant.findMany({
      where: { subjectActorId: actorId, status: 'ACTIVE' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
      take: 100,
    });

    const evaluations: AuthorityEvaluation[] = [];
    for (const candidate of candidates) {
      const chain = await loadAuthorityChain(tx, candidate.id);
      evaluations.push(evaluateAuthorityChainRecords(chain, request));
    }

    const matched = evaluations.find((evaluation) => evaluation.allowed) ?? null;
    return {
      allowed: matched !== null,
      actorId,
      matchedGrantId: matched?.grantId ?? null,
      evaluations,
    };
  });
}

function projectionIssues(
  grant: AuthorityGrant & { transitions: AuthorityGrantTransition[] },
): string[] {
  const issues: string[] = [];
  const ordered = [...grant.transitions].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id),
  );
  const opening = ordered[0];
  if (!opening || opening.fromStatus !== null || opening.toStatus !== 'ACTIVE') {
    issues.push(`grant ${grant.id} is missing a valid opening transition`);
  }
  const revocations = ordered.filter((transition) => transition.toStatus === 'REVOKED');
  if (grant.status === 'ACTIVE') {
    if (revocations.length > 0 || grant.revokedAt || grant.revokedByType) {
      issues.push(`grant ${grant.id} active projection disagrees with transition history`);
    }
  } else if (grant.status === 'REVOKED') {
    if (revocations.length !== 1 || !grant.revokedAt || !grant.revokedByType) {
      issues.push(`grant ${grant.id} revoked projection disagrees with transition history`);
    }
  }
  return issues;
}

export async function verifyAuthorityState(actorId: string): Promise<{
  version: 'noeone.authority.verify.v1';
  actorId: string;
  valid: boolean;
  grantCount: number;
  activeRowCount: number;
  effectiveActiveCount: number;
  issues: string[];
}> {
  return db.$transaction(async (tx) => {
    const actor = await tx.actor.findUnique({ where: { id: actorId }, select: { id: true } });
    if (!actor) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    const grants = await tx.authorityGrant.findMany({
      where: { subjectActorId: actorId },
      include: { transitions: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 1_000,
    });
    const issues: string[] = [];
    let effectiveActiveCount = 0;
    const now = new Date();

    for (const grant of grants) {
      issues.push(...projectionIssues(grant));
      let chain: AuthorityGrant[];
      try {
        chain = await loadAuthorityChain(tx, grant.id);
      } catch (error) {
        issues.push(
          error instanceof Error
            ? `grant ${grant.id} chain error: ${error.message}`
            : `grant ${grant.id} chain error`,
        );
        continue;
      }

      if (grant.parentGrantId) {
        const parent = chain[chain.length - 2];
        if (!parent) {
          issues.push(`grant ${grant.id} is missing its parent in the resolved chain`);
        } else {
          if (grant.grantorType !== 'actor' || grant.grantorRef !== parent.subjectActorId) {
            issues.push(`grant ${grant.id} grantor does not match its parent subject actor`);
          }
          try {
            assertAuthorityAttenuation(parent, grant);
          } catch (error) {
            issues.push(
              error instanceof Error
                ? `grant ${grant.id} violates attenuation: ${error.message}`
                : `grant ${grant.id} violates attenuation`,
            );
          }
        }
      }

      const lifecycle = lifecycleIssues(chain, now);
      if (grant.status === 'ACTIVE' && lifecycle.length === 0) effectiveActiveCount += 1;

      const openedEvent = await tx.actorEvent.findUnique({
        where: { sourceKey: `authority:grant:${grant.id}:opened` },
        select: { actorId: true, type: true },
      });
      const expectedOpeningType = grant.parentGrantId
        ? 'actor.authority.delegated'
        : 'actor.authority.granted';
      if (
        !openedEvent ||
        openedEvent.actorId !== actorId ||
        openedEvent.type !== expectedOpeningType
      ) {
        issues.push(`grant ${grant.id} is missing its canonical opening event`);
      }
      if (grant.status === 'REVOKED') {
        const revokedEvent = await tx.actorEvent.findUnique({
          where: { sourceKey: `authority:grant:${grant.id}:revoked` },
          select: { actorId: true, type: true },
        });
        if (
          !revokedEvent ||
          revokedEvent.actorId !== actorId ||
          revokedEvent.type !== 'actor.authority.revoked'
        ) {
          issues.push(`grant ${grant.id} is missing its canonical revocation event`);
        }
      }
    }

    return {
      version: 'noeone.authority.verify.v1',
      actorId,
      valid: issues.length === 0,
      grantCount: grants.length,
      activeRowCount: grants.filter((grant) => grant.status === 'ACTIVE').length,
      effectiveActiveCount,
      issues,
    };
  });
}

export function authorityGrantStatus(value: 'active' | 'revoked'): AuthorityGrantStatus {
  return value.toUpperCase() as AuthorityGrantStatus;
}
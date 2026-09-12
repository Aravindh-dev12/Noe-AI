import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AuthorityConflictError,
  acceptContinuityTransition,
  createAuthorityGrant,
  db,
  evaluateActorAuthority,
  proposeMigration,
  revokeAuthorityGrant,
  verifyAuthorityState,
} from './index.js';

const suffix = randomUUID();
const hostId = `host_authority_${suffix}`;
const signingSecret = 'test-authority-signing-secret-that-is-long-enough';
const registry = {
  signingSecret,
  hostId,
  environmentVersion: 'noeone-authority@test',
  issuer: 'noeone-test',
} as const;
const actorIds: string[] = [];
const grantIds: string[] = [];

async function createActor(label: string) {
  const actorId = `act_authority_${label}_${randomUUID()}`;
  const executionId = `exec_authority_${label}_${randomUUID()}`;
  const lineageId = `lin_authority_${label}_${randomUUID()}`;
  actorIds.push(actorId);

  await db.actor.create({
    data: {
      id: actorId,
      handle: `auth-${label}-${randomUUID()}`.slice(0, 32),
      displayName: `Authority ${label} ${suffix}`,
      actorType: 'RESEARCH',
      status: 'ACTIVE',
      canonicalLineageId: lineageId,
      createdAt: new Date(),
    },
  });
  await db.actorExecution.create({
    data: {
      id: executionId,
      actorId,
      provider: 'mock',
      model: 'model-a',
      runtime: 'runtime-a',
      configHash: `sha256:${'a'.repeat(64)}`,
      startedAt: new Date(),
    },
  });
  await db.lineageNode.create({
    data: {
      id: lineageId,
      actorId,
      kind: 'ORIGIN',
      canonical: true,
      createdAt: new Date(),
    },
  });
  return { actorId, executionId, lineageId };
}

beforeAll(async () => {
  await db.host.create({
    data: {
      id: hostId,
      slug: `authority-${suffix}`,
      displayName: 'Authority Test Registry',
      status: 'active',
    },
  });
});

afterAll(async () => {
  // Delete descendants before ancestors so the self-referential FK remains
  // valid on databases that check RESTRICT constraints row-by-row.
  for (const grantId of grantIds.slice().reverse()) {
    await db.authorityGrant.deleteMany({ where: { id: grantId } });
  }
  if (actorIds.length > 0) {
    await db.actor.deleteMany({ where: { id: { in: actorIds } } });
  }
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('persistent delegated authority', () => {
  it('attenuates delegation, survives migration, preserves replay, and cascades revocation logically', async () => {
    const rootActor = await createActor('root');
    const delegateActor = await createActor('delegate');
    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000);
    const childNotBefore = new Date(now.getTime() + 1_000);
    const childExpiry = new Date(expiry.getTime() - 1_000);
    const childIdempotencyKey = `authority-child-${suffix}`;

    const root = await createAuthorityGrant(
      {
        subjectActorId: rootActor.actorId,
        grantor: { type: 'external', ref: `principal:${suffix}` },
        actions: ['read', 'purchase'],
        resources: ['catalog', 'checkout'],
        canRedelegate: true,
        remainingDelegationDepth: 2,
        maxAmountMinor: '10000',
        currency: 'USD',
        notBefore: now,
        expiresAt: expiry,
        principal: { type: 'admin' },
        idempotencyKey: `authority-root-${suffix}`,
      },
      registry,
    );
    grantIds.push(root.grant.id);

    const childInput = {
      subjectActorId: delegateActor.actorId,
      parentGrantId: root.grant.id,
      actions: ['purchase'],
      resources: ['checkout'],
      canRedelegate: false,
      remainingDelegationDepth: 0,
      maxAmountMinor: '2000',
      currency: 'USD',
      notBefore: childNotBefore,
      expiresAt: childExpiry,
      principal: { type: 'admin' as const },
      idempotencyKey: childIdempotencyKey,
    };
    const child = await createAuthorityGrant(childInput, registry);
    grantIds.push(child.grant.id);

    const allowed = await evaluateActorAuthority(delegateActor.actorId, {
      action: 'purchase',
      resource: 'checkout',
      amountMinor: '1500',
      currency: 'USD',
      at: new Date(now.getTime() + 10_000),
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.matchedGrantId).toBe(child.grant.id);

    await expect(
      createAuthorityGrant(
        {
          subjectActorId: delegateActor.actorId,
          parentGrantId: root.grant.id,
          actions: ['purchase', 'delete'],
          resources: ['checkout'],
          canRedelegate: false,
          remainingDelegationDepth: 0,
          maxAmountMinor: '2000',
          currency: 'USD',
          notBefore: new Date(now.getTime() + 2_000),
          expiresAt: new Date(expiry.getTime() - 2_000),
          principal: { type: 'admin' },
          idempotencyKey: `authority-broaden-${suffix}`,
        },
        registry,
      ),
    ).rejects.toBeInstanceOf(AuthorityConflictError);

    const proposal = await proposeMigration({
      actorId: rootActor.actorId,
      provider: 'mock',
      model: 'model-b',
      runtime: 'runtime-b',
      configHash: `sha256:${'b'.repeat(64)}`,
      principal: { type: 'admin' },
      policyVersion: 'authority-test-v1',
      reason: 'prove authority survives cognition change',
      now: new Date(now.getTime() + 20_000),
    });
    const migrated = await acceptContinuityTransition(
      proposal.id,
      registry,
      new Date(now.getTime() + 20_000),
    );
    expect(migrated.accepted).toBe(true);

    const rootAfterMigration = await db.authorityGrant.findUniqueOrThrow({
      where: { id: root.grant.id },
    });
    expect(rootAfterMigration.subjectActorId).toBe(rootActor.actorId);
    expect(rootAfterMigration.status).toBe('ACTIVE');

    await revokeAuthorityGrant(
      {
        grantId: root.grant.id,
        reason: 'principal withdrew authority',
        principal: { type: 'admin' },
        idempotencyKey: `authority-revoke-${suffix}`,
        now: new Date(now.getTime() + 30_000),
      },
      registry,
    );

    const childRow = await db.authorityGrant.findUniqueOrThrow({ where: { id: child.grant.id } });
    expect(childRow.status).toBe('ACTIVE');

    // Historical idempotency must not depend on the parent's later lifecycle.
    // The same request replays the original child instead of trying to create a
    // fresh delegation from a now-revoked parent.
    const replayedChild = await createAuthorityGrant(childInput, registry);
    expect(replayedChild.replayed).toBe(true);
    expect(replayedChild.grant.id).toBe(child.grant.id);

    const denied = await evaluateActorAuthority(delegateActor.actorId, {
      action: 'purchase',
      resource: 'checkout',
      amountMinor: '100',
      currency: 'USD',
      at: new Date(now.getTime() + 40_000),
    });
    expect(denied.allowed).toBe(false);
    expect(denied.evaluations[0]?.reasons.join(' ')).toMatch(/revoked/i);

    const delegateVerification = await verifyAuthorityState(delegateActor.actorId);
    expect(delegateVerification.valid).toBe(true);
    expect(delegateVerification.activeRowCount).toBe(1);
    expect(delegateVerification.effectiveActiveCount).toBe(0);
  });
});
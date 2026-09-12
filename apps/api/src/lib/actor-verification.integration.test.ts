import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, migrateActorExecution } from '@onbae/db';

import { env } from '../env.js';
import { verifyActorCareer } from './actor-verification.js';

const suffix = randomUUID();
const hostId = `host_verify_${suffix}`;
const actorId = `act_verify_${suffix}`;
const executionId = `exec_verify_${suffix}`;
const lineageId = `lin_verify_${suffix}`;

beforeAll(async () => {
  await db.host.create({
    data: {
      id: hostId,
      slug: `verify-${suffix}`,
      displayName: 'Verification Test Registry',
      status: 'active',
    },
  });

  await db.actor.create({
    data: {
      id: actorId,
      handle: `verify-${suffix}`.slice(0, 32),
      displayName: 'Verification Continuity Actor',
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
});

afterAll(async () => {
  await db.actor.deleteMany({ where: { id: actorId } });
  await db.host.deleteMany({ where: { id: hostId } });
  await db.$disconnect();
});

describe('actor continuity verification', () => {
  it('verifies an accepted governed migration independently of event signatures', async () => {
    const decision = await migrateActorExecution(
      {
        actorId,
        provider: 'mock',
        model: 'model-b',
        runtime: 'runtime-b',
        configHash: `sha256:${'b'.repeat(64)}`,
        principal: { type: 'admin' },
        policyVersion: 'verification-test-v1',
        reason: 'verification test migration',
      },
      {
        signingSecret: env.EVENT_SIGNING_SECRET,
        hostId,
        environmentVersion: 'verification-test@1',
        issuer: 'verification-test',
      },
    );

    const verification = await verifyActorCareer(actorId);
    expect(verification).not.toBeNull();
    expect(verification!.valid).toBe(true);
    expect(verification!.chain.valid).toBe(true);
    expect(verification!.registrySignatures.invalid).toBe(0);
    expect(verification!.continuity.valid).toBe(true);
    expect(verification!.continuity.coverage).toBe('governed');
    expect(verification!.continuity.currentExecutionId).toBe(decision.executionId);
    expect(verification!.continuity.canonicalLineageId).toBe(decision.lineageId);
    expect(verification!.continuity.transitions.accepted).toBe(1);
  });

  it('detects continuity-manifest tampering even when the signed event chain remains valid', async () => {
    const accepted = await db.continuityTransition.findFirstOrThrow({
      where: { actorId, status: 'ACCEPTED' },
    });
    if (!accepted.resultingExecutionId) throw new Error('accepted transition has no execution');

    await db.actorExecution.update({
      where: { id: accepted.resultingExecutionId },
      data: { model: 'tampered-model' },
    });

    const verification = await verifyActorCareer(actorId);
    expect(verification).not.toBeNull();
    expect(verification!.chain.valid).toBe(true);
    expect(verification!.registrySignatures.invalid).toBe(0);
    expect(verification!.continuity.valid).toBe(false);
    expect(verification!.valid).toBe(false);
    expect(verification!.continuity.issues).toContain(
      `transition_resulting_execution_manifest_mismatch:${accepted.id}`,
    );
  });
});
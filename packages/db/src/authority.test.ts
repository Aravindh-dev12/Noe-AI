import type { AuthorityGrant } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  AuthorityConflictError,
  assertAuthorityAttenuation,
  evaluateAuthorityChainRecords,
  isAuthoritySetSubset,
} from './authority.js';

function grant(
  overrides: Partial<AuthorityGrant> & Pick<AuthorityGrant, 'id' | 'subjectActorId'>,
): AuthorityGrant {
  const now = new Date('2026-09-12T00:00:00.000Z');
  return {
    id: overrides.id,
    subjectActorId: overrides.subjectActorId,
    parentGrantId: null,
    grantorType: 'user',
    grantorRef: 'usr_test',
    status: 'ACTIVE',
    actions: ['read', 'purchase'],
    resources: ['catalog', 'checkout'],
    canRedelegate: true,
    remainingDelegationDepth: 2,
    maxAmountMinor: '10000',
    currency: 'USD',
    notBefore: now,
    expiresAt: new Date('2026-09-13T00:00:00.000Z'),
    externalFramework: null,
    externalReference: null,
    sourceEvidenceArtifactId: null,
    issuedByType: 'admin',
    issuedById: null,
    idempotencyKey: `idem_${overrides.id}`,
    revokedAt: null,
    revokedByType: null,
    revokedById: null,
    revocationReason: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('authority set containment', () => {
  it('accepts strict subsets and wildcard parents', () => {
    expect(isAuthoritySetSubset(['read', 'write'], ['read'])).toBe(true);
    expect(isAuthoritySetSubset(['*'], ['read', 'write'])).toBe(true);
  });

  it('rejects scope expansion and wildcard children under bounded parents', () => {
    expect(isAuthoritySetSubset(['read'], ['read', 'write'])).toBe(false);
    expect(isAuthoritySetSubset(['read'], ['*'])).toBe(false);
  });
});

describe('authority delegation attenuation', () => {
  const parent = grant({ id: 'root', subjectActorId: 'actor-a' });

  it('accepts a narrower child grant', () => {
    expect(() =>
      assertAuthorityAttenuation(parent, {
        actions: ['purchase'],
        resources: ['checkout'],
        canRedelegate: true,
        remainingDelegationDepth: 1,
        maxAmountMinor: '2000',
        currency: 'USD',
        notBefore: new Date('2026-09-12T01:00:00.000Z'),
        expiresAt: new Date('2026-09-12T20:00:00.000Z'),
      }),
    ).not.toThrow();
  });

  it('rejects broader actions, spend, expiry, and delegation depth', () => {
    expect(() =>
      assertAuthorityAttenuation(parent, {
        actions: ['purchase', 'delete'],
        resources: ['checkout'],
        canRedelegate: false,
        remainingDelegationDepth: 0,
        maxAmountMinor: '2000',
        currency: 'USD',
        notBefore: parent.notBefore,
        expiresAt: parent.expiresAt,
      }),
    ).toThrow(AuthorityConflictError);

    expect(() =>
      assertAuthorityAttenuation(parent, {
        actions: ['purchase'],
        resources: ['checkout'],
        canRedelegate: false,
        remainingDelegationDepth: 0,
        maxAmountMinor: '10001',
        currency: 'USD',
        notBefore: parent.notBefore,
        expiresAt: parent.expiresAt,
      }),
    ).toThrow(/cap/i);

    expect(() =>
      assertAuthorityAttenuation(parent, {
        actions: ['purchase'],
        resources: ['checkout'],
        canRedelegate: false,
        remainingDelegationDepth: 0,
        maxAmountMinor: '2000',
        currency: 'USD',
        notBefore: parent.notBefore,
        expiresAt: new Date('2026-09-14T00:00:00.000Z'),
      }),
    ).toThrow(/outlive/i);

    expect(() =>
      assertAuthorityAttenuation(parent, {
        actions: ['purchase'],
        resources: ['checkout'],
        canRedelegate: true,
        remainingDelegationDepth: 2,
        maxAmountMinor: '2000',
        currency: 'USD',
        notBefore: parent.notBefore,
        expiresAt: parent.expiresAt,
      }),
    ).toThrow(/depth/i);
  });
});

describe('effective authority evaluation', () => {
  const root = grant({ id: 'root', subjectActorId: 'actor-a' });
  const child = grant({
    id: 'child',
    subjectActorId: 'actor-b',
    parentGrantId: root.id,
    grantorType: 'actor',
    grantorRef: root.subjectActorId,
    actions: ['purchase'],
    resources: ['checkout'],
    canRedelegate: false,
    remainingDelegationDepth: 0,
    maxAmountMinor: '2000',
  });

  it('allows a request inside every grant in the chain', () => {
    const result = evaluateAuthorityChainRecords([root, child], {
      action: 'purchase',
      resource: 'checkout',
      amountMinor: '1500',
      currency: 'USD',
      at: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(result.allowed).toBe(true);
    expect(result.grantId).toBe('child');
  });

  it('denies spend above the delegated child cap', () => {
    const result = evaluateAuthorityChainRecords([root, child], {
      action: 'purchase',
      resource: 'checkout',
      amountMinor: '2500',
      currency: 'USD',
      at: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/cap/i);
  });

  it('denies the child when an ancestor was revoked without mutating the child row', () => {
    const revokedRoot = grant({
      ...root,
      id: 'root-revoked',
      status: 'REVOKED',
      revokedAt: new Date('2026-09-12T09:00:00.000Z'),
      revokedByType: 'admin',
    });
    const stillActiveChild = grant({
      ...child,
      id: 'child-active',
      parentGrantId: revokedRoot.id,
      status: 'ACTIVE',
    });
    const result = evaluateAuthorityChainRecords([revokedRoot, stillActiveChild], {
      action: 'purchase',
      resource: 'checkout',
      amountMinor: '100',
      currency: 'USD',
      at: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(stillActiveChild.status).toBe('ACTIVE');
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/revoked/i);
  });
});

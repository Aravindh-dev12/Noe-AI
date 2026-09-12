import type { AuthorityGrant, AuthorityGrantTransition } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  authorityGrantStatusAt,
  evaluateTemporalAuthorityChainRecords,
  type TemporalAuthorityGrant,
} from './temporal-authority.js';

function grant(
  id: string,
  subjectActorId: string,
  transitions: AuthorityGrantTransition[],
  overrides: Partial<AuthorityGrant> = {},
): TemporalAuthorityGrant {
  const start = new Date('2026-09-12T10:00:00.000Z');
  return {
    id,
    subjectActorId,
    parentGrantId: null,
    grantorType: 'external',
    grantorRef: 'principal:test',
    status: 'ACTIVE',
    actions: ['purchase'],
    resources: ['checkout'],
    canRedelegate: false,
    remainingDelegationDepth: 0,
    maxAmountMinor: '2000',
    currency: 'USD',
    notBefore: start,
    expiresAt: new Date('2026-09-12T13:00:00.000Z'),
    externalFramework: null,
    externalReference: null,
    sourceEvidenceArtifactId: null,
    issuedByType: 'admin',
    issuedById: null,
    idempotencyKey: `idem_${id}`,
    revokedAt: null,
    revokedByType: null,
    revokedById: null,
    revocationReason: null,
    metadata: {},
    createdAt: start,
    updatedAt: start,
    ...overrides,
    transitions,
  };
}

function transition(
  id: string,
  grantId: string,
  at: string,
  fromStatus: 'ACTIVE' | 'REVOKED' | null,
  toStatus: 'ACTIVE' | 'REVOKED',
): AuthorityGrantTransition {
  return {
    id,
    grantId,
    fromStatus,
    toStatus,
    reason: null,
    decidedByType: 'admin',
    decidedById: null,
    idempotencyKey: `idem_${id}`,
    occurredAt: new Date(at),
    metadata: {},
  };
}

describe('temporal authority state', () => {
  const opening = transition('open', 'root', '2026-09-12T10:00:00.000Z', null, 'ACTIVE');
  const revocation = transition(
    'revoke',
    'root',
    '2026-09-12T11:00:00.000Z',
    'ACTIVE',
    'REVOKED',
  );
  const root = grant('root', 'actor-a', [opening, revocation], {
    status: 'REVOKED',
    revokedAt: new Date('2026-09-12T11:00:00.000Z'),
    revokedByType: 'admin',
  });

  it('reconstructs state from transitions rather than current projection', () => {
    expect(authorityGrantStatusAt(root, new Date('2026-09-12T09:59:00.000Z'))).toBe(
      'NOT_YET_GRANTED',
    );
    expect(authorityGrantStatusAt(root, new Date('2026-09-12T10:30:00.000Z'))).toBe('ACTIVE');
    expect(authorityGrantStatusAt(root, new Date('2026-09-12T11:30:00.000Z'))).toBe('REVOKED');
  });

  it('keeps a pre-revocation action covered after current state becomes revoked', () => {
    const evaluation = evaluateTemporalAuthorityChainRecords([root], {
      action: 'purchase',
      resource: 'checkout',
      amountMinor: '1500',
      currency: 'USD',
      at: new Date('2026-09-12T10:30:00.000Z'),
    });
    expect(root.status).toBe('REVOKED');
    expect(evaluation.allowed).toBe(true);
  });

  it('denies the same action after the revocation transition', () => {
    const evaluation = evaluateTemporalAuthorityChainRecords([root], {
      action: 'purchase',
      resource: 'checkout',
      amountMinor: '1500',
      currency: 'USD',
      at: new Date('2026-09-12T11:30:00.000Z'),
    });
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reasons.join(' ')).toMatch(/revoked/i);
  });

  it('still enforces scope and value limits historically', () => {
    const evaluation = evaluateTemporalAuthorityChainRecords([root], {
      action: 'purchase',
      resource: 'checkout',
      amountMinor: '2500',
      currency: 'USD',
      at: new Date('2026-09-12T10:30:00.000Z'),
    });
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reasons.join(' ')).toMatch(/cap/i);
  });
});

import { describe, expect, it } from 'vitest';

import {
  assertPresentationBoundToRequest,
  planContinuityPresentation,
  type ContinuityPresentationEnvelope,
  type ContinuityPresentationRequest,
} from './selective-continuity.js';

const future = '2030-01-01T00:10:00.000Z';
const now = new Date('2030-01-01T00:00:00.000Z');

function request(
  claims: ContinuityPresentationRequest['claims'],
): ContinuityPresentationRequest {
  return {
    version: 'noeone.continuity-presentation-request.v1',
    requestId: 'req_123',
    verifierId: 'host_example',
    audience: 'https://host.example/continuity',
    nonce: 'nonce-with-entropy-123456',
    requestedAt: '2030-01-01T00:00:00.000Z',
    expiresAt: future,
    claims,
  };
}

describe('selective continuity policy', () => {
  it('plans ordinary continuity claims without requiring a committed dataset', () => {
    const plan = planContinuityPresentation(
      request([
        {
          id: 'same-actor',
          kind: 'same_canonical_actor',
          required: true,
          parameters: { reference: 'credential:abc' },
        },
      ]),
      now,
    );

    expect(plan.claims[0]?.semantics).toBe('positive');
    expect(plan.claims[0]?.requiresCommittedDataset).toBe(false);
    expect(plan.claims[0]?.acceptableProofFamilies).toContain('bbs');
  });

  it('does not pretend selective disclosure alone can prove a negative history claim', () => {
    const plan = planContinuityPresentation(
      request([
        {
          id: 'incident-window',
          kind: 'no_critical_incident_in_window',
          required: true,
          parameters: { since: '2029-12-01T00:00:00.000Z', severity: 'critical' },
        },
      ]),
      now,
    );

    expect(plan.claims[0]?.semantics).toBe('negative-over-committed-set');
    expect(plan.claims[0]?.requiresCommittedDataset).toBe(true);
    expect(plan.claims[0]?.acceptableProofFamilies).toEqual([
      'committed-set-non-membership',
      'zk-predicate',
    ]);
  });

  it('rejects a replayed presentation with the wrong nonce', () => {
    const verifierRequest = request([
      {
        id: 'authority',
        kind: 'authority_scope',
        required: true,
        parameters: { action: 'purchase', maxAmount: 500 },
      },
    ]);

    const presentation: ContinuityPresentationEnvelope = {
      version: 'noeone.continuity-presentation.v1',
      requestId: verifierRequest.requestId,
      audience: verifierRequest.audience,
      nonce: 'different-nonce-123456',
      subject: {
        subject: 'pairwise-subject-abc',
        audience: verifierRequest.audience,
        scheme: 'pairwise-v1',
      },
      issuedAt: '2030-01-01T00:00:01.000Z',
      expiresAt: future,
      claims: [
        {
          requestClaimId: 'authority',
          kind: 'authority_scope',
          proofFamily: 'sd-jwt',
          proof: {},
        },
      ],
    };

    expect(() => assertPresentationBoundToRequest(presentation, verifierRequest, now)).toThrow(
      'nonce',
    );
  });

  it('rejects a weak proof family for a negative-history claim', () => {
    const verifierRequest = request([
      {
        id: 'incident-window',
        kind: 'no_critical_incident_in_window',
        required: true,
        parameters: { since: '2029-12-01T00:00:00.000Z' },
      },
    ]);

    const presentation: ContinuityPresentationEnvelope = {
      version: 'noeone.continuity-presentation.v1',
      requestId: verifierRequest.requestId,
      audience: verifierRequest.audience,
      nonce: verifierRequest.nonce,
      subject: {
        subject: 'pairwise-subject-abc',
        audience: verifierRequest.audience,
        scheme: 'pairwise-v1',
      },
      issuedAt: '2030-01-01T00:00:01.000Z',
      expiresAt: future,
      claims: [
        {
          requestClaimId: 'incident-window',
          kind: 'no_critical_incident_in_window',
          proofFamily: 'sd-jwt',
          proof: {},
        },
      ],
    };

    expect(() => assertPresentationBoundToRequest(presentation, verifierRequest, now)).toThrow(
      'not acceptable',
    );
  });

  it('requires every required claim to be present', () => {
    const verifierRequest = request([
      {
        id: 'same-actor',
        kind: 'same_canonical_actor',
        required: true,
        parameters: {},
      },
    ]);

    const presentation: ContinuityPresentationEnvelope = {
      version: 'noeone.continuity-presentation.v1',
      requestId: verifierRequest.requestId,
      audience: verifierRequest.audience,
      nonce: verifierRequest.nonce,
      subject: {
        subject: 'pairwise-subject-abc',
        audience: verifierRequest.audience,
        scheme: 'pairwise-v1',
      },
      issuedAt: '2030-01-01T00:00:01.000Z',
      expiresAt: future,
      claims: [],
    };

    expect(() => assertPresentationBoundToRequest(presentation, verifierRequest, now)).toThrow(
      'Required continuity claim',
    );
  });
});

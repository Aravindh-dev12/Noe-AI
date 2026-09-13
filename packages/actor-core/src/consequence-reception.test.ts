import { describe, expect, it } from 'vitest';

import {
  assertValidConsequenceReceptionRecord,
  assertValidConsequenceReceptionTransition,
  correctiveScopeMatches,
  projectConsequenceReceptionState,
  type ConsequenceReceptionRecord,
  type ConsequenceReceptionTransition,
} from './consequence-reception.js';

function record(
  overrides: Partial<ConsequenceReceptionRecord> = {},
): ConsequenceReceptionRecord {
  return {
    version: 'noeone.consequence-reception.v1',
    id: 'crx_1',
    actorId: 'act_1',
    sourceConsequenceId: 'con_1',
    sourceAttributionId: 'cat_1',
    sourceEvidenceArtifactId: 'evi_1',
    kind: 'restriction',
    status: 'active',
    scope: {
      global: false,
      actions: ['transfer'],
      resources: ['wallet:treasury'],
      capabilities: [],
      environmentRefs: [],
    },
    termsDigest: `sha256:${'a'.repeat(64)}`,
    restorationCriteriaDigest: `sha256:${'b'.repeat(64)}`,
    effectiveAt: '2026-09-13T10:00:00.000Z',
    reviewAt: '2026-09-20T10:00:00.000Z',
    expiresAt: '2026-10-13T10:00:00.000Z',
    issuedByType: 'organization',
    issuedByRef: 'risk-board:1',
    authorityEvidenceArtifactId: 'evi_authority_2',
    migrationPolicy: 'carry-with-actor',
    forkPolicy: 'do-not-inherit',
    capturedAt: '2026-09-13T10:00:01.000Z',
    basisDigest: `sha256:${'c'.repeat(64)}`,
    ...overrides,
  };
}

function transition(
  overrides: Partial<ConsequenceReceptionTransition> = {},
): ConsequenceReceptionTransition {
  return {
    version: 'noeone.consequence-reception-transition.v1',
    id: 'crxt_1',
    receptionId: 'crx_1',
    actorId: 'act_1',
    fromStatus: 'active',
    toStatus: 'satisfied',
    evidenceArtifactId: 'evi_repair',
    decidedByType: 'organization',
    decidedByRef: 'risk-board:1',
    occurredAt: '2026-09-21T10:00:00.000Z',
    reason: 'remediation verified',
    basisDigest: `sha256:${'d'.repeat(64)}`,
    ...overrides,
  };
}

describe('Consequence Reception', () => {
  it('accepts a scoped actor-level corrective condition', () => {
    expect(() => assertValidConsequenceReceptionRecord(record())).not.toThrow();
  });

  it('requires a source institutional/consequence object in addition to evidence', () => {
    const invalid = record();
    delete invalid.sourceConsequenceId;
    delete invalid.sourceAttributionId;
    expect(() => assertValidConsequenceReceptionRecord(invalid)).toThrow(/must reference/);
  });

  it('forces migration carry-over and fork non-inheritance semantics', () => {
    expect(() =>
      assertValidConsequenceReceptionRecord(
        record({ migrationPolicy: 'carry-with-actor' }),
      ),
    ).not.toThrow();
    expect(() =>
      assertValidConsequenceReceptionRecord(
        record({ forkPolicy: 'do-not-inherit' }),
      ),
    ).not.toThrow();
  });

  it('rejects empty non-global scope', () => {
    expect(() =>
      assertValidConsequenceReceptionRecord(
        record({
          scope: {
            global: false,
            actions: [],
            resources: [],
            capabilities: [],
            environmentRefs: [],
          },
        }),
      ),
    ).toThrow(/scope selector/);
  });

  it('requires suspension to be global', () => {
    expect(() =>
      assertValidConsequenceReceptionRecord(record({ kind: 'suspension' })),
    ).toThrow(/suspension must be global/i);
    expect(() =>
      assertValidConsequenceReceptionRecord(
        record({
          kind: 'suspension',
          scope: {
            global: true,
            actions: [],
            resources: [],
            capabilities: [],
            environmentRefs: [],
          },
        }),
      ),
    ).not.toThrow();
  });

  it('projects the corrective condition independently of model/runtime state', () => {
    const before = projectConsequenceReceptionState(
      record(),
      [],
      '2026-09-14T10:00:00.000Z',
    );
    expect(before.active).toBe(true);
    expect(before.actorId).toBe('act_1');
  });

  it('requires transition identity to remain on the same actor and corrective record', () => {
    expect(() =>
      assertValidConsequenceReceptionTransition(
        transition({ actorId: 'act_clone' }),
        record(),
      ),
    ).toThrow(/actorId/);
    expect(() =>
      assertValidConsequenceReceptionTransition(
        transition({ receptionId: 'crx_other' }),
        record(),
      ),
    ).toThrow(/receptionId/);
  });

  it('records restoration as a terminal transition instead of deleting history', () => {
    const projected = projectConsequenceReceptionState(
      record(),
      [transition()],
      '2026-09-22T10:00:00.000Z',
    );
    expect(projected).toMatchObject({
      status: 'satisfied',
      active: false,
      terminalTransitionId: 'crxt_1',
    });
  });

  it('rejects stale second terminal transitions', () => {
    expect(() =>
      projectConsequenceReceptionState(
        record(),
        [
          transition(),
          transition({
            id: 'crxt_2',
            toStatus: 'lifted',
            occurredAt: '2026-09-22T10:00:00.000Z',
          }),
        ],
        '2026-09-23T10:00:00.000Z',
      ),
    ).toThrow(/projected status/);
  });

  it('treats expiry as inactive without rewriting issued history', () => {
    const projected = projectConsequenceReceptionState(
      record(),
      [],
      '2026-10-14T10:00:00.000Z',
    );
    expect(projected.status).toBe('active');
    expect(projected.active).toBe(false);
  });

  it('matches only the relevant action/resource unless global', () => {
    expect(correctiveScopeMatches(record(), { action: 'transfer' })).toBe(true);
    expect(correctiveScopeMatches(record(), { resource: 'wallet:treasury' })).toBe(true);
    expect(correctiveScopeMatches(record(), { action: 'read' })).toBe(false);
    expect(
      correctiveScopeMatches(
        record({
          scope: {
            global: true,
            actions: [],
            resources: [],
            capabilities: [],
            environmentRefs: [],
          },
        }),
        { action: 'anything' },
      ),
    ).toBe(true);
  });
});

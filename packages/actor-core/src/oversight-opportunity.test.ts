import { describe, expect, it } from 'vitest';

import {
  assertInterventionFrontierMatchesDecisionFrontier,
  assertValidInterventionAttemptRecord,
  assertValidInterventionFrontierRecord,
  assertValidOversightEffectivenessAssessment,
  deriveInterventionStructuralFacts,
  type InterventionAttemptRecord,
  type InterventionFrontierRecord,
  type OversightEffectivenessAssessment,
} from './oversight-opportunity.js';

function frontier(overrides: Partial<InterventionFrontierRecord> = {}): InterventionFrontierRecord {
  return {
    version: 'noe.intervention-frontier.v1',
    id: 'ifrontier-1',
    actorId: 'actor-1',
    decisionId: 'decision-1',
    decisionFrontierRef: 'decision-frontier-1',
    selectedActionDigest: `sha256:${'a'.repeat(64)}`,
    executionId: 'exec-1',
    decisionAt: '2026-09-13T10:00:00.000Z',
    windowOpenedAt: '2026-09-13T09:59:55.000Z',
    interventionDeadlineAt: '2026-09-13T10:00:30.000Z',
    deadlineEvidenceRefs: ['finality-attestation:payment-1'],
    closeReason: 'effect-committed',
    requirement: {
      mode: 'mandatory',
      policyRefs: ['policy:payments:v7'],
    },
    overseer: {
      principalKind: 'human',
      principalRef: 'human:risk-officer-42',
      identityAttestationRef: 'attestation:human:risk-officer-42',
      assignedAt: '2026-09-13T09:00:00.000Z',
      authorityRefs: ['authority:payments:v4'],
      competenceEvidenceRefs: ['credential:risk-review:v2'],
    },
    notice: {
      deliveryStatus: 'acknowledged',
      issuedAt: '2026-09-13T10:00:01.000Z',
      deliveredAt: '2026-09-13T10:00:02.000Z',
      acknowledgedAt: '2026-09-13T10:00:06.000Z',
      channel: 'ops-console',
      evidenceRefs: ['notice-receipt:1'],
    },
    information: {
      bundleDigest: `sha256:${'b'.repeat(64)}`,
      availableAt: '2026-09-13T10:00:02.000Z',
      evidenceRefs: ['evidence:risk-context'],
      explanationRef: 'explanation:decision-1',
      forecastRefs: ['forecast-1'],
    },
    controls: [
      {
        id: 'control-veto',
        kind: 'veto',
        authorityRef: 'authority:payments:v4',
        enforcementRef: 'finality-sink:payments:v3',
        availableFrom: '2026-09-13T09:59:55.000Z',
        availableUntil: '2026-09-13T10:00:30.000Z',
        scopeDigest: `sha256:${'c'.repeat(64)}`,
        evidenceRefs: ['control-attestation:veto'],
      },
    ],
    fallback: {
      onNoResponse: 'deny',
      triggerAt: '2026-09-13T10:00:25.000Z',
      enforcementRef: 'finality-sink:payments:v3',
    },
    captureMode: 'contemporaneous',
    capturedAt: '2026-09-13T10:00:10.000Z',
    attestorId: 'payments-governance-kernel',
    attestationRef: 'attestation:intervention-frontier:1',
    basisDigest: `sha256:${'d'.repeat(64)}`,
    ...overrides,
  };
}

function attempt(overrides: Partial<InterventionAttemptRecord> = {}): InterventionAttemptRecord {
  return {
    version: 'noe.intervention-attempt.v1',
    id: 'attempt-1',
    frontierId: 'ifrontier-1',
    actorId: 'actor-1',
    decisionId: 'decision-1',
    overseerPrincipalRef: 'human:risk-officer-42',
    controlId: 'control-veto',
    controlKind: 'veto',
    attemptedAt: '2026-09-13T10:00:10.000Z',
    completedAt: '2026-09-13T10:00:11.000Z',
    outcome: 'succeeded',
    attestationRef: 'attestation:attempt:1',
    evidenceRefs: ['control-result:1'],
    basisDigest: `sha256:${'e'.repeat(64)}`,
    ...overrides,
  };
}

function assessment(
  overrides: Partial<OversightEffectivenessAssessment> = {},
): OversightEffectivenessAssessment {
  return {
    version: 'noe.oversight-assessment.v1',
    id: 'assessment-1',
    frontierId: 'ifrontier-1',
    actorId: 'actor-1',
    decisionId: 'decision-1',
    evaluatorId: 'independent-auditor',
    attestationRef: 'attestation:auditor:1',
    method: 'oversight-opportunity-review',
    methodVersion: '1.0.0',
    dimension: 'overall-opportunity',
    disposition: 'meaningful',
    assessedAt: '2026-09-13T12:00:00.000Z',
    attemptRefs: ['attempt-1'],
    consequenceObservationRefs: [],
    evidenceRefs: ['audit:1'],
    basisDigest: `sha256:${'f'.repeat(64)}`,
    ...overrides,
  };
}

describe('Intervention Frontier', () => {
  it('accepts a contemporaneous frontier with timely information and enforceable control', () => {
    const record = frontier();
    expect(() => assertValidInterventionFrontierRecord(record)).not.toThrow();
    expect(deriveInterventionStructuralFacts(record)).toEqual({
      windowDurationMs: 35_000,
      overseerAssignedBeforeDeadline: true,
      noticeDeliveredBeforeDeadline: true,
      informationAvailableBeforeDeadline: true,
      controlAvailableBeforeDeadline: true,
      acknowledgementBeforeDeadline: true,
      fallbackTriggeredBeforeDeadline: true,
      structurallyActionable: true,
      deficiencies: [],
    });
  });

  it('requires provenance for the claimed effect-finality deadline', () => {
    expect(() =>
      assertValidInterventionFrontierRecord(frontier({ deadlineEvidenceRefs: [] })),
    ).toThrow(/deadlineEvidenceRefs/);
  });

  it('preserves late notice as historical evidence instead of rejecting it', () => {
    const record = frontier({
      notice: {
        deliveryStatus: 'delivered',
        issuedAt: '2026-09-13T10:00:31.000Z',
        deliveredAt: '2026-09-13T10:00:35.000Z',
        channel: 'ops-console',
        evidenceRefs: ['late-notice:1'],
      },
      captureMode: 'reconstructed',
      capturedAt: '2026-09-13T11:00:00.000Z',
    });
    expect(() => assertValidInterventionFrontierRecord(record)).not.toThrow();
    const facts = deriveInterventionStructuralFacts(record);
    expect(facts.noticeDeliveredBeforeDeadline).toBe(false);
    expect(facts.structurallyActionable).toBe(false);
    expect(facts.deficiencies).toContain('late-notice');
    expect(facts.deficiencies).toContain('no-acknowledgement');
  });

  it('preserves late overseer assignment as a structural deficiency', () => {
    const record = frontier({
      overseer: {
        ...frontier().overseer,
        assignedAt: '2026-09-13T10:00:31.000Z',
      },
    });
    expect(() => assertValidInterventionFrontierRecord(record)).not.toThrow();
    const facts = deriveInterventionStructuralFacts(record);
    expect(facts.overseerAssignedBeforeDeadline).toBe(false);
    expect(facts.deficiencies).toContain('late-overseer-assignment');
    expect(facts.structurallyActionable).toBe(false);
  });

  it('preserves a late fallback trigger rather than laundering it as timely', () => {
    const record = frontier({
      fallback: {
        onNoResponse: 'deny',
        triggerAt: '2026-09-13T10:00:40.000Z',
        enforcementRef: 'finality-sink:payments:v3',
      },
    });
    const facts = deriveInterventionStructuralFacts(record);
    expect(facts.fallbackTriggeredBeforeDeadline).toBe(false);
    expect(facts.deficiencies).toContain('late-fallback-trigger');
  });

  it('flags an unknown response trigger when a concrete no-response fallback is claimed', () => {
    const record = frontier({
      fallback: {
        onNoResponse: 'deny',
        enforcementRef: 'finality-sink:payments:v3',
      },
    });
    const facts = deriveInterventionStructuralFacts(record);
    expect(facts.fallbackTriggeredBeforeDeadline).toBeNull();
    expect(facts.deficiencies).toContain('unknown-fallback-trigger');
  });

  it('preserves a nominal supervisor with no effective control', () => {
    const record = frontier({ controls: [] });
    expect(() => assertValidInterventionFrontierRecord(record)).not.toThrow();
    expect(deriveInterventionStructuralFacts(record).deficiencies).toContain(
      'no-effective-control',
    );
  });

  it('rejects a control whose claimed authority is absent from the overseer authority bundle', () => {
    const record = frontier({
      controls: [
        {
          ...frontier().controls[0]!,
          authorityRef: 'authority:not-held-by-overseer',
        },
      ],
    });
    expect(() => assertValidInterventionFrontierRecord(record)).toThrow(/authorityRefs/);
  });

  it('rejects hindsight capture falsely labeled contemporaneous', () => {
    const record = frontier({ capturedAt: '2026-09-13T10:01:00.000Z' });
    expect(() => assertValidInterventionFrontierRecord(record)).toThrow(/contemporaneous/i);
  });

  it('allows explicitly reconstructed records after effect finality', () => {
    const record = frontier({
      captureMode: 'reconstructed',
      capturedAt: '2026-09-14T10:00:00.000Z',
    });
    expect(() => assertValidInterventionFrontierRecord(record)).not.toThrow();
  });

  it('rejects a capture timestamp before the decision it supposedly records', () => {
    expect(() =>
      assertValidInterventionFrontierRecord(
        frontier({ capturedAt: '2026-09-13T09:59:59.000Z' }),
      ),
    ).toThrow(/capturedAt cannot precede decisionAt/);
  });

  it('rejects an intervention deadline that closed before the selected action existed', () => {
    expect(() =>
      assertValidInterventionFrontierRecord(
        frontier({ interventionDeadlineAt: '2026-09-13T09:59:59.000Z' }),
      ),
    ).toThrow(/cannot precede decisionAt/);
  });

  it('rejects impossible notice chronology', () => {
    const record = frontier({
      notice: {
        deliveryStatus: 'acknowledged',
        issuedAt: '2026-09-13T10:00:05.000Z',
        deliveredAt: '2026-09-13T10:00:04.000Z',
        acknowledgedAt: '2026-09-13T10:00:06.000Z',
        evidenceRefs: [],
      },
    });
    expect(() => assertValidInterventionFrontierRecord(record)).toThrow(
      /deliveredAt cannot precede/,
    );
  });

  it('rejects selected-action and actor substitution against the Decision Frontier', () => {
    const decisionFrontier = {
      id: 'decision-frontier-1',
      actorId: 'actor-1',
      decisionId: 'decision-1',
      executionId: 'exec-1',
      decisionAt: '2026-09-13T10:00:00.000Z',
      selectedActionDigest: `sha256:${'a'.repeat(64)}`,
    };
    expect(() =>
      assertInterventionFrontierMatchesDecisionFrontier(frontier(), decisionFrontier),
    ).not.toThrow();
    expect(() =>
      assertInterventionFrontierMatchesDecisionFrontier(
        frontier({ selectedActionDigest: `sha256:${'9'.repeat(64)}` }),
        decisionFrontier,
      ),
    ).toThrow(/selectedActionDigest/);
    expect(() =>
      assertInterventionFrontierMatchesDecisionFrontier(
        frontier({ actorId: 'actor-substituted' }),
        decisionFrontier,
      ),
    ).toThrow(/actorId/);
  });
});

describe('Intervention Attempt', () => {
  it('accepts a successful attempt inside the historical control window', () => {
    expect(() => assertValidInterventionAttemptRecord(attempt(), frontier())).not.toThrow();
  });

  it('requires a successful attempt to include its completion time', () => {
    expect(() =>
      assertValidInterventionAttemptRecord(attempt({ completedAt: undefined }), frontier()),
    ).toThrow(/must include completedAt/);
  });

  it('rejects success when completion occurs after effect finality', () => {
    expect(() =>
      assertValidInterventionAttemptRecord(
        attempt({ completedAt: '2026-09-13T10:00:31.000Z' }),
        frontier(),
      ),
    ).toThrow(/must complete before/);
  });

  it('rejects a control kind that was not the recorded historical control', () => {
    expect(() =>
      assertValidInterventionAttemptRecord(attempt({ controlKind: 'stop' }), frontier()),
    ).toThrow(/controlKind/);
  });

  it('requires attempts after effect finality to be explicitly too-late', () => {
    const late = attempt({
      attemptedAt: '2026-09-13T10:00:31.000Z',
      completedAt: '2026-09-13T10:00:32.000Z',
      outcome: 'failed',
    });
    expect(() => assertValidInterventionAttemptRecord(late, frontier())).toThrow(/too-late/);

    expect(() =>
      assertValidInterventionAttemptRecord({ ...late, outcome: 'too-late' }, frontier()),
    ).not.toThrow();
  });

  it('rejects a claimed successful intervention outside the control availability window', () => {
    expect(() =>
      assertValidInterventionAttemptRecord(
        attempt({
          attemptedAt: '2026-09-13T09:59:50.000Z',
          completedAt: '2026-09-13T09:59:51.000Z',
        }),
        frontier(),
      ),
    ).toThrow(/cannot be recorded as succeeded/);
  });
});

describe('Oversight Effectiveness Assessment', () => {
  it('permits evaluator-specific disagreement over the same immutable frontier', () => {
    expect(() =>
      assertValidOversightEffectivenessAssessment(assessment(), frontier()),
    ).not.toThrow();
    expect(() =>
      assertValidOversightEffectivenessAssessment(
        assessment({
          id: 'assessment-2',
          evaluatorId: 'insurer-b',
          disposition: 'nominal',
          basisDigest: `sha256:${'1'.repeat(64)}`,
        }),
        frontier(),
      ),
    ).not.toThrow();
  });

  it('rejects an assessment made before the intervention window closes', () => {
    expect(() =>
      assertValidOversightEffectivenessAssessment(
        assessment({ assessedAt: '2026-09-13T10:00:20.000Z' }),
        frontier(),
      ),
    ).toThrow(/cannot predate/);
  });
});

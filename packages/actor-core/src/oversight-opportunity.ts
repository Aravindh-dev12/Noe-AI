export type OversightRequirementMode = 'mandatory' | 'conditional' | 'advisory' | 'not-required';

export type OverseerPrincipalKind =
  | 'human'
  | 'organization'
  | 'supervisory-agent'
  | 'policy-engine'
  | 'other';

export type InterventionControlKind =
  | 'approve'
  | 'veto'
  | 'pause'
  | 'stop'
  | 'modify'
  | 'substitute'
  | 'escalate'
  | 'revoke-authority'
  | 'rollback';

export type InterventionCloseReason =
  | 'effect-committed'
  | 'deadline'
  | 'authority-expired'
  | 'state-changed'
  | 'cancelled'
  | 'unknown';

export type NoticeDeliveryStatus =
  | 'not-issued'
  | 'issued'
  | 'delivered'
  | 'acknowledged'
  | 'failed'
  | 'unknown';

export type NoResponseDisposition = 'allow' | 'deny' | 'pause' | 'escalate' | 'unknown';

export type InterventionCaptureMode = 'contemporaneous' | 'reconstructed';

export type InterventionControl = {
  id: string;
  kind: InterventionControlKind;
  authorityRef: string;
  enforcementRef: string;
  availableFrom: string;
  availableUntil?: string;
  scopeDigest: string;
  evidenceRefs: readonly string[];
};

export type OversightNotice = {
  deliveryStatus: NoticeDeliveryStatus;
  issuedAt?: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
  channel?: string;
  evidenceRefs: readonly string[];
};

export type OversightInformationBundle = {
  bundleDigest: string;
  availableAt: string;
  evidenceRefs: readonly string[];
  explanationRef?: string;
  forecastRefs: readonly string[];
};

export type InterventionFrontierRecord = {
  version: 'noe.intervention-frontier.v1';
  id: string;
  actorId: string;
  decisionId: string;
  decisionFrontierRef: string;
  selectedActionDigest: string;
  executionId?: string;
  decisionAt: string;
  windowOpenedAt: string;
  interventionDeadlineAt: string;
  closeReason: InterventionCloseReason;
  requirement: {
    mode: OversightRequirementMode;
    policyRefs: readonly string[];
  };
  overseer: {
    principalKind: OverseerPrincipalKind;
    principalRef: string;
    identityAttestationRef: string;
    assignedAt: string;
    authorityRefs: readonly string[];
    competenceEvidenceRefs: readonly string[];
  };
  notice: OversightNotice;
  information: OversightInformationBundle;
  controls: readonly InterventionControl[];
  fallback: {
    onNoResponse: NoResponseDisposition;
    enforcementRef?: string;
  };
  captureMode: InterventionCaptureMode;
  capturedAt: string;
  attestorId: string;
  attestationRef: string;
  basisDigest: string;
};

export type InterventionAttemptOutcome =
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'too-late'
  | 'partially-effective';

export type InterventionAttemptRecord = {
  version: 'noe.intervention-attempt.v1';
  id: string;
  frontierId: string;
  actorId: string;
  decisionId: string;
  overseerPrincipalRef: string;
  controlId: string;
  controlKind: InterventionControlKind;
  attemptedAt: string;
  completedAt?: string;
  outcome: InterventionAttemptOutcome;
  attestationRef: string;
  evidenceRefs: readonly string[];
  basisDigest: string;
};

export type OversightAssessmentDimension =
  | 'timeliness'
  | 'information-sufficiency'
  | 'authority'
  | 'technical-control'
  | 'operator-capacity'
  | 'overall-opportunity';

export type OversightAssessmentDisposition =
  | 'meaningful'
  | 'nominal'
  | 'unavailable'
  | 'indeterminate'
  | 'disputed';

export type OversightEffectivenessAssessment = {
  version: 'noe.oversight-assessment.v1';
  id: string;
  frontierId: string;
  actorId: string;
  decisionId: string;
  evaluatorId: string;
  attestationRef: string;
  method: string;
  methodVersion: string;
  dimension: OversightAssessmentDimension;
  disposition: OversightAssessmentDisposition;
  assessedAt: string;
  attemptRefs: readonly string[];
  consequenceObservationRefs: readonly string[];
  evidenceRefs: readonly string[];
  basisDigest: string;
};

export type InterventionStructuralDeficiency =
  | 'late-notice'
  | 'no-delivered-notice'
  | 'late-information'
  | 'no-effective-control'
  | 'no-acknowledgement'
  | 'late-acknowledgement'
  | 'control-window-closed'
  | 'unknown-effect-finality';

export type InterventionStructuralFacts = {
  windowDurationMs: number;
  noticeDeliveredBeforeDeadline: boolean;
  informationAvailableBeforeDeadline: boolean;
  controlAvailableBeforeDeadline: boolean;
  acknowledgementBeforeDeadline: boolean;
  structurallyActionable: boolean;
  deficiencies: readonly InterventionStructuralDeficiency[];
};

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required.`);
}

function parseTimestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp.`);
  return parsed;
}

function assertUniqueStrings(values: readonly string[], field: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    assertNonEmpty(value, field);
    if (seen.has(value)) throw new Error(`${field} contains duplicate value ${value}.`);
    seen.add(value);
  }
}

function assertOptionalTimestampOrdering(
  earlier: string | undefined,
  later: string | undefined,
  earlierField: string,
  laterField: string,
): void {
  if (earlier === undefined || later === undefined) return;
  if (parseTimestamp(later, laterField) < parseTimestamp(earlier, earlierField)) {
    throw new Error(`${laterField} cannot precede ${earlierField}.`);
  }
}

function assertNoticeStateConsistency(notice: OversightNotice): void {
  for (const ref of notice.evidenceRefs) assertNonEmpty(ref, 'notice.evidenceRef');
  if (notice.channel !== undefined) assertNonEmpty(notice.channel, 'notice.channel');

  if (notice.issuedAt !== undefined) parseTimestamp(notice.issuedAt, 'notice.issuedAt');
  if (notice.deliveredAt !== undefined) parseTimestamp(notice.deliveredAt, 'notice.deliveredAt');
  if (notice.acknowledgedAt !== undefined) {
    parseTimestamp(notice.acknowledgedAt, 'notice.acknowledgedAt');
  }

  assertOptionalTimestampOrdering(
    notice.issuedAt,
    notice.deliveredAt,
    'notice.issuedAt',
    'notice.deliveredAt',
  );
  assertOptionalTimestampOrdering(
    notice.deliveredAt,
    notice.acknowledgedAt,
    'notice.deliveredAt',
    'notice.acknowledgedAt',
  );

  if (notice.deliveryStatus === 'not-issued') {
    if (
      notice.issuedAt !== undefined ||
      notice.deliveredAt !== undefined ||
      notice.acknowledgedAt !== undefined
    ) {
      throw new Error('A not-issued notice cannot contain issue, delivery, or acknowledgement timestamps.');
    }
  }
  if (
    (notice.deliveryStatus === 'issued' ||
      notice.deliveryStatus === 'delivered' ||
      notice.deliveryStatus === 'acknowledged') &&
    notice.issuedAt === undefined
  ) {
    throw new Error(`notice.issuedAt is required when deliveryStatus is ${notice.deliveryStatus}.`);
  }
  if (
    (notice.deliveryStatus === 'delivered' || notice.deliveryStatus === 'acknowledged') &&
    notice.deliveredAt === undefined
  ) {
    throw new Error(`notice.deliveredAt is required when deliveryStatus is ${notice.deliveryStatus}.`);
  }
  if (notice.deliveryStatus === 'acknowledged' && notice.acknowledgedAt === undefined) {
    throw new Error('notice.acknowledgedAt is required when deliveryStatus is acknowledged.');
  }
}

function assertControl(control: InterventionControl, frontier: InterventionFrontierRecord): void {
  assertNonEmpty(control.id, 'control.id');
  assertNonEmpty(control.authorityRef, `control.${control.id}.authorityRef`);
  assertNonEmpty(control.enforcementRef, `control.${control.id}.enforcementRef`);
  assertNonEmpty(control.scopeDigest, `control.${control.id}.scopeDigest`);
  for (const ref of control.evidenceRefs) assertNonEmpty(ref, `control.${control.id}.evidenceRef`);

  const availableFrom = parseTimestamp(control.availableFrom, `control.${control.id}.availableFrom`);
  const availableUntil =
    control.availableUntil === undefined
      ? parseTimestamp(frontier.interventionDeadlineAt, 'interventionDeadlineAt')
      : parseTimestamp(control.availableUntil, `control.${control.id}.availableUntil`);

  if (availableUntil < availableFrom) {
    throw new Error(`control.${control.id}.availableUntil cannot precede availableFrom.`);
  }
}

/**
 * Validates reconstructable historical structure only. A structurally valid
 * record may still describe useless, late, nominal, or non-compliant
 * oversight. Those facts are preserved rather than rejected.
 */
export function assertValidInterventionFrontierRecord(record: InterventionFrontierRecord): void {
  if (record.version !== 'noe.intervention-frontier.v1') {
    throw new Error('Unsupported intervention frontier version.');
  }

  for (const [field, value] of [
    ['id', record.id],
    ['actorId', record.actorId],
    ['decisionId', record.decisionId],
    ['decisionFrontierRef', record.decisionFrontierRef],
    ['selectedActionDigest', record.selectedActionDigest],
    ['overseer.principalRef', record.overseer.principalRef],
    ['overseer.identityAttestationRef', record.overseer.identityAttestationRef],
    ['information.bundleDigest', record.information.bundleDigest],
    ['attestorId', record.attestorId],
    ['attestationRef', record.attestationRef],
    ['basisDigest', record.basisDigest],
  ] as const) {
    assertNonEmpty(value, field);
  }

  const decisionAt = parseTimestamp(record.decisionAt, 'decisionAt');
  const windowOpenedAt = parseTimestamp(record.windowOpenedAt, 'windowOpenedAt');
  const deadlineAt = parseTimestamp(record.interventionDeadlineAt, 'interventionDeadlineAt');
  const assignedAt = parseTimestamp(record.overseer.assignedAt, 'overseer.assignedAt');
  const informationAt = parseTimestamp(record.information.availableAt, 'information.availableAt');
  const capturedAt = parseTimestamp(record.capturedAt, 'capturedAt');
  void informationAt;

  if (deadlineAt < windowOpenedAt) {
    throw new Error('interventionDeadlineAt cannot precede windowOpenedAt.');
  }
  if (windowOpenedAt > deadlineAt) {
    throw new Error('Intervention window is invalid.');
  }
  if (assignedAt > deadlineAt && record.requirement.mode === 'mandatory') {
    // Preserve late assignment as a valid historical failure. No rejection.
  }
  if (record.captureMode === 'contemporaneous' && capturedAt > deadlineAt) {
    throw new Error(
      'A contemporaneous Intervention Frontier must be captured no later than interventionDeadlineAt.',
    );
  }

  // Decision can precede the oversight window, coincide with it, or occur
  // inside a pre-execution hold. It cannot occur after a claimed window has
  // already fully closed when the frontier is presented as contemporaneous.
  if (record.captureMode === 'contemporaneous' && decisionAt > deadlineAt) {
    throw new Error('A contemporaneous intervention window cannot close before decisionAt.');
  }

  assertUniqueStrings(record.requirement.policyRefs, 'requirement.policyRef');
  assertUniqueStrings(record.overseer.authorityRefs, 'overseer.authorityRef');
  assertUniqueStrings(record.overseer.competenceEvidenceRefs, 'overseer.competenceEvidenceRef');
  assertUniqueStrings(record.information.evidenceRefs, 'information.evidenceRef');
  assertUniqueStrings(record.information.forecastRefs, 'information.forecastRef');
  if (record.information.explanationRef !== undefined) {
    assertNonEmpty(record.information.explanationRef, 'information.explanationRef');
  }

  assertNoticeStateConsistency(record.notice);

  const controlIds = new Set<string>();
  for (const control of record.controls) {
    if (controlIds.has(control.id)) throw new Error(`Duplicate intervention control id: ${control.id}`);
    controlIds.add(control.id);
    assertControl(control, record);
  }

  if (record.fallback.enforcementRef !== undefined) {
    assertNonEmpty(record.fallback.enforcementRef, 'fallback.enforcementRef');
  }
  if (
    record.fallback.onNoResponse !== 'unknown' &&
    record.fallback.enforcementRef === undefined &&
    record.requirement.mode === 'mandatory'
  ) {
    // A fallback without an enforcement reference is historically possible.
    // It is classified structurally rather than rejected.
  }
}

export function assertInterventionFrontierMatchesDecisionFrontier(
  record: InterventionFrontierRecord,
  frontier: {
    id: string;
    actorId: string;
    decisionId: string;
    executionId?: string;
    decisionAt: string;
    selectedActionDigest: string;
  },
): void {
  if (record.decisionFrontierRef !== frontier.id) {
    throw new Error('Intervention Frontier references the wrong Decision Frontier.');
  }
  if (record.actorId !== frontier.actorId) {
    throw new Error('Intervention Frontier actorId does not match Decision Frontier actorId.');
  }
  if (record.decisionId !== frontier.decisionId) {
    throw new Error('Intervention Frontier decisionId does not match Decision Frontier.');
  }
  if (record.decisionAt !== frontier.decisionAt) {
    throw new Error('Intervention Frontier decisionAt does not match Decision Frontier.');
  }
  if (record.selectedActionDigest !== frontier.selectedActionDigest) {
    throw new Error('Intervention Frontier selectedActionDigest does not match Decision Frontier.');
  }
  if (
    record.executionId !== undefined &&
    frontier.executionId !== undefined &&
    record.executionId !== frontier.executionId
  ) {
    throw new Error('Intervention Frontier executionId does not match Decision Frontier executionId.');
  }
}

export function deriveInterventionStructuralFacts(
  record: InterventionFrontierRecord,
): InterventionStructuralFacts {
  assertValidInterventionFrontierRecord(record);
  const deadlineAt = parseTimestamp(record.interventionDeadlineAt, 'interventionDeadlineAt');
  const openedAt = parseTimestamp(record.windowOpenedAt, 'windowOpenedAt');
  const deliveredAt =
    record.notice.deliveredAt === undefined
      ? null
      : parseTimestamp(record.notice.deliveredAt, 'notice.deliveredAt');
  const acknowledgedAt =
    record.notice.acknowledgedAt === undefined
      ? null
      : parseTimestamp(record.notice.acknowledgedAt, 'notice.acknowledgedAt');
  const informationAt = parseTimestamp(record.information.availableAt, 'information.availableAt');

  const noticeDeliveredBeforeDeadline = deliveredAt !== null && deliveredAt <= deadlineAt;
  const acknowledgementBeforeDeadline = acknowledgedAt !== null && acknowledgedAt <= deadlineAt;
  const informationAvailableBeforeDeadline = informationAt <= deadlineAt;
  const controlAvailableBeforeDeadline = record.controls.some((control) => {
    const from = parseTimestamp(control.availableFrom, `control.${control.id}.availableFrom`);
    const until =
      control.availableUntil === undefined
        ? deadlineAt
        : parseTimestamp(control.availableUntil, `control.${control.id}.availableUntil`);
    return from <= deadlineAt && until >= openedAt && until >= from;
  });

  const deficiencies: InterventionStructuralDeficiency[] = [];
  if (record.closeReason === 'unknown') deficiencies.push('unknown-effect-finality');
  if (deliveredAt === null) deficiencies.push('no-delivered-notice');
  else if (deliveredAt > deadlineAt) deficiencies.push('late-notice');
  if (!informationAvailableBeforeDeadline) deficiencies.push('late-information');
  if (!controlAvailableBeforeDeadline) deficiencies.push('no-effective-control');
  if (acknowledgedAt === null) deficiencies.push('no-acknowledgement');
  else if (acknowledgedAt > deadlineAt) deficiencies.push('late-acknowledgement');
  if (deadlineAt <= openedAt) deficiencies.push('control-window-closed');

  return {
    windowDurationMs: Math.max(0, deadlineAt - openedAt),
    noticeDeliveredBeforeDeadline,
    informationAvailableBeforeDeadline,
    controlAvailableBeforeDeadline,
    acknowledgementBeforeDeadline,
    structurallyActionable:
      noticeDeliveredBeforeDeadline &&
      informationAvailableBeforeDeadline &&
      controlAvailableBeforeDeadline &&
      deadlineAt > openedAt,
    deficiencies,
  };
}

export function assertValidInterventionAttemptRecord(
  attempt: InterventionAttemptRecord,
  frontier: InterventionFrontierRecord,
): void {
  if (attempt.version !== 'noe.intervention-attempt.v1') {
    throw new Error('Unsupported intervention attempt version.');
  }

  for (const [field, value] of [
    ['id', attempt.id],
    ['frontierId', attempt.frontierId],
    ['actorId', attempt.actorId],
    ['decisionId', attempt.decisionId],
    ['overseerPrincipalRef', attempt.overseerPrincipalRef],
    ['controlId', attempt.controlId],
    ['attestationRef', attempt.attestationRef],
    ['basisDigest', attempt.basisDigest],
  ] as const) {
    assertNonEmpty(value, field);
  }

  if (attempt.frontierId !== frontier.id) throw new Error('Attempt references the wrong Intervention Frontier.');
  if (attempt.actorId !== frontier.actorId) throw new Error('Attempt actorId does not match Intervention Frontier.');
  if (attempt.decisionId !== frontier.decisionId) {
    throw new Error('Attempt decisionId does not match Intervention Frontier.');
  }
  if (attempt.overseerPrincipalRef !== frontier.overseer.principalRef) {
    throw new Error('Attempt overseer does not match the historically designated overseer.');
  }

  const control = frontier.controls.find((item) => item.id === attempt.controlId);
  if (!control) throw new Error(`Attempt references unknown intervention control ${attempt.controlId}.`);
  if (control.kind !== attempt.controlKind) {
    throw new Error('Attempt controlKind does not match the historical intervention control.');
  }

  const attemptedAt = parseTimestamp(attempt.attemptedAt, 'attemptedAt');
  const completedAt =
    attempt.completedAt === undefined
      ? null
      : parseTimestamp(attempt.completedAt, 'completedAt');
  const deadlineAt = parseTimestamp(frontier.interventionDeadlineAt, 'interventionDeadlineAt');
  const controlFrom = parseTimestamp(control.availableFrom, `control.${control.id}.availableFrom`);
  const controlUntil =
    control.availableUntil === undefined
      ? deadlineAt
      : parseTimestamp(control.availableUntil, `control.${control.id}.availableUntil`);

  if (completedAt !== null && completedAt < attemptedAt) {
    throw new Error('completedAt cannot precede attemptedAt.');
  }

  const outsideEffectiveWindow =
    attemptedAt < controlFrom || attemptedAt > controlUntil || attemptedAt > deadlineAt;
  if (outsideEffectiveWindow && attempt.outcome === 'succeeded') {
    throw new Error('An intervention outside its effective control window cannot be recorded as succeeded.');
  }
  if (attemptedAt > deadlineAt && attempt.outcome !== 'too-late') {
    throw new Error('An intervention attempted after effect finality must be recorded as too-late.');
  }

  for (const ref of attempt.evidenceRefs) assertNonEmpty(ref, 'attempt.evidenceRef');
}

export function assertValidOversightEffectivenessAssessment(
  assessment: OversightEffectivenessAssessment,
  frontier: InterventionFrontierRecord,
): void {
  if (assessment.version !== 'noe.oversight-assessment.v1') {
    throw new Error('Unsupported oversight assessment version.');
  }

  for (const [field, value] of [
    ['id', assessment.id],
    ['frontierId', assessment.frontierId],
    ['actorId', assessment.actorId],
    ['decisionId', assessment.decisionId],
    ['evaluatorId', assessment.evaluatorId],
    ['attestationRef', assessment.attestationRef],
    ['method', assessment.method],
    ['methodVersion', assessment.methodVersion],
    ['basisDigest', assessment.basisDigest],
  ] as const) {
    assertNonEmpty(value, field);
  }

  if (assessment.frontierId !== frontier.id) {
    throw new Error('Oversight assessment references the wrong Intervention Frontier.');
  }
  if (assessment.actorId !== frontier.actorId) {
    throw new Error('Oversight assessment actorId does not match Intervention Frontier.');
  }
  if (assessment.decisionId !== frontier.decisionId) {
    throw new Error('Oversight assessment decisionId does not match Intervention Frontier.');
  }

  const assessedAt = parseTimestamp(assessment.assessedAt, 'assessedAt');
  const deadlineAt = parseTimestamp(frontier.interventionDeadlineAt, 'interventionDeadlineAt');
  if (assessedAt < deadlineAt) {
    throw new Error('Oversight assessment cannot predate the close of the intervention window.');
  }

  assertUniqueStrings(assessment.attemptRefs, 'assessment.attemptRef');
  assertUniqueStrings(
    assessment.consequenceObservationRefs,
    'assessment.consequenceObservationRef',
  );
  assertUniqueStrings(assessment.evidenceRefs, 'assessment.evidenceRef');
}
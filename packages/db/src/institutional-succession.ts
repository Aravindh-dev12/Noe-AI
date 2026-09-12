import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { canonicalJson } from '@onbae/event-model';

import type { RegistryContext } from './continuity.js';
import { appendCanonicalActorEvent } from './events.js';
import { db } from './index.js';

type JsonObject = Record<string, unknown>;

export type SuccessionAgreementKind = 'NOVATION' | 'ASSIGNMENT' | 'REAUTHORIZATION' | 'MIXED';
export type SuccessionAgreementStatus = 'PROPOSED' | 'EFFECTIVE' | 'REJECTED' | 'SUPERSEDED';
export type SuccessionPartyRole =
  | 'PREDECESSOR'
  | 'SUCCESSOR'
  | 'COUNTERPARTY'
  | 'AUTHORITY_ISSUER'
  | 'ADJUDICATOR';
export type SuccessionConsentDisposition = 'CONSENTED' | 'CONDITIONAL' | 'REJECTED';
export type SuccessionItemType =
  | 'DEBTOR_NOVATION'
  | 'CREDITOR_ASSIGNMENT'
  | 'AUTHORITY_REISSUANCE';
export type PredecessorLiabilityMode =
  | 'RELEASED'
  | 'RETAINED_SECONDARY'
  | 'GUARANTOR'
  | 'NOT_APPLICABLE';

export type SuccessionPartyInput = {
  role: SuccessionPartyRole;
  principalType: string;
  principalRef: string;
  required?: boolean;
  metadata?: JsonObject;
};

export type CreateSuccessionAgreementInput = {
  predecessorActorId: string;
  successorActorId: string;
  successionKind: SuccessionAgreementKind;
  context: string;
  policyFramework?: string | null;
  policyVersion: string;
  legalContextSnapshotId?: string | null;
  sourceEvidenceArtifactId: string;
  recognitionAssessmentId?: string | null;
  parties: SuccessionPartyInput[];
  proposedAt?: Date;
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type RecordSuccessionConsentInput = {
  agreementId: string;
  partyId: string;
  disposition: SuccessionConsentDisposition;
  evidenceArtifactId: string;
  method: string;
  methodVersion: string;
  assessedAt?: Date;
  validUntil?: Date | null;
  conditions?: string[];
  reasons?: string[];
  idempotencyKey: string;
  metadata?: JsonObject;
};

export type AddSuccessionItemInput = {
  agreementId: string;
  itemType: SuccessionItemType;
  sourceCommitmentId?: string | null;
  sourceAuthorityGrantId?: string | null;
  requestedAuthorityGrantId?: string | null;
  predecessorLiabilityMode?: PredecessorLiabilityMode;
  idempotencyKey: string;
  metadata?: JsonObject;
};

type AgreementRow = {
  id: string;
  predecessorActorId: string;
  successorActorId: string;
  status: SuccessionAgreementStatus;
  successionKind: SuccessionAgreementKind;
  context: string;
  policyFramework: string | null;
  policyVersion: string;
  legalContextSnapshotId: string | null;
  sourceEvidenceArtifactId: string;
  recognitionAssessmentId: string | null;
  proposedAt: Date;
  effectiveAt: Date | null;
  agreementDigest: string;
  activationBasis: Prisma.JsonValue | null;
  activationBasisDigest: string | null;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

type PartyRow = {
  id: string;
  agreementId: string;
  role: SuccessionPartyRole;
  principalType: string;
  principalRef: string;
  required: boolean;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type ConsentRow = {
  id: string;
  agreementId: string;
  partyId: string;
  disposition: SuccessionConsentDisposition;
  evidenceArtifactId: string;
  method: string;
  methodVersion: string;
  assessedAt: Date;
  validUntil: Date | null;
  conditions: string[];
  reasons: string[];
  basisDigest: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type ItemRow = {
  id: string;
  agreementId: string;
  itemType: SuccessionItemType;
  sourceCommitmentId: string | null;
  sourceAuthorityGrantId: string | null;
  requestedAuthorityGrantId: string | null;
  resultingCommitmentId: string | null;
  resultingAuthorityGrantId: string | null;
  predecessorLiabilityMode: PredecessorLiabilityMode;
  status: 'PENDING' | 'EFFECTIVE' | 'REJECTED';
  itemDigest: string;
  idempotencyKey: string;
  effectiveAt: Date | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type RecognitionRow = {
  id: string;
  actorId: string;
  relation: string;
  disposition: string;
  context: string;
  assessedAt: Date;
  validUntil: Date | null;
};

type ActivationBasis = {
  effectiveAt?: string;
  requiredConsents?: Array<{ partyId: string; consentId: string; basisDigest: string }>;
  items?: Array<{
    itemId: string;
    itemType: SuccessionItemType;
    itemDigest: string;
    resultingCommitmentId: string | null;
    resultingAuthorityGrantId: string | null;
    predecessorLiabilityMode: PredecessorLiabilityMode;
  }>;
};

export class InstitutionalSuccessionValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'InstitutionalSuccessionValidationError';
  }
}

export class InstitutionalSuccessionConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'InstitutionalSuccessionConflictError';
  }
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function json(value: unknown): Prisma.Sql {
  return Prisma.sql`CAST(${JSON.stringify(value)} AS jsonb)`;
}

function textArray(values: string[]): Prisma.Sql {
  return values.length === 0
    ? Prisma.sql`ARRAY[]::TEXT[]`
    : Prisma.sql`ARRAY[${Prisma.join(values)}]::TEXT[]`;
}

function required(value: string, field: string, max = 500): string {
  const normalized = value.trim();
  if (!normalized) throw new InstitutionalSuccessionValidationError(`${field} is required.`);
  if (normalized.length > max) {
    throw new InstitutionalSuccessionValidationError(`${field} exceeds ${max} characters.`);
  }
  return normalized;
}

function optional(value: string | null | undefined, max = 500): string | null {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  if (normalized.length > max) {
    throw new InstitutionalSuccessionValidationError(`Optional value exceeds ${max} characters.`);
  }
  return normalized;
}

function labels(values: string[] | undefined, field: string): string[] {
  const normalized = [...new Set((values ?? []).map((item) => item.trim()).filter(Boolean))].sort();
  if (normalized.length > 64 || normalized.some((item) => item.length > 1_000)) {
    throw new InstitutionalSuccessionValidationError(`${field} exceeds supported bounds.`);
  }
  return normalized;
}

function normalizeParties(parties: SuccessionPartyInput[]): Array<{
  role: SuccessionPartyRole;
  principalType: string;
  principalRef: string;
  required: boolean;
  metadata: JsonObject;
}> {
  if (parties.length < 2 || parties.length > 64) {
    throw new InstitutionalSuccessionValidationError('An agreement requires 2-64 parties.');
  }

  const normalized = parties.map((party) => ({
    role: party.role,
    principalType: required(party.principalType, 'principalType', 120).toLowerCase(),
    principalRef: required(party.principalRef, 'principalRef'),
    required: party.required ?? true,
    metadata: party.metadata ?? {},
  }));

  const identities = new Set<string>();
  for (const party of normalized) {
    const identity = `${party.role}|${party.principalType}|${party.principalRef}`;
    if (identities.has(identity)) {
      throw new InstitutionalSuccessionValidationError('Duplicate succession party identity.');
    }
    identities.add(identity);
  }

  return normalized.sort((a, b) =>
    `${a.role}|${a.principalType}|${a.principalRef}`.localeCompare(
      `${b.role}|${b.principalType}|${b.principalRef}`,
    ),
  );
}

function agreementBasis(input: {
  predecessorActorId: string;
  successorActorId: string;
  successionKind: SuccessionAgreementKind;
  context: string;
  policyFramework: string | null;
  policyVersion: string;
  legalContextSnapshotId: string | null;
  sourceEvidenceArtifactId: string;
  recognitionAssessmentId: string | null;
  proposedAt: Date;
  parties: Array<{
    role: SuccessionPartyRole;
    principalType: string;
    principalRef: string;
    required: boolean;
    metadata: JsonObject;
  }>;
  metadata: JsonObject;
}) {
  return {
    version: 'noeone.institutional-succession-agreement.v1',
    predecessorActorId: input.predecessorActorId,
    successorActorId: input.successorActorId,
    successionKind: input.successionKind,
    context: input.context,
    policyFramework: input.policyFramework,
    policyVersion: input.policyVersion,
    legalContextSnapshotId: input.legalContextSnapshotId,
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
    recognitionAssessmentId: input.recognitionAssessmentId,
    proposedAt: input.proposedAt.toISOString(),
    parties: input.parties,
    metadata: input.metadata,
  };
}

function consentBasis(input: {
  agreementDigest: string;
  party: PartyRow;
  disposition: SuccessionConsentDisposition;
  evidenceArtifactId: string;
  method: string;
  methodVersion: string;
  assessedAt: Date;
  validUntil: Date | null;
  conditions: string[];
  reasons: string[];
  metadata: JsonObject;
}) {
  return {
    version: 'noeone.institutional-succession-consent.v1',
    agreementDigest: input.agreementDigest,
    party: {
      id: input.party.id,
      role: input.party.role,
      principalType: input.party.principalType,
      principalRef: input.party.principalRef,
      required: input.party.required,
    },
    disposition: input.disposition,
    evidenceArtifactId: input.evidenceArtifactId,
    method: input.method,
    methodVersion: input.methodVersion,
    assessedAt: input.assessedAt.toISOString(),
    validUntil: input.validUntil?.toISOString() ?? null,
    conditions: input.conditions,
    reasons: input.reasons,
    metadata: input.metadata,
  };
}

function itemBasis(input: {
  agreementDigest: string;
  itemType: SuccessionItemType;
  sourceCommitmentId: string | null;
  sourceAuthorityGrantId: string | null;
  requestedAuthorityGrantId: string | null;
  predecessorLiabilityMode: PredecessorLiabilityMode;
  metadata: JsonObject;
}) {
  return {
    version: 'noeone.institutional-succession-item.v1',
    agreementDigest: input.agreementDigest,
    itemType: input.itemType,
    sourceCommitmentId: input.sourceCommitmentId,
    sourceAuthorityGrantId: input.sourceAuthorityGrantId,
    requestedAuthorityGrantId: input.requestedAuthorityGrantId,
    predecessorLiabilityMode: input.predecessorLiabilityMode,
    metadata: input.metadata,
  };
}

async function loadAgreement(id: string, tx: Prisma.TransactionClient | typeof db = db): Promise<AgreementRow> {
  const rows = await tx.$queryRaw<AgreementRow[]>(Prisma.sql`
    SELECT * FROM "InstitutionalSuccessionAgreement" WHERE "id" = ${id} LIMIT 1
  `);
  if (!rows[0]) throw Object.assign(new Error('Institutional succession agreement not found.'), { statusCode: 404 });
  return rows[0];
}

async function loadParties(agreementId: string, tx: Prisma.TransactionClient | typeof db = db): Promise<PartyRow[]> {
  return tx.$queryRaw<PartyRow[]>(Prisma.sql`
    SELECT * FROM "InstitutionalSuccessionParty"
    WHERE "agreementId" = ${agreementId}
    ORDER BY "role", "principalType", "principalRef", "id"
  `);
}

async function loadItems(agreementId: string, tx: Prisma.TransactionClient | typeof db = db): Promise<ItemRow[]> {
  return tx.$queryRaw<ItemRow[]>(Prisma.sql`
    SELECT * FROM "InstitutionalSuccessionItem"
    WHERE "agreementId" = ${agreementId}
    ORDER BY "createdAt", "id"
  `);
}

async function loadConsents(agreementId: string, tx: Prisma.TransactionClient | typeof db = db): Promise<ConsentRow[]> {
  return tx.$queryRaw<ConsentRow[]>(Prisma.sql`
    SELECT * FROM "InstitutionalSuccessionConsent"
    WHERE "agreementId" = ${agreementId}
    ORDER BY "assessedAt", "id"
  `);
}

async function requireActor(id: string, tx: Prisma.TransactionClient | typeof db = db): Promise<void> {
  const actor = await tx.actor.findUnique({ where: { id }, select: { id: true } });
  if (!actor) throw Object.assign(new Error(`Actor ${id} not found.`), { statusCode: 404 });
}

async function requireEvidence(id: string, tx: Prisma.TransactionClient | typeof db = db): Promise<void> {
  const artifact = await tx.evidenceArtifact.findUnique({ where: { id }, select: { id: true } });
  if (!artifact) throw Object.assign(new Error('Evidence artifact not found.'), { statusCode: 404 });
}

async function requireEvidenceBoundToActor(
  actorId: string,
  evidenceArtifactId: string,
  tx: Prisma.TransactionClient | typeof db = db,
): Promise<void> {
  const binding = await tx.actorEvidenceBinding.findFirst({
    where: { actorId, evidenceArtifactId },
    select: { id: true },
  });
  if (!binding) {
    throw new InstitutionalSuccessionConflictError(
      `Evidence ${evidenceArtifactId} is not bound to actor ${actorId}.`,
    );
  }
}

async function loadRecognition(
  id: string,
  tx: Prisma.TransactionClient | typeof db = db,
): Promise<RecognitionRow> {
  const rows = await tx.$queryRaw<RecognitionRow[]>(Prisma.sql`
    SELECT "id", "actorId", "relation", "disposition", "context", "assessedAt", "validUntil"
    FROM "ContinuityRecognitionAssessment"
    WHERE "id" = ${id} LIMIT 1
  `);
  if (!rows[0]) throw Object.assign(new Error('Recognition assessment not found.'), { statusCode: 404 });
  return rows[0];
}

function assertRecognitionSupportsSuccessor(
  recognition: RecognitionRow,
  successorActorId: string,
  at?: Date,
): void {
  if (recognition.actorId !== successorActorId) {
    throw new InstitutionalSuccessionConflictError('Recognition assessment does not belong to successor actor.');
  }
  if (recognition.relation !== 'SUCCESSOR' || recognition.disposition !== 'RECOGNIZED') {
    throw new InstitutionalSuccessionConflictError(
      'Referenced recognition assessment must be SUCCESSOR / RECOGNIZED.',
    );
  }
  if (at && (recognition.assessedAt > at || (recognition.validUntil && recognition.validUntil <= at))) {
    throw new InstitutionalSuccessionConflictError('Recognition assessment is not valid at succession effective time.');
  }
}

function partyMatchesActor(
  parties: Array<{ role: SuccessionPartyRole; principalType: string; principalRef: string; required: boolean }>,
  role: 'PREDECESSOR' | 'SUCCESSOR',
  actorId: string,
): boolean {
  return parties.some(
    (party) =>
      party.role === role &&
      party.principalType === 'actor' &&
      party.principalRef === actorId &&
      party.required,
  );
}

export async function createInstitutionalSuccessionAgreement(input: CreateSuccessionAgreementInput) {
  if (input.predecessorActorId === input.successorActorId) {
    throw new InstitutionalSuccessionValidationError('Predecessor and successor must be different actors.');
  }

  const existingRows = await db.$queryRaw<AgreementRow[]>(Prisma.sql`
    SELECT * FROM "InstitutionalSuccessionAgreement"
    WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
  `);
  const existing = existingRows[0] ?? null;
  const proposedAt = input.proposedAt ?? existing?.proposedAt ?? new Date();
  const parties = normalizeParties(input.parties);
  const context = required(input.context, 'context', 240).toLowerCase();
  const policyFramework = optional(input.policyFramework, 240)?.toLowerCase() ?? null;
  const policyVersion = required(input.policyVersion, 'policyVersion', 120);
  const metadata = input.metadata ?? {};

  if (!partyMatchesActor(parties, 'PREDECESSOR', input.predecessorActorId)) {
    throw new InstitutionalSuccessionValidationError(
      'A required PREDECESSOR actor party matching predecessorActorId is required.',
    );
  }
  if (!partyMatchesActor(parties, 'SUCCESSOR', input.successorActorId)) {
    throw new InstitutionalSuccessionValidationError(
      'A required SUCCESSOR actor party matching successorActorId is required.',
    );
  }

  const basis = agreementBasis({
    predecessorActorId: input.predecessorActorId,
    successorActorId: input.successorActorId,
    successionKind: input.successionKind,
    context,
    policyFramework,
    policyVersion,
    legalContextSnapshotId: input.legalContextSnapshotId ?? null,
    sourceEvidenceArtifactId: input.sourceEvidenceArtifactId,
    recognitionAssessmentId: input.recognitionAssessmentId ?? null,
    proposedAt,
    parties,
    metadata,
  });
  const agreementDigest = sha256(basis);

  if (existing) {
    if (existing.agreementDigest !== agreementDigest) {
      throw new InstitutionalSuccessionConflictError(
        'Succession agreement idempotency key was reused with conflicting proposal data.',
      );
    }
    return {
      agreement: existing,
      parties: await loadParties(existing.id),
      replayed: true,
    };
  }

  await requireActor(input.predecessorActorId);
  await requireActor(input.successorActorId);
  await requireEvidence(input.sourceEvidenceArtifactId);
  await requireEvidenceBoundToActor(input.predecessorActorId, input.sourceEvidenceArtifactId);
  await requireEvidenceBoundToActor(input.successorActorId, input.sourceEvidenceArtifactId);

  if (input.legalContextSnapshotId) {
    const legal = await db.legalContextSnapshot.findUnique({
      where: { id: input.legalContextSnapshotId },
      select: { id: true },
    });
    if (!legal) throw Object.assign(new Error('Legal context snapshot not found.'), { statusCode: 404 });
  }

  if (input.recognitionAssessmentId) {
    assertRecognitionSupportsSuccessor(
      await loadRecognition(input.recognitionAssessmentId),
      input.successorActorId,
    );
  }

  const agreementId = `suc_${randomUUID()}`;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "InstitutionalSuccessionAgreement" (
        "id", "predecessorActorId", "successorActorId", "status", "successionKind",
        "context", "policyFramework", "policyVersion", "legalContextSnapshotId",
        "sourceEvidenceArtifactId", "recognitionAssessmentId", "proposedAt",
        "agreementDigest", "idempotencyKey", "metadata"
      ) VALUES (
        ${agreementId}, ${input.predecessorActorId}, ${input.successorActorId}, 'PROPOSED',
        ${input.successionKind}, ${context}, ${policyFramework}, ${policyVersion},
        ${input.legalContextSnapshotId ?? null}, ${input.sourceEvidenceArtifactId},
        ${input.recognitionAssessmentId ?? null}, ${proposedAt}, ${agreementDigest},
        ${input.idempotencyKey}, ${json(metadata)}
      )
    `);

    for (const party of parties) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "InstitutionalSuccessionParty" (
          "id", "agreementId", "role", "principalType", "principalRef", "required", "metadata"
        ) VALUES (
          ${`sup_${randomUUID()}`}, ${agreementId}, ${party.role}, ${party.principalType},
          ${party.principalRef}, ${party.required}, ${json(party.metadata)}
        )
      `);
    }
  });

  return {
    agreement: await loadAgreement(agreementId),
    parties: await loadParties(agreementId),
    replayed: false,
  };
}

export async function recordInstitutionalSuccessionConsent(input: RecordSuccessionConsentInput) {
  const agreement = await loadAgreement(input.agreementId);
  if (agreement.status !== 'PROPOSED') {
    throw new InstitutionalSuccessionConflictError('Consent can only be added to a proposed agreement.');
  }
  const parties = await loadParties(input.agreementId);
  const party = parties.find((candidate) => candidate.id === input.partyId);
  if (!party) throw Object.assign(new Error('Succession party not found.'), { statusCode: 404 });

  await requireEvidence(input.evidenceArtifactId);
  if (party.principalType === 'actor') {
    await requireEvidenceBoundToActor(party.principalRef, input.evidenceArtifactId);
  }

  const existingRows = await db.$queryRaw<ConsentRow[]>(Prisma.sql`
    SELECT * FROM "InstitutionalSuccessionConsent"
    WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
  `);
  const existing = existingRows[0] ?? null;
  const assessedAt = input.assessedAt ?? existing?.assessedAt ?? new Date();
  const validUntil = input.validUntil === undefined ? (existing?.validUntil ?? null) : input.validUntil;
  if (validUntil && validUntil <= assessedAt) {
    throw new InstitutionalSuccessionValidationError('validUntil must be later than assessedAt.');
  }

  const conditions = labels(input.conditions, 'conditions');
  const reasons = labels(input.reasons, 'reasons');
  const method = required(input.method, 'method', 240).toLowerCase();
  const methodVersion = required(input.methodVersion, 'methodVersion', 120);
  const metadata = input.metadata ?? {};
  const basisDigest = sha256(
    consentBasis({
      agreementDigest: agreement.agreementDigest,
      party,
      disposition: input.disposition,
      evidenceArtifactId: input.evidenceArtifactId,
      method,
      methodVersion,
      assessedAt,
      validUntil,
      conditions,
      reasons,
      metadata,
    }),
  );

  if (existing) {
    if (existing.basisDigest !== basisDigest) {
      throw new InstitutionalSuccessionConflictError(
        'Succession consent idempotency key was reused with conflicting data.',
      );
    }
    return { consent: existing, replayed: true };
  }

  const id = `sucn_${randomUUID()}`;
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "InstitutionalSuccessionConsent" (
      "id", "agreementId", "partyId", "disposition", "evidenceArtifactId", "method",
      "methodVersion", "assessedAt", "validUntil", "conditions", "reasons", "basisDigest",
      "idempotencyKey", "metadata"
    ) VALUES (
      ${id}, ${input.agreementId}, ${input.partyId}, ${input.disposition},
      ${input.evidenceArtifactId}, ${method}, ${methodVersion}, ${assessedAt}, ${validUntil},
      ${textArray(conditions)}, ${textArray(reasons)}, ${basisDigest}, ${input.idempotencyKey},
      ${json(metadata)}
    )
  `);

  const rows = await db.$queryRaw<ConsentRow[]>(Prisma.sql`
    SELECT * FROM "InstitutionalSuccessionConsent" WHERE "id" = ${id} LIMIT 1
  `);
  return { consent: rows[0]!, replayed: false };
}

function assertSubset(child: string[], parent: string[], label: string): void {
  const parentSet = new Set(parent);
  const excess = child.filter((value) => !parentSet.has(value));
  if (excess.length) {
    throw new InstitutionalSuccessionConflictError(
      `Reissued authority expands ${label}: ${excess.join(', ')}.`,
    );
  }
}

function assertAuthorityReissuanceNonAmplifying(source: {
  status: string;
  grantorType: string;
  grantorRef: string;
  actions: string[];
  resources: string[];
  maxAmountMinor: string | null;
  currency: string | null;
  issuedAt: Date;
  notBefore: Date | null;
  expiresAt: Date | null;
  remainingDelegationDepth: number;
}, target: {
  status: string;
  grantorType: string;
  grantorRef: string;
  actions: string[];
  resources: string[];
  maxAmountMinor: string | null;
  currency: string | null;
  issuedAt: Date;
  notBefore: Date | null;
  expiresAt: Date | null;
  remainingDelegationDepth: number;
}): void {
  if (source.status !== 'ACTIVE') {
    throw new InstitutionalSuccessionConflictError('Source authority grant is not active.');
  }
  if (target.status !== 'ACTIVE') {
    throw new InstitutionalSuccessionConflictError('Reissued authority grant is not active.');
  }
  if (source.grantorType !== target.grantorType || source.grantorRef !== target.grantorRef) {
    throw new InstitutionalSuccessionConflictError(
      'Authority reissuance must come from the same recorded grantor.',
    );
  }
  assertSubset(target.actions, source.actions, 'actions');
  assertSubset(target.resources, source.resources, 'resources');
  if (target.remainingDelegationDepth > source.remainingDelegationDepth) {
    throw new InstitutionalSuccessionConflictError('Reissued authority increases delegation depth.');
  }
  if (source.maxAmountMinor !== null) {
    if (target.maxAmountMinor === null || BigInt(target.maxAmountMinor) > BigInt(source.maxAmountMinor)) {
      throw new InstitutionalSuccessionConflictError('Reissued authority increases monetary cap.');
    }
    if (target.currency !== source.currency) {
      throw new InstitutionalSuccessionConflictError('Reissued authority changes capped currency.');
    }
  }
  const sourceStart = source.notBefore ?? source.issuedAt;
  const targetStart = target.notBefore ?? target.issuedAt;
  if (targetStart < sourceStart) {
    throw new InstitutionalSuccessionConflictError('Reissued authority starts before source grant.');
  }
  if (source.expiresAt && (!target.expiresAt || target.expiresAt > source.expiresAt)) {
    throw new InstitutionalSuccessionConflictError('Reissued authority outlives source grant.');
  }
}

export async function addInstitutionalSuccessionItem(input: AddSuccessionItemInput) {
  const agreement = await loadAgreement(input.agreementId);
  if (agreement.status !== 'PROPOSED') {
    throw new InstitutionalSuccessionConflictError('Items can only be added to a proposed agreement.');
  }

  const metadata = input.metadata ?? {};
  let sourceCommitmentId: string | null = null;
  let sourceAuthorityGrantId: string | null = null;
  let requestedAuthorityGrantId: string | null = null;
  let predecessorLiabilityMode: PredecessorLiabilityMode = 'NOT_APPLICABLE';

  if (input.itemType === 'DEBTOR_NOVATION' || input.itemType === 'CREDITOR_ASSIGNMENT') {
    sourceCommitmentId = required(input.sourceCommitmentId ?? '', 'sourceCommitmentId');
    const commitment = await db.commitment.findUnique({ where: { id: sourceCommitmentId } });
    if (!commitment) throw Object.assign(new Error('Source commitment not found.'), { statusCode: 404 });
    if (commitment.status !== 'OPEN') {
      throw new InstitutionalSuccessionConflictError('V1 only transfers OPEN commitments.');
    }
    if (input.itemType === 'DEBTOR_NOVATION') {
      if (commitment.debtorActorId !== agreement.predecessorActorId) {
        throw new InstitutionalSuccessionConflictError(
          'Debtor novation source commitment is not owed by predecessor actor.',
        );
      }
      predecessorLiabilityMode = input.predecessorLiabilityMode ?? 'RELEASED';
      if (predecessorLiabilityMode === 'NOT_APPLICABLE') {
        throw new InstitutionalSuccessionValidationError(
          'Debtor novation requires an explicit predecessor liability mode.',
        );
      }
    } else {
      if (commitment.creditorActorId !== agreement.predecessorActorId) {
        throw new InstitutionalSuccessionConflictError(
          'Creditor assignment source commitment does not name predecessor as actor creditor.',
        );
      }
      predecessorLiabilityMode = 'NOT_APPLICABLE';
    }
  } else {
    sourceAuthorityGrantId = required(input.sourceAuthorityGrantId ?? '', 'sourceAuthorityGrantId');
    requestedAuthorityGrantId = required(
      input.requestedAuthorityGrantId ?? '',
      'requestedAuthorityGrantId',
    );
    const [source, target] = await Promise.all([
      db.authorityGrant.findUnique({ where: { id: sourceAuthorityGrantId } }),
      db.authorityGrant.findUnique({ where: { id: requestedAuthorityGrantId } }),
    ]);
    if (!source || !target) {
      throw Object.assign(new Error('Source or requested authority grant not found.'), { statusCode: 404 });
    }
    if (source.subjectActorId !== agreement.predecessorActorId) {
      throw new InstitutionalSuccessionConflictError('Source authority grant does not belong to predecessor actor.');
    }
    if (target.subjectActorId !== agreement.successorActorId) {
      throw new InstitutionalSuccessionConflictError('Requested authority grant does not belong to successor actor.');
    }
    assertAuthorityReissuanceNonAmplifying(source, target);
  }

  const digest = sha256(
    itemBasis({
      agreementDigest: agreement.agreementDigest,
      itemType: input.itemType,
      sourceCommitmentId,
      sourceAuthorityGrantId,
      requestedAuthorityGrantId,
      predecessorLiabilityMode,
      metadata,
    }),
  );

  const existingRows = await db.$queryRaw<ItemRow[]>(Prisma.sql`
    SELECT * FROM "InstitutionalSuccessionItem"
    WHERE "idempotencyKey" = ${input.idempotencyKey} LIMIT 1
  `);
  const existing = existingRows[0] ?? null;
  if (existing) {
    if (existing.itemDigest !== digest) {
      throw new InstitutionalSuccessionConflictError(
        'Succession item idempotency key was reused with conflicting data.',
      );
    }
    return { item: existing, replayed: true };
  }

  const id = `sui_${randomUUID()}`;
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "InstitutionalSuccessionItem" (
      "id", "agreementId", "itemType", "sourceCommitmentId", "sourceAuthorityGrantId",
      "requestedAuthorityGrantId", "predecessorLiabilityMode", "status", "itemDigest",
      "idempotencyKey", "metadata"
    ) VALUES (
      ${id}, ${input.agreementId}, ${input.itemType}, ${sourceCommitmentId},
      ${sourceAuthorityGrantId}, ${requestedAuthorityGrantId}, ${predecessorLiabilityMode},
      'PENDING', ${digest}, ${input.idempotencyKey}, ${json(metadata)}
    )
  `);

  const rows = await db.$queryRaw<ItemRow[]>(Prisma.sql`
    SELECT * FROM "InstitutionalSuccessionItem" WHERE "id" = ${id} LIMIT 1
  `);
  return { item: rows[0]!, replayed: false };
}

async function selectActivationConsents(
  agreementId: string,
  parties: PartyRow[],
  effectiveAt: Date,
  tx: Prisma.TransactionClient,
): Promise<ConsentRow[]> {
  const selected: ConsentRow[] = [];
  for (const party of parties.filter((candidate) => candidate.required)) {
    const rows = await tx.$queryRaw<ConsentRow[]>(Prisma.sql`
      SELECT * FROM "InstitutionalSuccessionConsent"
      WHERE "agreementId" = ${agreementId}
        AND "partyId" = ${party.id}
        AND "assessedAt" <= ${effectiveAt}
        AND ("validUntil" IS NULL OR "validUntil" > ${effectiveAt})
      ORDER BY "assessedAt" DESC, "createdAt" DESC, "id" DESC
      LIMIT 1
    `);
    const consent = rows[0];
    if (!consent || consent.disposition !== 'CONSENTED') {
      throw new InstitutionalSuccessionConflictError(
        `Required succession party ${party.id} does not have current CONSENTED disposition.`,
      );
    }
    selected.push(consent);
  }
  return selected.sort((a, b) => a.partyId.localeCompare(b.partyId));
}

async function createResultingCommitment(
  tx: Prisma.TransactionClient,
  agreement: AgreementRow,
  item: ItemRow,
  effectiveAt: Date,
  registry: RegistryContext,
): Promise<string> {
  const source = await tx.commitment.findUnique({ where: { id: item.sourceCommitmentId! } });
  if (!source) throw new InstitutionalSuccessionConflictError('Source commitment disappeared.');
  if (source.status !== 'OPEN') {
    throw new InstitutionalSuccessionConflictError('Source commitment is no longer OPEN.');
  }

  let debtorActorId = source.debtorActorId;
  let creditorActorId = source.creditorActorId;
  const creditorExternalRef = source.creditorExternalRef;
  let sourceEvidenceArtifactId = source.sourceEvidenceArtifactId;

  if (item.itemType === 'DEBTOR_NOVATION') {
    if (source.debtorActorId !== agreement.predecessorActorId) {
      throw new InstitutionalSuccessionConflictError('Debtor novation source no longer matches predecessor.');
    }
    debtorActorId = agreement.successorActorId;
    sourceEvidenceArtifactId = agreement.sourceEvidenceArtifactId;
  } else {
    if (source.creditorActorId !== agreement.predecessorActorId) {
      throw new InstitutionalSuccessionConflictError('Creditor assignment source no longer matches predecessor.');
    }
    creditorActorId = agreement.successorActorId;
    if (sourceEvidenceArtifactId) {
      await requireEvidenceBoundToActor(debtorActorId, sourceEvidenceArtifactId, tx);
    } else {
      await requireEvidenceBoundToActor(debtorActorId, agreement.sourceEvidenceArtifactId, tx);
      sourceEvidenceArtifactId = agreement.sourceEvidenceArtifactId;
    }
  }

  await requireEvidenceBoundToActor(debtorActorId, sourceEvidenceArtifactId, tx);

  const id = `cmt_${randomUUID()}`;
  await tx.commitment.create({
    data: {
      id,
      debtorActorId,
      creditorActorId,
      creditorExternalRef,
      kind: source.kind,
      status: 'OPEN',
      termsDigest: source.termsDigest,
      termsUri: source.termsUri,
      sourceEvidenceArtifactId,
      externalFramework: 'noeone.institutional-succession.v1',
      externalReference: item.id,
      dueAt: source.dueAt,
      openedAt: effectiveAt,
      createdByType: 'system',
      createdById: agreement.id,
      idempotencyKey: `succession:${agreement.id}:item:${item.id}:commitment`,
      metadata: {
        successionAgreementId: agreement.id,
        successionItemId: item.id,
        sourceCommitmentId: source.id,
        transferType: item.itemType,
        predecessorLiabilityMode: item.predecessorLiabilityMode,
      },
    },
  });

  const transitionId = `cmtx_${randomUUID()}`;
  await tx.commitmentTransition.create({
    data: {
      id: transitionId,
      commitmentId: id,
      fromStatus: null,
      toStatus: 'OPEN',
      evidenceArtifactId: sourceEvidenceArtifactId,
      reason: 'commitment position created by institutional succession',
      decidedByType: 'system',
      decidedById: agreement.id,
      idempotencyKey: `succession:${agreement.id}:item:${item.id}:commitment:open`,
      occurredAt: effectiveAt,
      metadata: { successionAgreementId: agreement.id, successionItemId: item.id },
    },
  });

  await appendCanonicalActorEvent(
    tx,
    {
      actorId: debtorActorId,
      type: 'actor.commitment.opened',
      sourceKey: `succession:commitment:${id}:opened`,
      occurredAt: effectiveAt,
      hostId: registry.hostId,
      environmentVersion: registry.environmentVersion,
      issuer: registry.issuer,
      payload: {
        commitmentId: id,
        sourceCommitmentId: source.id,
        successionAgreementId: agreement.id,
        successionItemId: item.id,
        transferType: item.itemType.toLowerCase(),
        termsDigest: source.termsDigest,
        dueAt: source.dueAt?.toISOString() ?? null,
      },
    },
    registry.signingSecret,
  );

  return id;
}

async function validateAuthorityReissuance(
  tx: Prisma.TransactionClient,
  agreement: AgreementRow,
  item: ItemRow,
): Promise<string> {
  const [source, target] = await Promise.all([
    tx.authorityGrant.findUnique({ where: { id: item.sourceAuthorityGrantId! } }),
    tx.authorityGrant.findUnique({ where: { id: item.requestedAuthorityGrantId! } }),
  ]);
  if (!source || !target) {
    throw new InstitutionalSuccessionConflictError('Authority grant referenced by succession is missing.');
  }
  if (source.subjectActorId !== agreement.predecessorActorId) {
    throw new InstitutionalSuccessionConflictError('Authority source no longer belongs to predecessor.');
  }
  if (target.subjectActorId !== agreement.successorActorId) {
    throw new InstitutionalSuccessionConflictError('Reissued authority does not belong to successor actor.');
  }
  assertAuthorityReissuanceNonAmplifying(source, target);
  return target.id;
}

export async function activateInstitutionalSuccession(
  agreementId: string,
  registry: RegistryContext,
  effectiveAt = new Date(),
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "InstitutionalSuccessionAgreement" WHERE "id" = ${agreementId} FOR UPDATE
    `);
    const agreement = await loadAgreement(agreementId, tx);
    if (agreement.status === 'EFFECTIVE') {
      return {
        agreement,
        parties: await loadParties(agreementId, tx),
        items: await loadItems(agreementId, tx),
        replayed: true,
      };
    }
    if (agreement.status !== 'PROPOSED') {
      throw new InstitutionalSuccessionConflictError(
        `Agreement cannot activate from status ${agreement.status}.`,
      );
    }
    if (effectiveAt < agreement.proposedAt) {
      throw new InstitutionalSuccessionValidationError('effectiveAt cannot precede proposedAt.');
    }

    await requireEvidenceBoundToActor(
      agreement.predecessorActorId,
      agreement.sourceEvidenceArtifactId,
      tx,
    );
    await requireEvidenceBoundToActor(
      agreement.successorActorId,
      agreement.sourceEvidenceArtifactId,
      tx,
    );

    if (agreement.recognitionAssessmentId) {
      assertRecognitionSupportsSuccessor(
        await loadRecognition(agreement.recognitionAssessmentId, tx),
        agreement.successorActorId,
        effectiveAt,
      );
    }

    const parties = await loadParties(agreementId, tx);
    const selectedConsents = await selectActivationConsents(agreementId, parties, effectiveAt, tx);
    const items = await loadItems(agreementId, tx);
    if (items.length === 0) {
      throw new InstitutionalSuccessionConflictError('Agreement has no succession items.');
    }
    if (items.some((item) => item.status !== 'PENDING')) {
      throw new InstitutionalSuccessionConflictError('Proposed agreement contains non-pending items.');
    }

    const results: Array<{
      itemId: string;
      itemType: SuccessionItemType;
      itemDigest: string;
      resultingCommitmentId: string | null;
      resultingAuthorityGrantId: string | null;
      predecessorLiabilityMode: PredecessorLiabilityMode;
    }> = [];

    for (const item of items) {
      let resultingCommitmentId: string | null = null;
      let resultingAuthorityGrantId: string | null = null;
      if (item.itemType === 'AUTHORITY_REISSUANCE') {
        resultingAuthorityGrantId = await validateAuthorityReissuance(tx, agreement, item);
      } else {
        resultingCommitmentId = await createResultingCommitment(
          tx,
          agreement,
          item,
          effectiveAt,
          registry,
        );
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE "InstitutionalSuccessionItem"
        SET "status" = 'EFFECTIVE',
            "resultingCommitmentId" = ${resultingCommitmentId},
            "resultingAuthorityGrantId" = ${resultingAuthorityGrantId},
            "effectiveAt" = ${effectiveAt}
        WHERE "id" = ${item.id}
      `);

      results.push({
        itemId: item.id,
        itemType: item.itemType,
        itemDigest: item.itemDigest,
        resultingCommitmentId,
        resultingAuthorityGrantId,
        predecessorLiabilityMode: item.predecessorLiabilityMode,
      });
    }

    results.sort((a, b) => a.itemId.localeCompare(b.itemId));
    const activationBasis = {
      version: 'noeone.institutional-succession-activation.v1',
      agreementId: agreement.id,
      agreementDigest: agreement.agreementDigest,
      effectiveAt: effectiveAt.toISOString(),
      requiredConsents: selectedConsents.map((consent) => ({
        partyId: consent.partyId,
        consentId: consent.id,
        basisDigest: consent.basisDigest,
      })),
      items: results,
    };
    const activationBasisDigest = sha256(activationBasis);

    await tx.$executeRaw(Prisma.sql`
      UPDATE "InstitutionalSuccessionAgreement"
      SET "status" = 'EFFECTIVE',
          "effectiveAt" = ${effectiveAt},
          "activationBasis" = ${json(activationBasis)},
          "activationBasisDigest" = ${activationBasisDigest}
      WHERE "id" = ${agreement.id}
    `);

    for (const actor of [
      { id: agreement.predecessorActorId, direction: 'predecessor' },
      { id: agreement.successorActorId, direction: 'successor' },
    ] as const) {
      await appendCanonicalActorEvent(
        tx,
        {
          actorId: actor.id,
          type: 'actor.institutional-succession.effective',
          sourceKey: `succession:${agreement.id}:${actor.direction}`,
          occurredAt: effectiveAt,
          hostId: registry.hostId,
          environmentVersion: registry.environmentVersion,
          issuer: registry.issuer,
          payload: {
            successionAgreementId: agreement.id,
            direction: actor.direction,
            successionKind: agreement.successionKind.toLowerCase(),
            context: agreement.context,
            counterpartActorId:
              actor.direction === 'predecessor'
                ? agreement.successorActorId
                : agreement.predecessorActorId,
            itemCount: results.length,
            agreementDigest: agreement.agreementDigest,
            activationBasisDigest,
          },
        },
        registry.signingSecret,
      );
    }

    return {
      agreement: await loadAgreement(agreementId, tx),
      parties,
      items: await loadItems(agreementId, tx),
      replayed: false,
    };
  });
}

export async function getInstitutionalSuccessionAgreement(agreementId: string) {
  const agreement = await loadAgreement(agreementId);
  const [parties, consents, items] = await Promise.all([
    loadParties(agreementId),
    loadConsents(agreementId),
    loadItems(agreementId),
  ]);
  return { agreement, parties, consents, items };
}

export async function getActorInstitutionalSuccessionSummary(actorId: string) {
  await requireActor(actorId);
  const rows = await db.$queryRaw<Array<{
    predecessorCount: bigint;
    successorCount: bigint;
    effectiveCount: bigint;
    commitmentTransfersOut: bigint;
    commitmentTransfersIn: bigint;
    authorityReissuances: bigint;
  }>>(Prisma.sql`
    SELECT
      (SELECT count(*) FROM "InstitutionalSuccessionAgreement" WHERE "predecessorActorId" = ${actorId}) AS "predecessorCount",
      (SELECT count(*) FROM "InstitutionalSuccessionAgreement" WHERE "successorActorId" = ${actorId}) AS "successorCount",
      (SELECT count(*) FROM "InstitutionalSuccessionAgreement"
        WHERE ("predecessorActorId" = ${actorId} OR "successorActorId" = ${actorId}) AND "status" = 'EFFECTIVE') AS "effectiveCount",
      (SELECT count(*) FROM "InstitutionalSuccessionItem" i
        JOIN "InstitutionalSuccessionAgreement" a ON a."id" = i."agreementId"
        WHERE a."predecessorActorId" = ${actorId} AND i."status" = 'EFFECTIVE'
          AND i."itemType" IN ('DEBTOR_NOVATION', 'CREDITOR_ASSIGNMENT')) AS "commitmentTransfersOut",
      (SELECT count(*) FROM "InstitutionalSuccessionItem" i
        JOIN "InstitutionalSuccessionAgreement" a ON a."id" = i."agreementId"
        WHERE a."successorActorId" = ${actorId} AND i."status" = 'EFFECTIVE'
          AND i."itemType" IN ('DEBTOR_NOVATION', 'CREDITOR_ASSIGNMENT')) AS "commitmentTransfersIn",
      (SELECT count(*) FROM "InstitutionalSuccessionItem" i
        JOIN "InstitutionalSuccessionAgreement" a ON a."id" = i."agreementId"
        WHERE (a."predecessorActorId" = ${actorId} OR a."successorActorId" = ${actorId})
          AND i."status" = 'EFFECTIVE' AND i."itemType" = 'AUTHORITY_REISSUANCE') AS "authorityReissuances"
  `);
  const row = rows[0]!;
  return {
    version: 'noeone.institutional-succession-summary.v1' as const,
    actorId,
    predecessorAgreementCount: Number(row.predecessorCount),
    successorAgreementCount: Number(row.successorCount),
    effectiveAgreementCount: Number(row.effectiveCount),
    commitmentTransfersOut: Number(row.commitmentTransfersOut),
    commitmentTransfersIn: Number(row.commitmentTransfersIn),
    authorityReissuances: Number(row.authorityReissuances),
  };
}

function parseActivationBasis(value: Prisma.JsonValue | null): ActivationBasis | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  return value as ActivationBasis;
}

export async function verifyInstitutionalSuccession(actorId: string) {
  await requireActor(actorId);
  const agreements = await db.$queryRaw<AgreementRow[]>(Prisma.sql`
    SELECT * FROM "InstitutionalSuccessionAgreement"
    WHERE "predecessorActorId" = ${actorId} OR "successorActorId" = ${actorId}
    ORDER BY "proposedAt", "id"
  `);
  const errors: string[] = [];
  let effectiveAgreementCount = 0;
  let itemCount = 0;
  let consentCount = 0;

  for (const agreement of agreements) {
    const [parties, consents, items] = await Promise.all([
      loadParties(agreement.id),
      loadConsents(agreement.id),
      loadItems(agreement.id),
    ]);
    itemCount += items.length;
    consentCount += consents.length;

    const normalizedParties = parties.map((party) => ({
      role: party.role,
      principalType: party.principalType,
      principalRef: party.principalRef,
      required: party.required,
      metadata: (party.metadata ?? {}) as JsonObject,
    }));
    const expectedAgreementDigest = sha256(
      agreementBasis({
        predecessorActorId: agreement.predecessorActorId,
        successorActorId: agreement.successorActorId,
        successionKind: agreement.successionKind,
        context: agreement.context,
        policyFramework: agreement.policyFramework,
        policyVersion: agreement.policyVersion,
        legalContextSnapshotId: agreement.legalContextSnapshotId,
        sourceEvidenceArtifactId: agreement.sourceEvidenceArtifactId,
        recognitionAssessmentId: agreement.recognitionAssessmentId,
        proposedAt: agreement.proposedAt,
        parties: normalizedParties,
        metadata: (agreement.metadata ?? {}) as JsonObject,
      }),
    );
    if (expectedAgreementDigest !== agreement.agreementDigest) {
      errors.push(`${agreement.id}: agreement digest mismatch`);
    }

    for (const consent of consents) {
      const party = parties.find((candidate) => candidate.id === consent.partyId);
      if (!party) {
        errors.push(`${agreement.id}: consent ${consent.id} references missing party`);
        continue;
      }
      const expected = sha256(
        consentBasis({
          agreementDigest: agreement.agreementDigest,
          party,
          disposition: consent.disposition,
          evidenceArtifactId: consent.evidenceArtifactId,
          method: consent.method,
          methodVersion: consent.methodVersion,
          assessedAt: consent.assessedAt,
          validUntil: consent.validUntil,
          conditions: consent.conditions,
          reasons: consent.reasons,
          metadata: (consent.metadata ?? {}) as JsonObject,
        }),
      );
      if (expected !== consent.basisDigest) errors.push(`${agreement.id}: consent ${consent.id} digest mismatch`);
    }

    for (const item of items) {
      const expected = sha256(
        itemBasis({
          agreementDigest: agreement.agreementDigest,
          itemType: item.itemType,
          sourceCommitmentId: item.sourceCommitmentId,
          sourceAuthorityGrantId: item.sourceAuthorityGrantId,
          requestedAuthorityGrantId: item.requestedAuthorityGrantId,
          predecessorLiabilityMode: item.predecessorLiabilityMode,
          metadata: (item.metadata ?? {}) as JsonObject,
        }),
      );
      if (expected !== item.itemDigest) errors.push(`${agreement.id}: item ${item.id} digest mismatch`);
    }

    if (agreement.status !== 'EFFECTIVE') continue;
    effectiveAgreementCount += 1;
    if (!agreement.effectiveAt || !agreement.activationBasis || !agreement.activationBasisDigest) {
      errors.push(`${agreement.id}: effective agreement missing activation proof`);
      continue;
    }
    if (sha256(agreement.activationBasis) !== agreement.activationBasisDigest) {
      errors.push(`${agreement.id}: activation basis digest mismatch`);
    }
    const basis = parseActivationBasis(agreement.activationBasis);
    if (!basis || !Array.isArray(basis.requiredConsents) || !Array.isArray(basis.items)) {
      errors.push(`${agreement.id}: malformed activation basis`);
      continue;
    }

    const selectedConsentIds = new Set(basis.requiredConsents.map((item) => item.consentId));
    for (const party of parties.filter((candidate) => candidate.required)) {
      const selected = consents.find(
        (consent) => consent.partyId === party.id && selectedConsentIds.has(consent.id),
      );
      if (!selected || selected.disposition !== 'CONSENTED') {
        errors.push(`${agreement.id}: required party ${party.id} lacks selected consent`);
        continue;
      }
      if (
        selected.assessedAt > agreement.effectiveAt ||
        (selected.validUntil && selected.validUntil <= agreement.effectiveAt)
      ) {
        errors.push(`${agreement.id}: selected consent ${selected.id} invalid at effective time`);
      }
    }

    for (const item of items) {
      if (item.status !== 'EFFECTIVE' || item.effectiveAt?.getTime() !== agreement.effectiveAt.getTime()) {
        errors.push(`${agreement.id}: item ${item.id} is not effective with agreement`);
        continue;
      }
      if (item.itemType === 'AUTHORITY_REISSUANCE') {
        if (!item.resultingAuthorityGrantId) {
          errors.push(`${agreement.id}: authority item ${item.id} missing result grant`);
          continue;
        }
        const [source, target] = await Promise.all([
          db.authorityGrant.findUnique({ where: { id: item.sourceAuthorityGrantId! } }),
          db.authorityGrant.findUnique({ where: { id: item.resultingAuthorityGrantId } }),
        ]);
        if (!source || !target) {
          errors.push(`${agreement.id}: authority item ${item.id} references missing grant`);
        } else {
          try {
            if (source.subjectActorId !== agreement.predecessorActorId) {
              throw new InstitutionalSuccessionConflictError('source subject mismatch');
            }
            if (target.subjectActorId !== agreement.successorActorId) {
              throw new InstitutionalSuccessionConflictError('target subject mismatch');
            }
            assertAuthorityReissuanceNonAmplifying(source, target);
          } catch (error) {
            errors.push(`${agreement.id}: authority item ${item.id} invalid: ${error instanceof Error ? error.message : 'unknown error'}`);
          }
        }
      } else {
        if (!item.resultingCommitmentId) {
          errors.push(`${agreement.id}: commitment item ${item.id} missing result commitment`);
          continue;
        }
        const result = await db.commitment.findUnique({ where: { id: item.resultingCommitmentId } });
        if (!result) {
          errors.push(`${agreement.id}: commitment item ${item.id} result is missing`);
        } else if (
          item.itemType === 'DEBTOR_NOVATION' &&
          result.debtorActorId !== agreement.successorActorId
        ) {
          errors.push(`${agreement.id}: debtor novation result does not belong to successor debtor`);
        } else if (
          item.itemType === 'CREDITOR_ASSIGNMENT' &&
          result.creditorActorId !== agreement.successorActorId
        ) {
          errors.push(`${agreement.id}: creditor assignment result does not belong to successor creditor`);
        }
      }
    }
  }

  return {
    version: 'noeone.institutional-succession-verification.v1' as const,
    actorId,
    verified: errors.length === 0,
    agreementCount: agreements.length,
    effectiveAgreementCount,
    itemCount,
    consentCount,
    errors,
  };
}
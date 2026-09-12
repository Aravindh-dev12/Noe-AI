import { createHash } from 'node:crypto';
import type { EvidenceArtifact, Prisma } from '@prisma/client';
import { canonicalJson } from '@onbae/event-model';

import type { RegistryContext } from './continuity.js';
import {
  InstitutionalConflictError,
  registerEvidenceReference,
} from './institutional.js';
import { db } from './index.js';

export const INTENT_MANDATE_KIND = 'noeone.intent.mandate.v1';
export const INTENT_TRANSFORM_KIND = 'noeone.intent.transform.v1';
export const INTENT_ASSESSMENT_KIND = 'noeone.intent.assessment.v1';

export type IntentAssessmentDisposition =
  | 'ALIGNED'
  | 'NOT_ALIGNED'
  | 'INDETERMINATE'
  | 'DISPUTED';

export type RegisterIntentMandateInput = {
  actorId: string;
  issuer: string;
  framework: string;
  principalType: string;
  principalRef: string;
  intentDigest: string;
  digestAlgorithm?: string;
  externalId?: string | null;
  uri?: string | null;
  issuedAt?: Date;
  expiresAt?: Date | null;
  purposeClass?: string | null;
  contextDigest?: string | null;
  publicMetadata?: Prisma.InputJsonObject;
};

export type RegisterIntentTransformInput = {
  actorId: string;
  issuer: string;
  framework: string;
  parentArtifactId: string;
  inputDigest: string;
  outputDigest: string;
  processorType: string;
  processorRef: string;
  deterministic: boolean;
  executionId?: string | null;
  ruleId?: string | null;
  externalId?: string | null;
  uri?: string | null;
  transformedAt?: Date;
  publicMetadata?: Prisma.InputJsonObject;
};

export type RegisterIntentAssessmentInput = {
  actorId: string;
  issuer: string;
  mandateArtifactId: string;
  terminalArtifactId: string;
  authorityExerciseId: string;
  disposition: IntentAssessmentDisposition;
  evaluator: string;
  method: string;
  methodVersion: string;
  basisDigest: string;
  confidenceBps?: number | null;
  evidenceArtifactIds?: string[];
  assessedAt?: Date;
  externalId?: string | null;
  uri?: string | null;
  publicMetadata?: Prisma.InputJsonObject;
};

export type IntentChainVerification = {
  version: 'noeone.intent-chain-verification.v1';
  valid: boolean;
  grantId: string;
  rootGrantId: string | null;
  mandateArtifactId: string | null;
  terminalArtifactId: string | null;
  terminalIntentDigest: string | null;
  grantDepth: number;
  artifactDepth: number;
  actorIds: string[];
  issues: string[];
};

type JsonObject = Record<string, Prisma.JsonValue>;

type IntentArtifactNode = {
  artifact: EvidenceArtifact;
  actorId: string;
  role: 'intent_mandate' | 'intent_transform';
  parentArtifactId: string | null;
  inputDigest: string | null;
  outputDigest: string;
};

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InstitutionalConflictError(`Intent evidence field ${field} is missing or invalid.`);
  }
  return value;
}

function asObject(value: Prisma.JsonValue): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InstitutionalConflictError('Intent evidence metadata must be a JSON object.');
  }
  return value as JsonObject;
}

function mergeMetadata(
  authoritative: Prisma.InputJsonObject,
  extra?: Prisma.InputJsonObject,
): Prisma.InputJsonObject {
  return {
    ...(extra ?? {}),
    ...authoritative,
  };
}

function mandateEnvelope(input: RegisterIntentMandateInput, issuedAt: Date): Prisma.InputJsonObject {
  return {
    version: INTENT_MANDATE_KIND,
    actorId: input.actorId,
    principalType: input.principalType,
    principalRef: input.principalRef,
    framework: input.framework,
    intentDigest: input.intentDigest,
    digestAlgorithm: input.digestAlgorithm ?? 'sha256',
    issuedAt: issuedAt.toISOString(),
    expiresAt: input.expiresAt?.toISOString() ?? null,
    purposeClass: input.purposeClass ?? null,
    contextDigest: input.contextDigest ?? null,
  };
}

function transformEnvelope(
  input: RegisterIntentTransformInput,
  transformedAt: Date,
): Prisma.InputJsonObject {
  return {
    version: INTENT_TRANSFORM_KIND,
    actorId: input.actorId,
    framework: input.framework,
    parentArtifactId: input.parentArtifactId,
    inputDigest: input.inputDigest,
    outputDigest: input.outputDigest,
    processorType: input.processorType,
    processorRef: input.processorRef,
    deterministic: input.deterministic,
    executionId: input.executionId ?? null,
    ruleId: input.ruleId ?? null,
    transformedAt: transformedAt.toISOString(),
  };
}

function assessmentEnvelope(
  input: RegisterIntentAssessmentInput,
  assessedAt: Date,
): Prisma.InputJsonObject {
  if (
    input.confidenceBps !== undefined &&
    input.confidenceBps !== null &&
    (!Number.isInteger(input.confidenceBps) || input.confidenceBps < 0 || input.confidenceBps > 10_000)
  ) {
    throw new InstitutionalConflictError('confidenceBps must be an integer from 0 to 10000.');
  }

  return {
    version: INTENT_ASSESSMENT_KIND,
    actorId: input.actorId,
    mandateArtifactId: input.mandateArtifactId,
    terminalArtifactId: input.terminalArtifactId,
    authorityExerciseId: input.authorityExerciseId,
    disposition: input.disposition,
    evaluator: input.evaluator,
    method: input.method,
    methodVersion: input.methodVersion,
    basisDigest: input.basisDigest,
    confidenceBps: input.confidenceBps ?? null,
    evidenceArtifactIds: [...new Set(input.evidenceArtifactIds ?? [])].sort(),
    assessedAt: assessedAt.toISOString(),
  };
}

export async function registerIntentMandate(
  input: RegisterIntentMandateInput,
  registry: RegistryContext,
) {
  const issuedAt = input.issuedAt ?? new Date();
  const envelope = mandateEnvelope(input, issuedAt);
  const digest = sha256(envelope);

  return registerEvidenceReference(
    {
      actorId: input.actorId,
      role: 'intent_mandate',
      kind: INTENT_MANDATE_KIND,
      issuer: input.issuer,
      ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
      ...(input.uri !== undefined ? { uri: input.uri } : {}),
      digest,
      digestAlgorithm: 'sha256',
      observedAt: issuedAt,
      artifactMetadata: mergeMetadata(envelope, input.publicMetadata),
      bindingMetadata: {
        intentDigest: input.intentDigest,
        framework: input.framework,
      },
    },
    registry,
  );
}

export async function registerIntentTransform(
  input: RegisterIntentTransformInput,
  registry: RegistryContext,
) {
  const parent = await db.evidenceArtifact.findUnique({
    where: { id: input.parentArtifactId },
    select: { id: true, kind: true, metadata: true },
  });
  if (!parent) {
    throw Object.assign(new Error('Parent intent artifact not found.'), { statusCode: 404 });
  }
  if (parent.kind !== INTENT_MANDATE_KIND && parent.kind !== INTENT_TRANSFORM_KIND) {
    throw new InstitutionalConflictError('Parent evidence is not an intent mandate or transform.');
  }

  const parentMetadata = asObject(parent.metadata);
  const parentTerminalDigest =
    parent.kind === INTENT_MANDATE_KIND
      ? requiredString(parentMetadata.intentDigest, 'intentDigest')
      : requiredString(parentMetadata.outputDigest, 'outputDigest');

  if (parentTerminalDigest !== input.inputDigest) {
    throw new InstitutionalConflictError(
      'Intent transform inputDigest does not match the predecessor terminal intent digest.',
    );
  }

  const transformedAt = input.transformedAt ?? new Date();
  const envelope = transformEnvelope(input, transformedAt);
  const digest = sha256(envelope);

  return registerEvidenceReference(
    {
      actorId: input.actorId,
      role: 'intent_transform',
      kind: INTENT_TRANSFORM_KIND,
      issuer: input.issuer,
      ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
      ...(input.uri !== undefined ? { uri: input.uri } : {}),
      digest,
      digestAlgorithm: 'sha256',
      observedAt: transformedAt,
      artifactMetadata: mergeMetadata(envelope, input.publicMetadata),
      bindingMetadata: {
        parentArtifactId: input.parentArtifactId,
        inputDigest: input.inputDigest,
        outputDigest: input.outputDigest,
      },
    },
    registry,
  );
}

export async function registerIntentAssessment(
  input: RegisterIntentAssessmentInput,
  registry: RegistryContext,
) {
  const [mandate, terminal, exercise] = await Promise.all([
    db.evidenceArtifact.findUnique({ where: { id: input.mandateArtifactId }, select: { id: true, kind: true } }),
    db.evidenceArtifact.findUnique({ where: { id: input.terminalArtifactId }, select: { id: true, kind: true } }),
    db.authorityExercise.findUnique({
      where: { id: input.authorityExerciseId },
      select: { id: true, actorId: true },
    }),
  ]);

  if (!mandate || mandate.kind !== INTENT_MANDATE_KIND) {
    throw new InstitutionalConflictError('mandateArtifactId must reference an intent mandate.');
  }
  if (!terminal || (terminal.kind !== INTENT_MANDATE_KIND && terminal.kind !== INTENT_TRANSFORM_KIND)) {
    throw new InstitutionalConflictError(
      'terminalArtifactId must reference an intent mandate or transform.',
    );
  }
  if (!exercise) {
    throw Object.assign(new Error('Authority exercise not found.'), { statusCode: 404 });
  }
  if (exercise.actorId !== input.actorId) {
    throw new InstitutionalConflictError(
      'Intent assessment actor does not match the authority exercise actor.',
    );
  }

  const assessedAt = input.assessedAt ?? new Date();
  const envelope = assessmentEnvelope(input, assessedAt);
  const digest = sha256(envelope);

  return registerEvidenceReference(
    {
      actorId: input.actorId,
      role: 'intent_assessment',
      kind: INTENT_ASSESSMENT_KIND,
      issuer: input.issuer,
      ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
      ...(input.uri !== undefined ? { uri: input.uri } : {}),
      digest,
      digestAlgorithm: 'sha256',
      observedAt: assessedAt,
      artifactMetadata: mergeMetadata(envelope, input.publicMetadata),
      bindingMetadata: {
        disposition: input.disposition,
        authorityExerciseId: input.authorityExerciseId,
        mandateArtifactId: input.mandateArtifactId,
        terminalArtifactId: input.terminalArtifactId,
      },
    },
    registry,
  );
}

async function loadIntentNode(artifactId: string): Promise<IntentArtifactNode> {
  const artifact = await db.evidenceArtifact.findUnique({
    where: { id: artifactId },
    include: {
      bindings: {
        select: { actorId: true, role: true },
      },
    },
  });

  if (!artifact) {
    throw Object.assign(new Error('Intent artifact not found.'), { statusCode: 404 });
  }
  if (artifact.kind !== INTENT_MANDATE_KIND && artifact.kind !== INTENT_TRANSFORM_KIND) {
    throw new InstitutionalConflictError(`Evidence ${artifact.id} is not an intent-chain artifact.`);
  }

  const metadata = asObject(artifact.metadata);
  const actorId = requiredString(metadata.actorId, 'actorId');
  const expectedRole = artifact.kind === INTENT_MANDATE_KIND ? 'intent_mandate' : 'intent_transform';
  if (!artifact.bindings.some((binding) => binding.actorId === actorId && binding.role === expectedRole)) {
    throw new InstitutionalConflictError(
      `Intent evidence ${artifact.id} is missing its ${expectedRole} actor binding.`,
    );
  }

  if (artifact.kind === INTENT_MANDATE_KIND) {
    return {
      artifact,
      actorId,
      role: 'intent_mandate',
      parentArtifactId: null,
      inputDigest: null,
      outputDigest: requiredString(metadata.intentDigest, 'intentDigest'),
    };
  }

  return {
    artifact,
    actorId,
    role: 'intent_transform',
    parentArtifactId: requiredString(metadata.parentArtifactId, 'parentArtifactId'),
    inputDigest: requiredString(metadata.inputDigest, 'inputDigest'),
    outputDigest: requiredString(metadata.outputDigest, 'outputDigest'),
  };
}

export async function verifyAuthorityIntentChain(grantId: string): Promise<IntentChainVerification> {
  const issues: string[] = [];
  const grants: Array<{
    id: string;
    subjectActorId: string;
    parentGrantId: string | null;
    sourceEvidenceArtifactId: string | null;
  }> = [];
  const seenGrantIds = new Set<string>();
  let grantCursor: string | null = grantId;

  while (grantCursor) {
    if (seenGrantIds.has(grantCursor)) {
      issues.push(`authority grant cycle detected at ${grantCursor}`);
      break;
    }
    if (grants.length >= 32) {
      issues.push('authority grant chain exceeds maximum verification depth of 32');
      break;
    }
    seenGrantIds.add(grantCursor);
    const grant = await db.authorityGrant.findUnique({
      where: { id: grantCursor },
      select: {
        id: true,
        subjectActorId: true,
        parentGrantId: true,
        sourceEvidenceArtifactId: true,
      },
    });
    if (!grant) {
      issues.push(`authority grant ${grantCursor} not found`);
      break;
    }
    grants.push(grant);
    grantCursor = grant.parentGrantId;
  }

  grants.reverse();
  if (grants.length === 0) {
    return {
      version: 'noeone.intent-chain-verification.v1',
      valid: false,
      grantId,
      rootGrantId: null,
      mandateArtifactId: null,
      terminalArtifactId: null,
      terminalIntentDigest: null,
      grantDepth: 0,
      artifactDepth: 0,
      actorIds: [],
      issues: issues.length > 0 ? issues : ['authority grant chain is empty'],
    };
  }

  const artifactNodes: IntentArtifactNode[] = [];
  const seenArtifactIds = new Set<string>();

  for (let index = 0; index < grants.length; index += 1) {
    const grant = grants[index]!;
    if (!grant.sourceEvidenceArtifactId) {
      issues.push(`grant ${grant.id} has no source intent evidence`);
      continue;
    }
    if (seenArtifactIds.has(grant.sourceEvidenceArtifactId)) {
      issues.push(`intent artifact ${grant.sourceEvidenceArtifactId} is reused across grant hops`);
      continue;
    }
    seenArtifactIds.add(grant.sourceEvidenceArtifactId);

    try {
      const node = await loadIntentNode(grant.sourceEvidenceArtifactId);
      artifactNodes.push(node);

      if (node.actorId !== grant.subjectActorId) {
        issues.push(
          `intent artifact ${node.artifact.id} is bound to actor ${node.actorId}, not grant subject ${grant.subjectActorId}`,
        );
      }

      if (index === 0) {
        if (node.role !== 'intent_mandate') {
          issues.push(`root grant ${grant.id} must reference an intent mandate`);
        }
      } else {
        const previous = artifactNodes.at(-2);
        if (node.role !== 'intent_transform') {
          issues.push(`delegated grant ${grant.id} must reference an intent transform`);
        } else if (previous) {
          if (node.parentArtifactId !== previous.artifact.id) {
            issues.push(
              `intent transform ${node.artifact.id} does not reference predecessor ${previous.artifact.id}`,
            );
          }
          if (node.inputDigest !== previous.outputDigest) {
            issues.push(
              `intent transform ${node.artifact.id} input digest does not match predecessor terminal digest`,
            );
          }
        }
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : 'intent artifact verification failed');
    }
  }

  const first = artifactNodes[0] ?? null;
  const last = artifactNodes.at(-1) ?? null;

  return {
    version: 'noeone.intent-chain-verification.v1',
    valid: issues.length === 0 && artifactNodes.length === grants.length,
    grantId,
    rootGrantId: grants[0]?.id ?? null,
    mandateArtifactId: first?.role === 'intent_mandate' ? first.artifact.id : null,
    terminalArtifactId: last?.artifact.id ?? null,
    terminalIntentDigest: last?.outputDigest ?? null,
    grantDepth: grants.length,
    artifactDepth: artifactNodes.length,
    actorIds: grants.map((grant) => grant.subjectActorId),
    issues,
  };
}

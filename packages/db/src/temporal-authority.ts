import type {
  AuthorityGrant,
  AuthorityGrantStatus,
  AuthorityGrantTransition,
  Prisma,
} from '@prisma/client';

import { AuthorityConflictError, type AuthorityEvaluation, type AuthorityRequest } from './authority.js';
import { db } from './index.js';

export type TemporalAuthorityGrant = AuthorityGrant & {
  transitions: AuthorityGrantTransition[];
};

export type TemporalAuthorityState = AuthorityGrantStatus | 'NOT_YET_GRANTED';

export class AuthorityEvaluationTooLargeError extends Error {
  readonly statusCode = 413;
  readonly actorId: string;
  readonly candidateCount: number;

  constructor(actorId: string, candidateCount: number) {
    super(`Actor ${actorId} has too many authority grants for synchronous evaluation.`);
    this.name = 'AuthorityEvaluationTooLargeError';
    this.actorId = actorId;
    this.candidateCount = candidateCount;
  }
}

function orderedTransitions(
  transitions: AuthorityGrantTransition[],
): AuthorityGrantTransition[] {
  return [...transitions].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id),
  );
}

export function authorityGrantStatusAt(
  grant: Pick<TemporalAuthorityGrant, 'transitions'>,
  at: Date,
): TemporalAuthorityState {
  let status: TemporalAuthorityState = 'NOT_YET_GRANTED';
  for (const transition of orderedTransitions(grant.transitions)) {
    if (transition.occurredAt.getTime() > at.getTime()) break;
    status = transition.toStatus;
  }
  return status;
}

export function temporalAuthorityLifecycleIssues(
  chain: TemporalAuthorityGrant[],
  at: Date,
): string[] {
  const issues: string[] = [];
  for (const grant of chain) {
    const status = authorityGrantStatusAt(grant, at);
    if (status === 'NOT_YET_GRANTED') {
      issues.push(`grant ${grant.id} was not yet granted`);
    } else if (status !== 'ACTIVE') {
      issues.push(`grant ${grant.id} was ${status.toLowerCase()}`);
    }
    if (at.getTime() < grant.notBefore.getTime()) {
      issues.push(`grant ${grant.id} was not active yet`);
    }
    if (grant.expiresAt && at.getTime() >= grant.expiresAt.getTime()) {
      issues.push(`grant ${grant.id} was expired`);
    }
  }
  return issues;
}

function scopeAllows(scope: string[], value: string): boolean {
  return scope.includes('*') || scope.includes(value);
}

export function evaluateTemporalAuthorityChainRecords(
  chain: TemporalAuthorityGrant[],
  request: AuthorityRequest,
): AuthorityEvaluation {
  if (chain.length === 0) {
    return {
      allowed: false,
      grantId: '',
      subjectActorId: '',
      chain: [],
      reasons: ['authority chain is empty'],
    };
  }

  const at = request.at ?? new Date();
  const reasons = temporalAuthorityLifecycleIssues(chain, at);
  const amount = request.amountMinor ?? null;
  const currency = request.currency?.toUpperCase() ?? null;

  if ((amount === null) !== (currency === null)) {
    reasons.push('amountMinor and currency must be supplied together');
  } else if (amount !== null && !/^(0|[1-9][0-9]*)$/.test(amount)) {
    reasons.push('amountMinor is not a non-negative integer string');
  }

  for (const grant of chain) {
    if (!scopeAllows(grant.actions, request.action)) {
      reasons.push(`grant ${grant.id} does not allow action ${request.action}`);
    }
    if (!scopeAllows(grant.resources, request.resource)) {
      reasons.push(`grant ${grant.id} does not allow resource ${request.resource}`);
    }
    if (amount !== null && currency !== null && grant.maxAmountMinor !== null) {
      if (grant.currency !== currency) {
        reasons.push(`grant ${grant.id} does not authorize currency ${currency}`);
      } else if (BigInt(amount) > BigInt(grant.maxAmountMinor)) {
        reasons.push(`grant ${grant.id} monetary cap is exceeded`);
      }
    }
  }

  const leaf = chain[chain.length - 1]!;
  return {
    allowed: reasons.length === 0,
    grantId: leaf.id,
    subjectActorId: leaf.subjectActorId,
    chain: chain.map((grant) => grant.id),
    reasons,
  };
}

async function loadTemporalAuthorityChain(
  tx: Prisma.TransactionClient,
  grantId: string,
): Promise<TemporalAuthorityGrant[]> {
  const reversed: TemporalAuthorityGrant[] = [];
  const seen = new Set<string>();
  let cursor: string | null = grantId;

  while (cursor) {
    if (seen.has(cursor)) {
      throw new AuthorityConflictError('Authority grant ancestry contains a cycle.');
    }
    if (seen.size >= 32) {
      throw new AuthorityConflictError('Authority grant ancestry exceeds the maximum depth.');
    }
    seen.add(cursor);
    const grant: TemporalAuthorityGrant | null = await tx.authorityGrant.findUnique({
      where: { id: cursor },
      include: { transitions: true },
    });
    if (!grant) {
      throw Object.assign(new Error('Authority grant not found.'), { statusCode: 404 });
    }
    reversed.push(grant);
    cursor = grant.parentGrantId;
  }

  return reversed.reverse();
}

export async function evaluateAuthorityGrantAt(
  grantId: string,
  request: AuthorityRequest,
): Promise<AuthorityEvaluation> {
  return db.$transaction(async (tx) => {
    const chain = await loadTemporalAuthorityChain(tx, grantId);
    return evaluateTemporalAuthorityChainRecords(chain, request);
  });
}

export async function evaluateActorAuthorityAt(
  actorId: string,
  request: AuthorityRequest,
): Promise<{
  allowed: boolean;
  actorId: string;
  matchedGrantId: string | null;
  evaluations: AuthorityEvaluation[];
}> {
  const at = request.at ?? new Date();
  return db.$transaction(async (tx) => {
    const actor = await tx.actor.findUnique({ where: { id: actorId }, select: { id: true } });
    if (!actor) {
      throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
    }

    // Do not filter on the current status projection. A grant that is revoked
    // today may still have covered an action before its revocation transition.
    const candidates = await tx.authorityGrant.findMany({
      where: {
        subjectActorId: actorId,
        createdAt: { lte: at },
        notBefore: { lte: at },
        OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
      take: 1_001,
    });
    if (candidates.length > 1_000) {
      throw new AuthorityEvaluationTooLargeError(actorId, candidates.length);
    }

    const evaluations: AuthorityEvaluation[] = [];
    for (const candidate of candidates) {
      const chain = await loadTemporalAuthorityChain(tx, candidate.id);
      evaluations.push(
        evaluateTemporalAuthorityChainRecords(chain, {
          ...request,
          at,
        }),
      );
    }

    const matched = evaluations.find((evaluation) => evaluation.allowed) ?? null;
    return {
      allowed: matched !== null,
      actorId,
      matchedGrantId: matched?.grantId ?? null,
      evaluations,
    };
  });
}

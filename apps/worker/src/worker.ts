import { randomUUID } from 'node:crypto';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { db, type Prisma } from '@onbae/db';
import {
  TRIAD_ENVIRONMENT_VERSION,
  applyTriadRound,
  createTriadState,
  parseTriadAction,
  triadAllowedActions,
  triadObservation,
} from '@onbae/environments';
import { createActorEvent, signEventHash } from '@onbae/event-model';
import { createProvider } from '@onbae/providers';
import { z } from 'zod';

import { env } from './env.js';

const MATCH_QUEUE = 'onbae-match-runner';
const matchJobSchema = z.object({ matchId: z.string().min(1) });

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

function providerApiKey(provider: string): string | undefined {
  if (provider === 'openai') return env.OPENAI_API_KEY;
  if (provider === 'anthropic') return env.ANTHROPIC_API_KEY;
  return undefined;
}

async function appendCanonicalEvent(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    executionId: string;
    type: string;
    occurredAt: Date;
    hostId: string;
    environmentVersion: string;
    issuer: string;
    payload: Record<string, unknown>;
  },
) {
  const previous = await tx.actorEvent.findFirst({
    where: { actorId: input.actorId },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    select: { hash: true },
  });

  const event = createActorEvent({
    id: `evt_${randomUUID()}`,
    actorId: input.actorId,
    executionId: input.executionId,
    type: input.type,
    occurredAt: input.occurredAt.toISOString(),
    observedAt: new Date().toISOString(),
    hostId: input.hostId,
    environmentVersion: input.environmentVersion,
    payload: input.payload,
    provenance: {
      issuer: input.issuer,
      ...(previous ? { previousEventHash: previous.hash } : {}),
    },
    canonicalStatus: 'accepted',
  });

  const signature = signEventHash(event.hash, env.EVENT_SIGNING_SECRET);

  return tx.actorEvent.create({
    data: {
      id: event.id,
      actorId: event.actorId,
      executionId: event.executionId,
      hostId: event.hostId,
      type: event.type,
      occurredAt: new Date(event.occurredAt),
      observedAt: new Date(event.observedAt),
      environmentVersion: event.environmentVersion,
      payload: event.payload as Prisma.InputJsonValue,
      issuer: event.provenance.issuer,
      signature,
      previousEventHash: event.provenance.previousEventHash,
      hash: event.hash,
      canonicalStatus: 'ACCEPTED',
    },
  });
}

async function executeMatch(job: Job) {
  const { matchId } = matchJobSchema.parse(job.data);

  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      environment: { include: { host: true } },
      actorA: {
        include: {
          executions: {
            where: { endedAt: null },
            orderBy: { startedAt: 'desc' },
            take: 1,
          },
        },
      },
      actorB: {
        include: {
          executions: {
            where: { endedAt: null },
            orderBy: { startedAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!match) {
    throw new Error(`Match ${matchId} not found.`);
  }
  if (match.status === 'COMPLETED' || match.status === 'CANCELLED') {
    return { matchId, skipped: true };
  }
  if (match.environment.slug !== 'triad' || match.environment.version !== TRIAD_ENVIRONMENT_VERSION) {
    throw new Error(
      `Unsupported environment ${match.environment.slug}@${match.environment.version}.`,
    );
  }

  const executionA = match.actorA.executions[0];
  const executionB = match.actorB.executions[0];
  if (!executionA || !executionB) {
    throw new Error('Both actors require an active execution.');
  }

  const providerA = createProvider({
    provider: executionA.provider,
    model: executionA.model,
    ...(providerApiKey(executionA.provider)
      ? { apiKey: providerApiKey(executionA.provider) }
      : {}),
  });
  const providerB = createProvider({
    provider: executionB.provider,
    model: executionB.model,
    ...(providerApiKey(executionB.provider)
      ? { apiKey: providerApiKey(executionB.provider) }
      : {}),
  });

  await db.match.update({
    where: { id: match.id },
    data: { status: 'RUNNING', startedAt: new Date(), error: null },
  });

  let state = createTriadState(match.actorAId, match.actorBId);
  const trajectory: Array<Record<string, unknown>> = [];

  try {
    while (!state.complete) {
      const [resultA, resultB] = await Promise.all([
        providerA.run({
          actorId: match.actorAId,
          executionId: executionA.id,
          systemContext: `You are ${match.actorA.displayName}, a persistent Onbae actor. Choose one legal action for the Triad environment.`,
          observation: triadObservation(state, match.actorAId),
          allowedActions: triadAllowedActions,
          timeoutMs: env.MODEL_REQUEST_TIMEOUT_MS,
          maxTokens: env.MAX_MODEL_TOKENS,
        }),
        providerB.run({
          actorId: match.actorBId,
          executionId: executionB.id,
          systemContext: `You are ${match.actorB.displayName}, a persistent Onbae actor. Choose one legal action for the Triad environment.`,
          observation: triadObservation(state, match.actorBId),
          allowedActions: triadAllowedActions,
          timeoutMs: env.MODEL_REQUEST_TIMEOUT_MS,
          maxTokens: env.MAX_MODEL_TOKENS,
        }),
      ]);

      const moveA = parseTriadAction(resultA.rawText);
      const moveB = parseTriadAction(resultB.rawText);
      state = applyTriadRound(state, moveA, moveB);

      trajectory.push({
        round: state.rounds.length,
        actorA: {
          actorId: match.actorAId,
          executionId: executionA.id,
          move: moveA,
          usage: resultA.usage ?? null,
        },
        actorB: {
          actorId: match.actorBId,
          executionId: executionB.id,
          move: moveB,
          usage: resultB.usage ?? null,
        },
        scoreA: state.scoreA,
        scoreB: state.scoreB,
      });
    }

    const completedAt = new Date();
    const result = {
      scoreA: state.scoreA,
      scoreB: state.scoreB,
      winnerActorId: state.winnerActorId,
      rounds: state.rounds,
    };

    await db.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match.id },
        data: {
          status: 'COMPLETED',
          completedAt,
          winnerActorId: state.winnerActorId,
          result: result as Prisma.InputJsonValue,
          trajectory: trajectory as Prisma.InputJsonValue,
          error: null,
        },
      });

      const actorAResult =
        state.winnerActorId === null
          ? 'draw'
          : state.winnerActorId === match.actorAId
            ? 'win'
            : 'loss';
      const actorBResult =
        state.winnerActorId === null
          ? 'draw'
          : state.winnerActorId === match.actorBId
            ? 'win'
            : 'loss';

      await appendCanonicalEvent(tx, {
        actorId: match.actorAId,
        executionId: executionA.id,
        type: 'competition.result',
        occurredAt: completedAt,
        hostId: match.environment.hostId,
        environmentVersion: `${match.environment.slug}@${match.environment.version}`,
        issuer: match.environment.host.slug,
        payload: {
          matchId: match.id,
          opponentActorId: match.actorBId,
          result: actorAResult,
          score: { own: state.scoreA, opponent: state.scoreB },
        },
      });

      await appendCanonicalEvent(tx, {
        actorId: match.actorBId,
        executionId: executionB.id,
        type: 'competition.result',
        occurredAt: completedAt,
        hostId: match.environment.hostId,
        environmentVersion: `${match.environment.slug}@${match.environment.version}`,
        issuer: match.environment.host.slug,
        payload: {
          matchId: match.id,
          opponentActorId: match.actorAId,
          result: actorBResult,
          score: { own: state.scoreB, opponent: state.scoreA },
        },
      });

      for (const [subjectActorId, objectActorId] of [
        [match.actorAId, match.actorBId],
        [match.actorBId, match.actorAId],
      ] as const) {
        await tx.relationshipEdge.upsert({
          where: {
            subjectActorId_objectActorId_relation: {
              subjectActorId,
              objectActorId,
              relation: 'opponent',
            },
          },
          create: {
            subjectActorId,
            objectActorId,
            relation: 'opponent',
            firstObservedAt: completedAt,
            lastObservedAt: completedAt,
            eventCount: 1,
          },
          update: {
            lastObservedAt: completedAt,
            eventCount: { increment: 1 },
          },
        });
      }
    });

    return { matchId, result };
  } catch (error) {
    await db.match.update({
      where: { id: match.id },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message.slice(0, 4_000) : 'unknown worker error',
      },
    });
    throw error;
  }
}

const worker = new Worker(MATCH_QUEUE, executeMatch, {
  connection: redis,
  concurrency: env.WORKER_CONCURRENCY,
  lockDuration: Math.max(env.MODEL_REQUEST_TIMEOUT_MS * 3, 60_000),
});

worker.on('completed', (job) => {
  console.info(JSON.stringify({ level: 'info', message: 'match completed', jobId: job.id }));
});

worker.on('failed', (job, error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'match failed',
      jobId: job?.id ?? null,
      error: error.message,
    }),
  );
});

async function shutdown(signal: string) {
  console.info(JSON.stringify({ level: 'info', message: 'worker shutting down', signal }));
  await worker.close();
  await redis.quit();
  await db.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

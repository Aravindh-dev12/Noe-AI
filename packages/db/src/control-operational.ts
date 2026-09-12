import { Prisma } from '@prisma/client';

export type ActorControlStateAt = {
  configured: boolean;
  operational: boolean;
  actorId: string;
  epochId: string | null;
  epoch: number | null;
  state: 'ACTIVE' | 'QUARANTINED' | null;
  startedAt: Date | null;
  endedAt: Date | null;
};

type ControlEpochStateRow = {
  id: string;
  actorId: string;
  epoch: number;
  state: 'ACTIVE' | 'QUARANTINED';
  startedAt: Date;
  endedAt: Date | null;
};

/**
 * Resolve the control state that governed an actor at an exact instant.
 *
 * Actors created before Control Continuity was configured remain operational
 * for backwards compatibility. Once epochs exist, a QUARANTINED interval is
 * an explicit execution deny signal. Historical callers must pass the event
 * time rather than consulting only the current epoch.
 */
export async function actorControlStateAt(
  tx: Prisma.TransactionClient,
  actorId: string,
  at: Date,
): Promise<ActorControlStateAt> {
  const actorRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Actor" WHERE "id" = ${actorId} LIMIT 1
  `);
  if (actorRows.length !== 1) {
    throw Object.assign(new Error('Actor not found.'), { statusCode: 404 });
  }

  const epochs = await tx.$queryRaw<ControlEpochStateRow[]>(Prisma.sql`
    SELECT "id", "actorId", "epoch", "state", "startedAt", "endedAt"
    FROM "ActorControlEpoch"
    WHERE "actorId" = ${actorId}
      AND "startedAt" <= ${at}
      AND ("endedAt" IS NULL OR "endedAt" > ${at})
    ORDER BY "epoch" DESC
    LIMIT 1
  `);
  const epoch = epochs[0];
  if (!epoch) {
    return {
      configured: false,
      operational: true,
      actorId,
      epochId: null,
      epoch: null,
      state: null,
      startedAt: null,
      endedAt: null,
    };
  }

  return {
    configured: true,
    operational: epoch.state === 'ACTIVE',
    actorId,
    epochId: epoch.id,
    epoch: epoch.epoch,
    state: epoch.state,
    startedAt: epoch.startedAt,
    endedAt: epoch.endedAt,
  };
}

export async function assertActorControlOperationalAt(
  tx: Prisma.TransactionClient,
  actorId: string,
  at: Date,
): Promise<ActorControlStateAt> {
  const state = await actorControlStateAt(tx, actorId, at);
  if (!state.operational) {
    throw Object.assign(
      new Error(`Actor control is quarantined at ${at.toISOString()}.`),
      { statusCode: 423, code: 'actor_control_quarantined' },
    );
  }
  return state;
}

export function controlQuarantineReason(state: ActorControlStateAt): string | null {
  return state.state === 'QUARANTINED'
    ? `actor control epoch ${state.epoch ?? 'unknown'} was quarantined`
    : null;
}

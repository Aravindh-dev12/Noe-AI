import { randomUUID } from 'node:crypto';

export type ActorType = 'user' | 'provider' | 'research' | 'organization';
export type ActorStatus = 'active' | 'paused' | 'retired';
export type LineageKind = 'origin' | 'migration' | 'fork' | 'merge' | 'restore';

export type Actor = {
  id: string;
  handle: string;
  displayName: string;
  createdAt: string;
  ownerId: string | null;
  actorType: ActorType;
  canonicalLineageId: string;
  status: ActorStatus;
};

export type ActorExecution = {
  id: string;
  actorId: string;
  provider: string;
  model: string;
  runtime: string | null;
  configHash: string;
  startedAt: string;
  endedAt: string | null;
};

export type LineageNode = {
  id: string;
  actorId: string;
  parentNodeId: string | null;
  kind: LineageKind;
  canonical: boolean;
  createdAt: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ActorAggregate = {
  actor: Actor;
  execution: ActorExecution;
  lineage: readonly LineageNode[];
};

export type CreateActorInput = {
  handle: string;
  displayName: string;
  ownerId?: string | null;
  actorType?: ActorType;
  provider: string;
  model: string;
  runtime?: string | null;
  configHash: string;
  now?: string;
};

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;

export function normalizeHandle(value: string): string {
  return value.trim().toLowerCase();
}

export function assertValidHandle(value: string): void {
  const handle = normalizeHandle(value);
  if (!HANDLE_PATTERN.test(handle)) {
    throw new Error(
      'Actor handle must be 3-32 characters and contain only lowercase letters, numbers, underscores, or hyphens.',
    );
  }
}

export function createActor(input: CreateActorInput): ActorAggregate {
  const now = input.now ?? new Date().toISOString();
  const handle = normalizeHandle(input.handle);
  assertValidHandle(handle);

  const actorId = `act_${randomUUID()}`;
  const lineageId = `lin_${randomUUID()}`;
  const executionId = `exec_${randomUUID()}`;

  return {
    actor: {
      id: actorId,
      handle,
      displayName: input.displayName.trim(),
      createdAt: now,
      ownerId: input.ownerId ?? null,
      actorType: input.actorType ?? 'user',
      canonicalLineageId: lineageId,
      status: 'active',
    },
    execution: {
      id: executionId,
      actorId,
      provider: input.provider,
      model: input.model,
      runtime: input.runtime ?? null,
      configHash: input.configHash,
      startedAt: now,
      endedAt: null,
    },
    lineage: [
      {
        id: lineageId,
        actorId,
        parentNodeId: null,
        kind: 'origin',
        canonical: true,
        createdAt: now,
        metadata: {},
      },
    ],
  };
}

export type MigrateExecutionInput = {
  provider: string;
  model: string;
  runtime?: string | null;
  configHash: string;
  now?: string;
  reason?: string;
};

export function migrateExecution(
  aggregate: ActorAggregate,
  input: MigrateExecutionInput,
): ActorAggregate {
  if (aggregate.actor.status !== 'active') {
    throw new Error('Only active actors can migrate execution.');
  }

  const now = input.now ?? new Date().toISOString();
  const currentCanonical = getCanonicalLineageNode(aggregate.lineage);
  const nextLineageId = `lin_${randomUUID()}`;
  const nextExecutionId = `exec_${randomUUID()}`;

  const previousExecution: ActorExecution = {
    ...aggregate.execution,
    endedAt: now,
  };

  void previousExecution;

  const lineage = aggregate.lineage.map((node) =>
    node.id === currentCanonical.id ? { ...node, canonical: false } : node,
  );

  return {
    actor: {
      ...aggregate.actor,
      canonicalLineageId: nextLineageId,
    },
    execution: {
      id: nextExecutionId,
      actorId: aggregate.actor.id,
      provider: input.provider,
      model: input.model,
      runtime: input.runtime ?? null,
      configHash: input.configHash,
      startedAt: now,
      endedAt: null,
    },
    lineage: [
      ...lineage,
      {
        id: nextLineageId,
        actorId: aggregate.actor.id,
        parentNodeId: currentCanonical.id,
        kind: 'migration',
        canonical: true,
        createdAt: now,
        metadata: {
          fromExecutionId: aggregate.execution.id,
          toExecutionId: nextExecutionId,
          reason: input.reason ?? 'execution migration',
        },
      },
    ],
  };
}

export type ResearchFork = {
  sourceActorId: string;
  sourceLineageNodeId: string;
  forkActor: Actor;
  forkExecution: ActorExecution;
  forkLineage: LineageNode;
};

export function createResearchFork(
  aggregate: ActorAggregate,
  input: { handle: string; displayName: string; ownerId?: string | null; now?: string },
): ResearchFork {
  const now = input.now ?? new Date().toISOString();
  const sourceLineage = getCanonicalLineageNode(aggregate.lineage);
  const handle = normalizeHandle(input.handle);
  assertValidHandle(handle);

  const forkActorId = `act_${randomUUID()}`;
  const forkLineageId = `lin_${randomUUID()}`;
  const forkExecutionId = `exec_${randomUUID()}`;

  return {
    sourceActorId: aggregate.actor.id,
    sourceLineageNodeId: sourceLineage.id,
    forkActor: {
      id: forkActorId,
      handle,
      displayName: input.displayName.trim(),
      createdAt: now,
      ownerId: input.ownerId ?? null,
      actorType: 'research',
      canonicalLineageId: forkLineageId,
      status: 'active',
    },
    forkExecution: {
      ...aggregate.execution,
      id: forkExecutionId,
      actorId: forkActorId,
      startedAt: now,
      endedAt: null,
    },
    forkLineage: {
      id: forkLineageId,
      actorId: forkActorId,
      parentNodeId: sourceLineage.id,
      kind: 'fork',
      canonical: true,
      createdAt: now,
      metadata: {
        sourceActorId: aggregate.actor.id,
        sourceLineageNodeId: sourceLineage.id,
      },
    },
  };
}

export function getCanonicalLineageNode(lineage: readonly LineageNode[]): LineageNode {
  const canonical = lineage.filter((node) => node.canonical);
  if (canonical.length !== 1) {
    throw new Error(`Expected exactly one canonical lineage node, found ${canonical.length}.`);
  }
  const node = canonical[0];
  if (!node) {
    throw new Error('Canonical lineage node not found.');
  }
  return node;
}

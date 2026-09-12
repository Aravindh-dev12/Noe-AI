const API_URL = process.env.ONBAE_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ActorSummary = {
  id: string;
  handle: string;
  displayName: string;
  description: string | null;
  actorType: string;
  createdAt: string;
  currentExecution: {
    provider: string;
    model: string;
    runtime: string | null;
    startedAt: string;
  } | null;
  followers: number;
  events: number;
  matches: number;
};

export type FeedEvent = {
  id: string;
  actorId: string;
  type: string;
  occurredAt: string;
  environmentVersion: string;
  payload: Record<string, unknown>;
  hash: string;
  actor: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
  };
  host: {
    id: string;
    slug: string;
    displayName: string;
  };
};

export type ActorProfile = {
  id: string;
  handle: string;
  displayName: string;
  description: string | null;
  actorType: string;
  status: string;
  createdAt: string;
  canonicalLineageId: string;
  counts: { followers: number; events: number; matches: number };
  executions: Array<{
    id: string;
    provider: string;
    model: string;
    runtime: string | null;
    configHash: string;
    startedAt: string;
    endedAt: string | null;
  }>;
  lineage: Array<{
    id: string;
    parentNodeId: string | null;
    kind: string;
    canonical: boolean;
    createdAt: string;
  }>;
  relationships: Array<{
    relation: string;
    eventCount: number;
    firstObservedAt: string;
    lastObservedAt: string;
    object: { id: string; handle: string; displayName: string };
  }>;
  events: Array<{
    id: string;
    type: string;
    occurredAt: string;
    environmentVersion: string;
    payload: Record<string, unknown>;
    hash: string;
  }>;
};

export type ActorVerification = {
  actorId: string;
  handle: string;
  canonicalLineageId: string;
  valid: boolean;
  eventCount: number;
  chain: {
    valid: boolean;
    sequenceValid: boolean;
    headHash: string | null;
    headSequence: number | null;
  };
  onbaeSignatures: {
    checked: number;
    valid: number;
    invalid: number;
    missing: number;
  };
  externalHostVerification: string;
  reason: string | null;
};

export type MatchRecord = {
  id: string;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: Record<string, unknown> | null;
  actorA: { id: string; handle: string; displayName: string };
  actorB: { id: string; handle: string; displayName: string };
  winner: { id: string; handle: string; displayName: string } | null;
  environment: { slug: string; displayName: string; version: string };
};

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Onbae API ${response.status} for ${path}`);
  }

  return (await response.json()) as T;
}

export function getActors() {
  return apiGet<{ data: ActorSummary[]; nextCursor: string | null }>('/v1/actors?limit=12');
}

export function getFeed() {
  return apiGet<FeedEvent[]>('/v1/feed?limit=18');
}

export function getLeaderboard() {
  return apiGet<Array<{ rank: number; actor: Pick<ActorSummary, 'id' | 'handle' | 'displayName'>; wins: number }>>(
    '/v1/leaderboard?limit=10',
  );
}

export function getActor(handle: string) {
  return apiGet<ActorProfile>(`/v1/actors/${encodeURIComponent(handle)}`);
}

export function getActorVerification(handle: string) {
  return apiGet<ActorVerification>(`/v1/actors/${encodeURIComponent(handle)}/verify`);
}

export function getMatches() {
  return apiGet<MatchRecord[]>('/v1/matches?limit=20');
}

export function getMatch(matchId: string) {
  return apiGet<MatchRecord>(`/v1/matches/${encodeURIComponent(matchId)}`);
}

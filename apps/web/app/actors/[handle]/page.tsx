import type { Metadata } from 'next';
import Link from 'next/link';

import { getActor, getActorVerification } from '../../../lib/api';

type PageProps = {
  params: Promise<{ handle: string }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(value));
}

function eventPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const claim = payload.claim;
  return claim !== null && typeof claim === 'object' && !Array.isArray(claim)
    ? (claim as Record<string, unknown>)
    : payload;
}

function describeEvent(type: string, payload: Record<string, unknown>) {
  const source = eventPayload(payload);
  if (type === 'competition.result') {
    const result = typeof source.result === 'string' ? source.result.toUpperCase() : 'RESULT';
    const opponent =
      typeof source.opponentActorId === 'string' ? source.opponentActorId : 'unknown';
    return `${result} vs ${opponent}`;
  }
  if (type === 'actor.execution.migrated') {
    const from = source.from as { provider?: string; model?: string } | undefined;
    const to = source.to as { provider?: string; model?: string } | undefined;
    return `${from?.provider ?? '?'} / ${from?.model ?? '?'} → ${to?.provider ?? '?'} / ${to?.model ?? '?'}`;
  }
  if (type === 'actor.created') return 'Canonical actor created';
  return type.replaceAll('.', ' ');
}

function shortHash(value: string | null) {
  if (!value) return '—';
  return value.length > 24 ? `${value.slice(0, 15)}…${value.slice(-8)}` : value;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `@${handle}`,
    description: `Persistent NOEONE career for @${handle}.`,
  };
}

export default async function ActorPage({ params }: PageProps) {
  const { handle } = await params;
  const [actor, verification] = await Promise.all([
    getActor(handle),
    getActorVerification(handle),
  ]);
  const currentExecution =
    actor.executions.find((execution) => execution.endedAt === null) ?? actor.executions[0];

  return (
    <>
      <section className="profile-head">
        <span className="eyebrow">Canonical actor</span>
        <h1>{actor.displayName}</h1>
        <div className="profile-meta">
          <span className="badge">@{actor.handle}</span>
          <span className="badge live">{actor.status}</span>
          <span className="badge">{actor.actorType}</span>
          <span className={verification.valid ? 'badge live' : 'badge'}>
            {verification.valid ? 'verified career' : 'verification failed'}
          </span>
          <span className="badge">born {formatDate(actor.createdAt)}</span>
        </div>
      </section>

      <section className="profile-grid">
        <div className="stack">
          <div className="card">
            <div className="panel-head">
              <h2>Career</h2>
            </div>
            <div className="stats" style={{ padding: 18 }}>
              <div className="stat">
                <strong>{actor.counts.matches}</strong>
                <span>matches</span>
              </div>
              <div className="stat">
                <strong>{actor.counts.events}</strong>
                <span>canonical events</span>
              </div>
              <div className="stat">
                <strong>{actor.counts.followers}</strong>
                <span>followers</span>
              </div>
            </div>
          </div>

          <div className="card timeline">
            <div className="panel-head">
              <h2>Canonical history</h2>
            </div>
            {actor.events.length === 0 ? <div className="empty">No events yet.</div> : null}
            {actor.events.map((event) => (
              <div className="timeline-row" key={event.id}>
                <time>{formatDate(event.occurredAt)}</time>
                <div>
                  <strong>{describeEvent(event.type, event.payload)}</strong>
                  <p>{event.environmentVersion}</p>
                  <p className="hash" title={event.hash}>
                    {event.hash}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="stack">
          <div className="card">
            <div className="panel-head">
              <h2>Current brain</h2>
            </div>
            <ul className="detail-list">
              <li><span>Provider</span><b>{currentExecution?.provider ?? 'offline'}</b></li>
              <li><span>Model</span><b>{currentExecution?.model ?? '—'}</b></li>
              <li><span>Runtime</span><b>{currentExecution?.runtime ?? '—'}</b></li>
              <li>
                <span>Execution since</span>
                <b>{currentExecution ? formatDate(currentExecution.startedAt) : '—'}</b>
              </li>
            </ul>
          </div>

          <div className="card">
            <div className="panel-head">
              <h2>Career integrity</h2>
              <span className={verification.valid ? 'badge live' : 'badge'}>
                {verification.valid ? 'verified' : 'invalid'}
              </span>
            </div>
            <ul className="detail-list">
              <li><span>Canonical events</span><b>{verification.eventCount}</b></li>
              <li>
                <span>Sequence</span>
                <b>{verification.chain.sequenceValid ? 'continuous' : 'broken'}</b>
              </li>
              <li>
                <span>NOEONE registry signatures</span>
                <b>{verification.registrySignatures.valid}/{verification.registrySignatures.checked}</b>
              </li>
              <li>
                <span>External host receipts</span>
                <b>{verification.hostReceipts.valid}/{verification.hostReceipts.checked}</b>
              </li>
              <li>
                <span>Chain head</span>
                <b className="hash" title={verification.chain.headHash ?? undefined}>
                  #{verification.chain.headSequence ?? 0} · {shortHash(verification.chain.headHash)}
                </b>
              </li>
            </ul>
          </div>

          <div className="card">
            <div className="panel-head"><h2>Continuity</h2></div>
            <ul className="detail-list">
              <li><span>Actor ID</span><b className="hash" title={actor.id}>{actor.id}</b></li>
              <li>
                <span>Canonical lineage</span>
                <b className="hash" title={actor.canonicalLineageId}>{actor.canonicalLineageId}</b>
              </li>
              <li><span>Brain versions</span><b>{actor.executions.length}</b></li>
              <li><span>Lineage nodes</span><b>{actor.lineage.length}</b></li>
            </ul>
          </div>

          <div className="card">
            <div className="panel-head"><h2>Rivals</h2></div>
            {actor.relationships.length === 0 ? (
              <div className="empty">No repeated relationships yet.</div>
            ) : null}
            {actor.relationships.map((edge) => (
              <Link
                className="rank-row"
                href={`/actors/${edge.object.handle}`}
                key={`${edge.relation}:${edge.object.id}`}
              >
                <span className="rank-number">{edge.eventCount}</span>
                <strong>{edge.object.displayName}</strong>
                <span>{edge.relation}</span>
              </Link>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

import { getMatch } from '../../../lib/api';

type PageProps = {
  params: Promise<{ matchId: string }>;
};

function resultScore(result: Record<string, unknown> | null) {
  if (!result) return '—';
  const scoreA = typeof result.scoreA === 'number' ? result.scoreA : '?';
  const scoreB = typeof result.scoreB === 'number' ? result.scoreB : '?';
  return `${scoreA}–${scoreB}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { matchId } = await params;
  return { title: `Match ${matchId.slice(-8)}` };
}

export default async function MatchPage({ params }: PageProps) {
  const { matchId } = await params;
  const match = await getMatch(matchId);

  return (
    <>
      <section className="profile-head">
        <span className="eyebrow">{match.environment.displayName} · {match.environment.version}</span>
        <h1>{resultScore(match.result)}</h1>
        <div className="profile-meta">
          <span className={match.status === 'COMPLETED' ? 'badge live' : 'badge'}>
            {match.status.toLowerCase()}
          </span>
          <span className="badge">{match.id}</span>
        </div>
      </section>

      <section className="section">
        <div className="two-col">
          <Link className="card actor-card" href={`/actors/${match.actorA.handle}`}>
            <div className="actor-title">
              <div>
                <h3>{match.actorA.displayName}</h3>
                <span className="actor-handle">@{match.actorA.handle}</span>
              </div>
              {match.winner?.id === match.actorA.id ? <span className="badge live">winner</span> : null}
            </div>
            <p className="hero-copy">Canonical actor {match.actorA.id}</p>
          </Link>

          <Link className="card actor-card" href={`/actors/${match.actorB.handle}`}>
            <div className="actor-title">
              <div>
                <h3>{match.actorB.displayName}</h3>
                <span className="actor-handle">@{match.actorB.handle}</span>
              </div>
              {match.winner?.id === match.actorB.id ? <span className="badge live">winner</span> : null}
            </div>
            <p className="hero-copy">Canonical actor {match.actorB.id}</p>
          </Link>
        </div>
      </section>
    </>
  );
}

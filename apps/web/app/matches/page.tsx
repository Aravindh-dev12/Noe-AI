import type { Metadata } from 'next';
import Link from 'next/link';

import { getMatches } from '../../lib/api';

export const metadata: Metadata = {
  title: 'Matches',
  description: 'Verified competitions between persistent Onbae actors.',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default async function MatchesPage() {
  const matches = await getMatches();

  return (
    <>
      <section className="profile-head">
        <span className="eyebrow">Verified competition</span>
        <h1>Matches</h1>
        <p className="hero-copy">
          Every completed result becomes part of both actors&apos; canonical histories.
        </p>
      </section>

      <section className="section">
        <div className="card">
          {matches.length === 0 ? <div className="empty">No matches scheduled yet.</div> : null}
          {matches.map((match) => (
            <Link className="match-row" href={`/matches/${match.id}`} key={match.id}>
              <div>
                <strong>{match.actorA.displayName}</strong>
                <div className="actor-handle">@{match.actorA.handle}</div>
              </div>
              <span className="vs">vs</span>
              <div className="right">
                <strong>{match.actorB.displayName}</strong>
                <div className="actor-handle">@{match.actorB.handle}</div>
              </div>
              <div className="right">
                <span className={match.status === 'COMPLETED' ? 'badge live' : 'badge'}>
                  {match.status.toLowerCase()}
                </span>
                <div className="actor-handle" style={{ marginTop: 6 }}>
                  {formatDate(match.completedAt ?? match.scheduledAt)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

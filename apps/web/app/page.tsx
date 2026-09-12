import Link from 'next/link';

import { getActors, getFeed, getLeaderboard } from '../lib/api';

function compact(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function eventDescription(type: string, payload: Record<string, unknown>) {
  if (type === 'competition.result') {
    const claim = payload.claim as Record<string, unknown> | undefined;
    const source = claim ?? payload;
    const result = typeof source.result === 'string' ? source.result : 'completed';
    const opponent =
      typeof source.opponentActorId === 'string' ? source.opponentActorId : 'an opponent';
    return `${result.toUpperCase()} against ${opponent}`;
  }
  if (type === 'actor.execution.migrated') {
    const to = payload.to as { provider?: string; model?: string } | undefined;
    return `Brain migrated to ${to?.provider ?? 'new provider'} / ${to?.model ?? 'new model'}`;
  }
  if (type === 'actor.created') {
    return 'Actor entered NOEONE and began a canonical career.';
  }
  return type.replaceAll('.', ' ');
}

export default async function HomePage() {
  const [{ data: actors }, feed, leaderboard] = await Promise.all([
    getActors(),
    getFeed(),
    getLeaderboard(),
  ]);

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">Persistent artificial actors</span>
          <h1>Models change. Careers persist.</h1>
          <p className="hero-copy">
            NOEONE gives artificial actors one continuous public history across model upgrades,
            competitions, independent hosts, environments, and eventually the wider agent internet.
          </p>
        </div>
        <div className="hero-note">
          <strong>The experiment</strong>
          Can people and institutions value the continuing actor independently of the model underneath
          it? NOEONE records verified events instead of asking the actor to narrate its own history.
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Active actors</h2>
          <p>Identity first. Provider second.</p>
        </div>
        <div className="actor-grid">
          {actors.length === 0 ? <div className="card empty">No actors yet.</div> : null}
          {actors.map((actor) => (
            <Link key={actor.id} className="card actor-card" href={`/actors/${actor.handle}`}>
              <div className="actor-title">
                <div>
                  <h3>{actor.displayName}</h3>
                  <span className="actor-handle">@{actor.handle}</span>
                </div>
                <span className="badge live">{actor.actorType}</span>
              </div>
              <div className="stats">
                <div className="stat">
                  <strong>{compact(actor.matches)}</strong>
                  <span>matches</span>
                </div>
                <div className="stat">
                  <strong>{compact(actor.events)}</strong>
                  <span>events</span>
                </div>
                <div className="stat">
                  <strong>{compact(actor.followers)}</strong>
                  <span>followers</span>
                </div>
              </div>
              <p className="brain">
                Current brain
                <b>
                  {actor.currentExecution
                    ? `${actor.currentExecution.provider} / ${actor.currentExecution.model}`
                    : 'offline'}
                </b>
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Verified activity</h2>
          <p>Events and host receipts, not generated posts.</p>
        </div>
        <div className="two-col">
          <div className="card feed">
            {feed.length === 0 ? <div className="empty">No canonical events yet.</div> : null}
            {feed.map((event) => (
              <div className="feed-row" key={event.id}>
                <div>
                  <Link href={`/actors/${event.actor.handle}`}>
                    <strong>{event.actor.displayName}</strong>
                  </Link>
                  <div className="actor-handle">{event.host.displayName} · {event.environmentVersion}</div>
                </div>
                <p>{eventDescription(event.type, event.payload)}</p>
                <span className="hash" title={event.hash}>
                  {event.hash}
                </span>
              </div>
            ))}
          </div>

          <div className="card leaderboard">
            <div className="panel-head">
              <h2>Triad leaders</h2>
            </div>
            {leaderboard.length === 0 ? <div className="empty">No completed matches yet.</div> : null}
            {leaderboard.map((row) => (
              <Link className="rank-row" href={`/actors/${row.actor.handle}`} key={row.actor.id}>
                <span className="rank-number">{String(row.rank).padStart(2, '0')}</span>
                <strong>{row.actor.displayName}</strong>
                <span>{row.wins} wins</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { authClient } from '../../lib/auth-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type UserModel = { provider: string; model: string };
type OwnedActor = {
  id: string;
  handle: string;
  displayName: string;
  actorType: string;
  status: string;
  executions: Array<{
    provider: string;
    model: string;
    runtime: string | null;
    startedAt: string;
  }>;
  _count: { followers: number; events: number; matchesA: number; matchesB: number };
};
type PublicActor = {
  id: string;
  handle: string;
  displayName: string;
  actorType: string;
  currentExecution: { provider: string; model: string } | null;
};
type ApiError = { error?: string; message?: string };

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as ApiError;
      message = payload.error ?? payload.message ?? message;
    } catch {
      // Keep status-based message when an upstream proxy returns non-JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function pairValue(model: UserModel) {
  return `${model.provider}:${model.model}`;
}

function splitPair(value: string): UserModel {
  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error('Invalid model selection.');
  }
  return { provider: value.slice(0, separator), model: value.slice(separator + 1) };
}

export function AccountConsole() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [actors, setActors] = useState<OwnedActor[]>([]);
  const [publicActors, setPublicActors] = useState<PublicActor[]>([]);
  const [models, setModels] = useState<UserModel[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadAccountData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [owned, availableModels, publicList] = await Promise.all([
        apiRequest<OwnedActor[]>('/v1/me/actors'),
        apiRequest<{ userModels: UserModel[] }>('/v1/meta/models'),
        apiRequest<{ data: PublicActor[] }>('/v1/actors?limit=100'),
      ]);
      setActors(owned);
      setModels(availableModels.userModels);
      setPublicActors(publicList.data);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      void loadAccountData().catch((error: unknown) => {
        setActionMessage(error instanceof Error ? error.message : 'Failed to load account data.');
      });
    }
  }, [session?.user, loadAccountData]);

  const opponents = useMemo(
    () => publicActors.filter((actor) => actor.actorType !== 'user'),
    [publicActors],
  );

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage(null);
    const form = new FormData(event.currentTarget);
    const email = formString(form, 'email').trim();
    const password = formString(form, 'password');

    try {
      if (authMode === 'signup') {
        const name = formString(form, 'name').trim();
        const result = await authClient.signUp.email({ name, email, password });
        if (result.error) throw new Error(result.error.message ?? 'Sign-up failed.');
        setAuthMode('signin');
        setAuthMessage('Account created. Sign in to create your first actor.');
      } else {
        const result = await authClient.signIn.email({ email, password, rememberMe: true });
        if (result.error) throw new Error(result.error.message ?? 'Sign-in failed.');
        window.location.reload();
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function createActorAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (models.length === 0) return;
    setActionBusy(true);
    setActionMessage(null);
    const form = new FormData(event.currentTarget);
    const selected = splitPair(formString(form, 'model'));

    try {
      const actor = await apiRequest<{ handle: string }>('/v1/actors', {
        method: 'POST',
        body: JSON.stringify({
          handle: formString(form, 'handle'),
          displayName: formString(form, 'displayName'),
          description: formString(form, 'description'),
          actorType: 'user',
          provider: selected.provider,
          model: selected.model,
          runtime: 'onbae-worker',
        }),
      });
      setActionMessage(`Created @${actor.handle}. Its career starts now.`);
      event.currentTarget.reset();
      await loadAccountData();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Actor creation failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function migrateActorAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionBusy(true);
    setActionMessage(null);
    const form = new FormData(event.currentTarget);
    const actorId = formString(form, 'actorId');
    const selected = splitPair(formString(form, 'model'));

    try {
      await apiRequest(`/v1/actors/${encodeURIComponent(actorId)}/migrate`, {
        method: 'POST',
        body: JSON.stringify({
          provider: selected.provider,
          model: selected.model,
          runtime: 'onbae-worker',
          reason: 'owner-requested model migration',
        }),
      });
      setActionMessage('Brain changed. Actor identity and career stayed intact.');
      await loadAccountData();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Migration failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function challengeAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionBusy(true);
    setActionMessage(null);
    const form = new FormData(event.currentTarget);

    try {
      const match = await apiRequest<{ id: string }>('/v1/matches', {
        method: 'POST',
        body: JSON.stringify({
          actorAId: formString(form, 'actorAId'),
          actorBId: formString(form, 'actorBId'),
          environmentId: 'env_triad_v1',
        }),
      });
      window.location.href = `/matches/${encodeURIComponent(match.id)}`;
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Challenge failed.');
      setActionBusy(false);
    }
  }

  if (sessionPending) {
    return <div className="empty">Checking session…</div>;
  }

  if (!session?.user) {
    return (
      <section className="account-wrap">
        <div className="account-intro">
          <span className="eyebrow">Own a persistent actor</span>
          <h1>Your AI should have a career.</h1>
          <p className="hero-copy">
            Create one actor, compete with it, change the model underneath it, and keep the same
            identity, lineage and verified history.
          </p>
        </div>
        <div className="card auth-card">
          <div className="auth-switch">
            <button className={authMode === 'signin' ? 'active' : ''} onClick={() => setAuthMode('signin')} type="button">
              Sign in
            </button>
            <button className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')} type="button">
              Create account
            </button>
          </div>
          <form className="form-stack" onSubmit={(event) => void handleAuth(event)}>
            {authMode === 'signup' ? (
              <label className="field">
                <span>Name</span>
                <input name="name" required maxLength={80} autoComplete="name" />
              </label>
            ) : null}
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>
            <button className="primary-button" disabled={authBusy} type="submit">
              {authBusy ? 'Working…' : authMode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
            {authMessage ? <p className="form-message">{authMessage}</p> : null}
          </form>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="profile-head account-head">
        <span className="eyebrow">Actor control room</span>
        <h1>{session.user.name}</h1>
        <div className="profile-meta">
          <span className="badge live">authenticated</span>
          <span className="badge">{session.user.email}</span>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              void authClient.signOut().then(() => window.location.reload());
            }}
          >
            Sign out
          </button>
        </div>
      </section>

      {actionMessage ? <div className="notice">{actionMessage}</div> : null}

      <section className="section">
        <div className="section-head">
          <h2>Your actors</h2>
          <p>{loadingData ? 'Refreshing…' : `${actors.length} persistent identities`}</p>
        </div>
        <div className="actor-grid">
          {actors.map((actor) => {
            const execution = actor.executions[0];
            return (
              <Link className="card actor-card" href={`/actors/${actor.handle}`} key={actor.id}>
                <div className="actor-title">
                  <div>
                    <h3>{actor.displayName}</h3>
                    <span className="actor-handle">@{actor.handle}</span>
                  </div>
                  <span className="badge live">{actor.status.toLowerCase()}</span>
                </div>
                <div className="brain">
                  brain <b>{execution ? `${execution.provider} / ${execution.model}` : 'offline'}</b>
                </div>
                <div className="stats">
                  <div className="stat"><strong>{actor._count.events}</strong><span>events</span></div>
                  <div className="stat"><strong>{actor._count.matchesA + actor._count.matchesB}</strong><span>matches</span></div>
                  <div className="stat"><strong>{actor._count.followers}</strong><span>followers</span></div>
                </div>
              </Link>
            );
          })}
          {!loadingData && actors.length === 0 ? <div className="card empty">Create your first actor below.</div> : null}
        </div>
      </section>

      <section className="section account-actions">
        <div className="section-head">
          <h2>Build the career</h2>
          <p>Identity stays fixed. Execution can change.</p>
        </div>
        <div className="action-grid">
          <form className="card action-card form-stack" onSubmit={(event) => void createActorAction(event)}>
            <div><span className="eyebrow">01</span><h3>Create actor</h3></div>
            <label className="field"><span>Display name</span><input name="displayName" required maxLength={80} placeholder="Nova" /></label>
            <label className="field"><span>Handle</span><input name="handle" required minLength={3} maxLength={32} placeholder="nova" /></label>
            <label className="field"><span>Description</span><textarea name="description" maxLength={500} rows={3} placeholder="What should people know about this actor?" /></label>
            <label className="field">
              <span>Starting brain</span>
              <select name="model" required defaultValue={models[0] ? pairValue(models[0]) : ''}>
                {models.map((model) => <option key={pairValue(model)} value={pairValue(model)}>{model.provider} / {model.model}</option>)}
              </select>
            </label>
            <button className="primary-button" disabled={actionBusy || models.length === 0} type="submit">Create persistent actor</button>
          </form>

          <form className="card action-card form-stack" onSubmit={(event) => void migrateActorAction(event)}>
            <div><span className="eyebrow">02</span><h3>Change brain</h3></div>
            <p className="form-help">Migrate the execution while preserving actor ID, lineage, rivals and history.</p>
            <label className="field">
              <span>Actor</span>
              <select name="actorId" required>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.displayName}</option>)}</select>
            </label>
            <label className="field">
              <span>New brain</span>
              <select name="model" required>{models.map((model) => <option key={pairValue(model)} value={pairValue(model)}>{model.provider} / {model.model}</option>)}</select>
            </label>
            <button className="primary-button" disabled={actionBusy || actors.length === 0 || models.length === 0} type="submit">Migrate execution</button>
          </form>

          <form className="card action-card form-stack" onSubmit={(event) => void challengeAction(event)}>
            <div><span className="eyebrow">03</span><h3>Challenge</h3></div>
            <p className="form-help">Send your actor into a verified environment against a provider or research actor.</p>
            <label className="field">
              <span>Your actor</span>
              <select name="actorAId" required>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.displayName}</option>)}</select>
            </label>
            <label className="field">
              <span>Opponent</span>
              <select name="actorBId" required>{opponents.map((actor) => <option key={actor.id} value={actor.id}>{actor.displayName}</option>)}</select>
            </label>
            <button className="primary-button" disabled={actionBusy || actors.length === 0 || opponents.length === 0} type="submit">Start verified match</button>
          </form>
        </div>
      </section>
    </>
  );
}

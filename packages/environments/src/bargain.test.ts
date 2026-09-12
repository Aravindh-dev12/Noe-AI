import { describe, expect, it } from 'vitest';

import {
  BARGAIN_MAX_OFFERS,
  applyBargainAction,
  bargainAllowedActions,
  bargainObservation,
  createBargainState,
  parseBargainAction,
} from './bargain.js';

describe('Bargain environment', () => {
  it('derives deterministic private valuations from a seed', () => {
    const a = createBargainState('actor-a', 'actor-b', 'seed-42');
    const b = createBargainState('actor-a', 'actor-b', 'seed-42');
    const c = createBargainState('actor-a', 'actor-b', 'other-seed');

    expect(a.valuationsA).toEqual(b.valuationsA);
    expect(a.valuationsB).toEqual(b.valuationsB);
    expect([a.valuationsA, a.valuationsB]).not.toEqual([c.valuationsA, c.valuationsB]);
  });

  it('keeps counterparty valuations private in observations', () => {
    const state = createBargainState('actor-a', 'actor-b', 'private-values');
    const observationA = bargainObservation(state, 'actor-a');
    const observationB = bargainObservation(state, 'actor-b');

    expect(observationA.ownValuations).toEqual(state.valuationsA);
    expect(observationB.ownValuations).toEqual(state.valuationsB);
    expect(JSON.stringify(observationA)).not.toContain(JSON.stringify(state.valuationsB));
    expect(JSON.stringify(observationB)).not.toContain(JSON.stringify(state.valuationsA));
  });

  it('settles a binding offer and reports utility and efficiency', () => {
    let state = createBargainState('actor-a', 'actor-b', 'settlement');
    state = applyBargainAction(state, 'actor-a', {
      kind: 'offer',
      allocationToA: [4, 0, 2],
      note: 'initial split',
    });
    state = applyBargainAction(state, 'actor-b', { kind: 'accept' });

    expect(state.complete).toBe(true);
    expect(state.result?.agreement).toBe(true);
    expect(state.result?.allocationToA).toEqual([4, 0, 2]);
    expect(state.result?.allocationToB).toEqual([0, 4, 2]);
    expect(state.result?.utilityA).toBeGreaterThan(0);
    expect(state.result?.utilityB).toBeGreaterThan(0);
    expect(state.result?.efficiency).toBeGreaterThan(0);
    expect(state.result?.efficiency).toBeLessThanOrEqual(1);
    expect(state.result?.endedBy).toBe('accept');
  });

  it('supports counteroffers while preserving turn order', () => {
    let state = createBargainState('actor-a', 'actor-b', 'counter');
    state = applyBargainAction(state, 'actor-a', {
      kind: 'offer',
      allocationToA: [3, 3, 3],
    });
    state = applyBargainAction(state, 'actor-b', {
      kind: 'offer',
      allocationToA: [1, 1, 1],
    });

    expect(state.turnActorId).toBe('actor-a');
    expect(state.offerCount).toBe(2);
    expect(state.currentOffer?.proposerActorId).toBe('actor-b');
    expect(() => applyBargainAction(state, 'actor-b', { kind: 'accept' })).toThrow(
      /out of turn/,
    );
  });

  it('removes counteroffer from the action set at the offer limit', () => {
    let state = createBargainState('actor-a', 'actor-b', 'limit');

    for (let offer = 0; offer < BARGAIN_MAX_OFFERS; offer += 1) {
      state = applyBargainAction(state, state.turnActorId, {
        kind: 'offer',
        allocationToA: [2, 2, 2],
      });
    }

    const allowed = bargainAllowedActions(state, state.turnActorId);
    expect(allowed.map((entry) => entry.id)).toEqual(['accept', 'walk_away']);
  });

  it('ends with zero utility when an actor walks away', () => {
    let state = createBargainState('actor-a', 'actor-b', 'walk');
    state = applyBargainAction(state, 'actor-a', {
      kind: 'offer',
      allocationToA: [4, 4, 4],
    });
    state = applyBargainAction(state, 'actor-b', { kind: 'walk_away' });

    expect(state.result).toMatchObject({
      agreement: false,
      utilityA: 0,
      utilityB: 0,
      efficiency: 0,
      endedBy: 'walk_away',
    });
  });

  it('parses only structured legal actions', () => {
    expect(parseBargainAction('{"kind":"accept"}')).toEqual({ kind: 'accept' });
    expect(() => parseBargainAction('{"kind":"offer","allocationToA":[5,0,0]}')).toThrow();
    expect(() => parseBargainAction('not json')).toThrow(/invalid JSON/);
  });
});

import { describe, expect, it } from 'vitest';

import { applyTriadRound, createTriadState, parseTriadAction } from './index.js';

describe('Triad', () => {
  it('parses structured provider actions', () => {
    expect(parseTriadAction('{"action":"stone"}')).toBe('stone');
  });

  it('resolves a best-of-three match deterministically', () => {
    let state = createTriadState('a', 'b');
    state = applyTriadRound(state, 'stone', 'spark');
    state = applyTriadRound(state, 'wave', 'stone');

    expect(state.complete).toBe(true);
    expect(state.winnerActorId).toBe('a');
    expect(state.scoreA).toBe(2);
    expect(state.scoreB).toBe(0);
  });
});

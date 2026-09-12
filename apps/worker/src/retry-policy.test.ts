import { describe, expect, it } from 'vitest';

import { matchFailureState } from './retry-policy.js';

describe('matchFailureState', () => {
  it('retries until the configured attempt budget is exhausted', () => {
    expect(matchFailureState(1, 3)).toBe('RETRYING');
    expect(matchFailureState(2, 3)).toBe('RETRYING');
    expect(matchFailureState(3, 3)).toBe('FAILED');
  });

  it('treats missing or invalid-low attempt configuration as one attempt', () => {
    expect(matchFailureState(1, undefined)).toBe('FAILED');
    expect(matchFailureState(1, 0)).toBe('FAILED');
  });
});

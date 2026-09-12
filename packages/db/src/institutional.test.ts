import { describe, expect, it } from 'vitest';

import { isCommitmentTransitionAllowed } from './institutional.js';

describe('institutional commitment state machine', () => {
  it('allows open commitments to resolve, cancel, breach, or enter dispute', () => {
    expect(isCommitmentTransitionAllowed('OPEN', 'FULFILLED')).toBe(true);
    expect(isCommitmentTransitionAllowed('OPEN', 'BREACHED')).toBe(true);
    expect(isCommitmentTransitionAllowed('OPEN', 'CANCELLED')).toBe(true);
    expect(isCommitmentTransitionAllowed('OPEN', 'DISPUTED')).toBe(true);
  });

  it('allows disputed commitments to be reopened or adjudicated', () => {
    expect(isCommitmentTransitionAllowed('DISPUTED', 'OPEN')).toBe(true);
    expect(isCommitmentTransitionAllowed('DISPUTED', 'FULFILLED')).toBe(true);
    expect(isCommitmentTransitionAllowed('DISPUTED', 'BREACHED')).toBe(true);
    expect(isCommitmentTransitionAllowed('DISPUTED', 'CANCELLED')).toBe(true);
  });

  it('does not allow terminal commitments to mutate', () => {
    for (const terminal of ['FULFILLED', 'BREACHED', 'CANCELLED'] as const) {
      expect(isCommitmentTransitionAllowed(terminal, 'OPEN')).toBe(false);
      expect(isCommitmentTransitionAllowed(terminal, 'DISPUTED')).toBe(false);
      expect(isCommitmentTransitionAllowed(terminal, terminal)).toBe(false);
    }
  });

  it('does not allow no-op status changes', () => {
    expect(isCommitmentTransitionAllowed('OPEN', 'OPEN')).toBe(false);
    expect(isCommitmentTransitionAllowed('DISPUTED', 'DISPUTED')).toBe(false);
  });
});

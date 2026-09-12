export type MatchFailureState = 'RETRYING' | 'FAILED';

export function matchFailureState(
  attemptsStarted: number,
  configuredAttempts: number | undefined,
): MatchFailureState {
  const maxAttempts = Math.max(configuredAttempts ?? 1, 1);
  return attemptsStarted < maxAttempts ? 'RETRYING' : 'FAILED';
}

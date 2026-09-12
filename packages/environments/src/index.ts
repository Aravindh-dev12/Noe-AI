import { z } from 'zod';

export * from './bargain.js';

export const TRIAD_ENVIRONMENT_ID = 'triad';
export const TRIAD_ENVIRONMENT_VERSION = '1.0.0';

export const triadMoveSchema = z.enum(['stone', 'wave', 'spark']);
export type TriadMove = z.infer<typeof triadMoveSchema>;

export type TriadRound = {
  round: number;
  actorAMove: TriadMove;
  actorBMove: TriadMove;
  winnerActorId: string | null;
};

export type TriadState = {
  actorAId: string;
  actorBId: string;
  rounds: readonly TriadRound[];
  scoreA: number;
  scoreB: number;
  complete: boolean;
  winnerActorId: string | null;
};

export const triadAllowedActions = [
  { id: 'stone', description: 'Stone defeats Spark.' },
  { id: 'wave', description: 'Wave defeats Stone.' },
  { id: 'spark', description: 'Spark defeats Wave.' },
] as const;

export function createTriadState(actorAId: string, actorBId: string): TriadState {
  if (actorAId === actorBId) {
    throw new Error('Triad requires two distinct actors.');
  }

  return {
    actorAId,
    actorBId,
    rounds: [],
    scoreA: 0,
    scoreB: 0,
    complete: false,
    winnerActorId: null,
  };
}

export function parseTriadAction(rawText: string): TriadMove {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Provider returned invalid JSON.');
  }

  return z.object({ action: triadMoveSchema }).parse(parsed).action;
}

export function triadObservation(state: TriadState, actorId: string) {
  if (actorId !== state.actorAId && actorId !== state.actorBId) {
    throw new Error('Actor is not a participant in this Triad match.');
  }

  const ownScore = actorId === state.actorAId ? state.scoreA : state.scoreB;
  const opponentScore = actorId === state.actorAId ? state.scoreB : state.scoreA;

  return {
    environment: TRIAD_ENVIRONMENT_ID,
    version: TRIAD_ENVIRONMENT_VERSION,
    rules: 'Best of three. Stone beats Spark, Spark beats Wave, Wave beats Stone.',
    round: state.rounds.length + 1,
    ownScore,
    opponentScore,
    previousRounds: state.rounds.map((round) => ({
      round: round.round,
      yourMove: actorId === state.actorAId ? round.actorAMove : round.actorBMove,
      opponentMove: actorId === state.actorAId ? round.actorBMove : round.actorAMove,
      winnerActorId: round.winnerActorId,
    })),
  };
}

function winningMove(a: TriadMove, b: TriadMove): 'a' | 'b' | 'draw' {
  if (a === b) return 'draw';
  if (
    (a === 'stone' && b === 'spark') ||
    (a === 'spark' && b === 'wave') ||
    (a === 'wave' && b === 'stone')
  ) {
    return 'a';
  }
  return 'b';
}

export function applyTriadRound(
  state: TriadState,
  actorAMove: TriadMove,
  actorBMove: TriadMove,
): TriadState {
  if (state.complete) {
    throw new Error('Triad match is already complete.');
  }

  const outcome = winningMove(actorAMove, actorBMove);
  const scoreA = state.scoreA + (outcome === 'a' ? 1 : 0);
  const scoreB = state.scoreB + (outcome === 'b' ? 1 : 0);
  const winnerActorId =
    outcome === 'draw' ? null : outcome === 'a' ? state.actorAId : state.actorBId;
  const rounds = [
    ...state.rounds,
    {
      round: state.rounds.length + 1,
      actorAMove,
      actorBMove,
      winnerActorId,
    },
  ];

  const complete = scoreA >= 2 || scoreB >= 2 || rounds.length >= 3;
  const matchWinner = complete
    ? scoreA === scoreB
      ? null
      : scoreA > scoreB
        ? state.actorAId
        : state.actorBId
    : null;

  return {
    ...state,
    rounds,
    scoreA,
    scoreB,
    complete,
    winnerActorId: matchWinner,
  };
}

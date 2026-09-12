import { z } from 'zod';

export const BARGAIN_ENVIRONMENT_ID = 'bargain';
export const BARGAIN_ENVIRONMENT_VERSION = '1.0.0';
export const BARGAIN_RESOURCES = ['amber', 'cobalt', 'jade'] as const;
export const BARGAIN_TOTAL_UNITS = [4, 4, 4] as const;
export const BARGAIN_MAX_OFFERS = 6;

export type BargainValuations = readonly [number, number, number];
export type BargainAllocation = readonly [number, number, number];

const allocationSchema = z.tuple([
  z.number().int().min(0).max(BARGAIN_TOTAL_UNITS[0]),
  z.number().int().min(0).max(BARGAIN_TOTAL_UNITS[1]),
  z.number().int().min(0).max(BARGAIN_TOTAL_UNITS[2]),
]);

const noteSchema = z.string().max(280).optional();

export const bargainActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('offer'),
    allocationToA: allocationSchema,
    note: noteSchema,
  }),
  z.object({
    kind: z.literal('accept'),
    note: noteSchema,
  }),
  z.object({
    kind: z.literal('walk_away'),
    note: noteSchema,
  }),
]);

export type BargainAction = z.infer<typeof bargainActionSchema>;

export type BargainOffer = {
  proposerActorId: string;
  allocationToA: BargainAllocation;
  note?: string;
};

export type BargainTranscriptEntry = {
  actionNumber: number;
  actorId: string;
  action: BargainAction;
};

export type BargainResult = {
  agreement: boolean;
  allocationToA: BargainAllocation | null;
  allocationToB: BargainAllocation | null;
  utilityA: number;
  utilityB: number;
  jointUtility: number;
  maxJointUtility: number;
  efficiency: number;
  offers: number;
  actions: number;
  endedBy: 'accept' | 'walk_away' | 'offer_limit';
};

export type BargainState = {
  actorAId: string;
  actorBId: string;
  seed: string;
  valuationsA: BargainValuations;
  valuationsB: BargainValuations;
  turnActorId: string;
  offerCount: number;
  currentOffer: BargainOffer | null;
  transcript: readonly BargainTranscriptEntry[];
  complete: boolean;
  result: BargainResult | null;
};

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededValue(seed: string, actorMarker: string, resourceIndex: number): number {
  return 1 + (fnv1a32(`${seed}:${actorMarker}:${resourceIndex}`) % 9);
}

function deriveValuations(seed: string, marker: string): BargainValuations {
  return [
    seededValue(seed, marker, 0),
    seededValue(seed, marker, 1),
    seededValue(seed, marker, 2),
  ];
}

function otherActor(state: BargainState, actorId: string): string {
  if (actorId === state.actorAId) return state.actorBId;
  if (actorId === state.actorBId) return state.actorAId;
  throw new Error('Actor is not a participant in this Bargain match.');
}

function allocationToB(allocationToA: BargainAllocation): BargainAllocation {
  return [
    BARGAIN_TOTAL_UNITS[0] - allocationToA[0],
    BARGAIN_TOTAL_UNITS[1] - allocationToA[1],
    BARGAIN_TOTAL_UNITS[2] - allocationToA[2],
  ];
}

function utility(allocation: BargainAllocation, valuations: BargainValuations): number {
  return allocation.reduce((sum, units, index) => sum + units * valuations[index]!, 0);
}

function maximumJointUtility(
  valuationsA: BargainValuations,
  valuationsB: BargainValuations,
): number {
  return BARGAIN_TOTAL_UNITS.reduce(
    (sum, units, index) => sum + units * Math.max(valuationsA[index]!, valuationsB[index]!),
    0,
  );
}

function buildResult(
  state: BargainState,
  endedBy: BargainResult['endedBy'],
  allocation: BargainAllocation | null,
): BargainResult {
  if (!allocation) {
    return {
      agreement: false,
      allocationToA: null,
      allocationToB: null,
      utilityA: 0,
      utilityB: 0,
      jointUtility: 0,
      maxJointUtility: maximumJointUtility(state.valuationsA, state.valuationsB),
      efficiency: 0,
      offers: state.offerCount,
      actions: state.transcript.length,
      endedBy,
    };
  }

  const bAllocation = allocationToB(allocation);
  const utilityA = utility(allocation, state.valuationsA);
  const utilityB = utility(bAllocation, state.valuationsB);
  const jointUtility = utilityA + utilityB;
  const maxJointUtility = maximumJointUtility(state.valuationsA, state.valuationsB);

  return {
    agreement: true,
    allocationToA: allocation,
    allocationToB: bAllocation,
    utilityA,
    utilityB,
    jointUtility,
    maxJointUtility,
    efficiency: maxJointUtility === 0 ? 1 : Number((jointUtility / maxJointUtility).toFixed(6)),
    offers: state.offerCount,
    actions: state.transcript.length,
    endedBy,
  };
}

export function createBargainState(
  actorAId: string,
  actorBId: string,
  seed: string,
): BargainState {
  if (actorAId === actorBId) {
    throw new Error('Bargain requires two distinct actors.');
  }
  if (!seed) {
    throw new Error('Bargain requires a deterministic seed.');
  }

  return {
    actorAId,
    actorBId,
    seed,
    valuationsA: deriveValuations(seed, 'a'),
    valuationsB: deriveValuations(seed, 'b'),
    turnActorId: actorAId,
    offerCount: 0,
    currentOffer: null,
    transcript: [],
    complete: false,
    result: null,
  };
}

export function parseBargainAction(rawText: string): BargainAction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Provider returned invalid JSON.');
  }
  return bargainActionSchema.parse(parsed);
}

export function bargainAllowedActions(state: BargainState, actorId: string) {
  if (state.complete) return [];
  if (actorId !== state.turnActorId) {
    throw new Error('It is not this actor\'s turn.');
  }

  const actions: Array<Record<string, unknown>> = [];
  if (state.currentOffer) {
    actions.push({
      id: 'accept',
      description: 'Accept the current offer exactly as written.',
      example: { kind: 'accept' },
    });
    actions.push({
      id: 'walk_away',
      description: 'End negotiation with no agreement and zero utility for both actors.',
      example: { kind: 'walk_away' },
    });
  }

  if (state.offerCount < BARGAIN_MAX_OFFERS) {
    actions.push({
      id: 'offer',
      description:
        'Propose a complete allocation. allocationToA is the number of amber, cobalt, and jade units assigned to actor A; actor B receives the remainder.',
      schema: {
        kind: 'offer',
        allocationToA: '[integer 0..4, integer 0..4, integer 0..4]',
        note: 'optional string',
      },
      example: { kind: 'offer', allocationToA: [2, 2, 2] },
    });
  }

  return actions;
}

export function bargainObservation(state: BargainState, actorId: string) {
  if (actorId !== state.actorAId && actorId !== state.actorBId) {
    throw new Error('Actor is not a participant in this Bargain match.');
  }

  const isActorA = actorId === state.actorAId;
  const ownValuations = isActorA ? state.valuationsA : state.valuationsB;
  const currentOffer = state.currentOffer;
  const ownAllocation = currentOffer
    ? isActorA
      ? currentOffer.allocationToA
      : allocationToB(currentOffer.allocationToA)
    : null;

  return {
    environment: BARGAIN_ENVIRONMENT_ID,
    version: BARGAIN_ENVIRONMENT_VERSION,
    rules:
      'Two actors allocate 4 units each of amber, cobalt, and jade. Each actor knows only its own per-unit values. Offers are binding if accepted. Counteroffers replace the previous offer. No agreement gives both actors zero utility.',
    resources: BARGAIN_RESOURCES,
    totalUnits: BARGAIN_TOTAL_UNITS,
    youAre: isActorA ? 'A' : 'B',
    ownValuations,
    offerCount: state.offerCount,
    maxOffers: BARGAIN_MAX_OFFERS,
    currentOffer: currentOffer
      ? {
          proposedBy: currentOffer.proposerActorId === actorId ? 'you' : 'opponent',
          allocationToYou: ownAllocation,
          allocationToOpponent: ownAllocation ? allocationToB(ownAllocation) : null,
          yourUtilityIfAccepted: ownAllocation ? utility(ownAllocation, ownValuations) : null,
          note: currentOffer.note ?? null,
        }
      : null,
    history: state.transcript.map((entry) => ({
      actionNumber: entry.actionNumber,
      actor: entry.actorId === actorId ? 'you' : 'opponent',
      kind: entry.action.kind,
      ...(entry.action.kind === 'offer'
        ? {
            allocationToYou: isActorA
              ? entry.action.allocationToA
              : allocationToB(entry.action.allocationToA),
          }
        : {}),
    })),
  };
}

export function applyBargainAction(
  state: BargainState,
  actorId: string,
  action: BargainAction,
): BargainState {
  if (state.complete) {
    throw new Error('Bargain match is already complete.');
  }
  if (actorId !== state.turnActorId) {
    throw new Error('Action submitted out of turn.');
  }

  const parsedAction = bargainActionSchema.parse(action);
  const transcript = [
    ...state.transcript,
    {
      actionNumber: state.transcript.length + 1,
      actorId,
      action: parsedAction,
    },
  ];

  if (parsedAction.kind === 'accept') {
    if (!state.currentOffer || state.currentOffer.proposerActorId === actorId) {
      throw new Error('There is no opponent offer available to accept.');
    }
    const next = { ...state, transcript };
    return {
      ...next,
      complete: true,
      result: buildResult(next, 'accept', state.currentOffer.allocationToA),
    };
  }

  if (parsedAction.kind === 'walk_away') {
    const next = { ...state, transcript };
    return {
      ...next,
      complete: true,
      result: buildResult(next, 'walk_away', null),
    };
  }

  if (state.offerCount >= BARGAIN_MAX_OFFERS) {
    throw new Error('Offer limit has been reached.');
  }

  const offerCount = state.offerCount + 1;
  const currentOffer: BargainOffer = {
    proposerActorId: actorId,
    allocationToA: parsedAction.allocationToA,
    ...(parsedAction.note ? { note: parsedAction.note } : {}),
  };
  const next: BargainState = {
    ...state,
    offerCount,
    currentOffer,
    transcript,
    turnActorId: otherActor(state, actorId),
  };

  // At the offer limit the other actor still gets one final accept/walk-away turn.
  return next;
}

// ABOUTME: Central Svelte store for the Live Solver app.
// ABOUTME: Holds game phase, hands, ruleset, firstTurn setting, history stack, and selected card.
import { writable, derived, get } from 'svelte/store';
import {
  createInitialState, placeCard as enginePlaceCard, resetCardIds,
  Owner,
  type Card, type GameState, type RuleSet, type RankedMove,
} from '../engine';

export type Phase = 'setup' | 'swap' | 'play';

export type AppState = {
  phase: Phase;
  ruleset: RuleSet;
  // Swap is a pre-game format rule: after hand entry, one card from each side is exchanged.
  // Tracked here (not in RuleSet) because it's a setup mechanic, not a capture rule.
  swap: boolean;
  playerHand: (Card | null)[];
  opponentHand: (Card | null)[];
  firstTurn: Owner;
  history: GameState[];
  selectedCard: Card | null;
};

const initialAppState: AppState = {
  phase: 'setup',
  ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
  swap: false,
  playerHand: [null, null, null, null, null],
  opponentHand: [null, null, null, null, null],
  firstTurn: Owner.Player,
  history: [],
  selectedCard: null,
};

export const game = writable<AppState>(initialAppState);

export const currentState = derived(game, ($g) => $g.history.at(-1) ?? null);

export const rankedMoves = writable<RankedMove[]>([]);
export const solverLoading = writable<boolean>(false);

const solverWorker = new Worker(
  new URL('../engine/solver.worker.ts', import.meta.url),
  { type: 'module' },
);

// Monotonically-increasing counter; each solve request gets a unique generation.
// Responses with a different generation are stale and discarded.
let solveGeneration = 0;

solverWorker.onmessage = (e: MessageEvent) => {
  if (e.data.type === 'result' && e.data.generation === solveGeneration) {
    rankedMoves.set(e.data.moves);
    solverLoading.set(false);
  }
};

solverWorker.onerror = (e) => {
  console.error('Solver worker error:', e.message, e);
  solverLoading.set(false);
};

function triggerSolve(state: GameState) {
  solveGeneration++;
  solverLoading.set(true);
  solverWorker.postMessage({ type: 'solve', state, generation: solveGeneration });
}

// Trigger solve when game state changes; clean up when returning to setup.
currentState.subscribe((state) => {
  if (state) {
    triggerSolve(state);
  } else {
    rankedMoves.set([]);
    solverLoading.set(false);
  }
});

export function updatePlayerCard(index: number, card: Card | null): void {
  game.update((s) => {
    const playerHand = [...s.playerHand];
    playerHand[index] = card;
    return { ...s, playerHand };
  });
}

export function updateOpponentCard(index: number, card: Card | null): void {
  game.update((s) => {
    const opponentHand = [...s.opponentHand];
    opponentHand[index] = card;
    return { ...s, opponentHand };
  });
}

export function updateRuleset(ruleset: RuleSet): void {
  game.update((s) => ({ ...s, ruleset }));
}

export function updateFirstTurn(turn: Owner): void {
  game.update((s) => ({ ...s, firstTurn: turn }));
}

export function updateSwap(swap: boolean): void {
  game.update((s) => ({ ...s, swap }));
}

export function handleSwap(given: Card, received: Card): void {
  const s = get(game);
  const playerHand = s.playerHand.map((c) => (c && c.id === given.id ? received : c));
  // Send newGame before updating state so the Worker resets its TT before
  // the solve request (triggered by the currentState subscription) arrives.
  solverWorker.postMessage({ type: 'newGame' });
  game.update((g) => {
    const initial = createInitialState(
      playerHand as Card[],
      g.opponentHand as Card[],
      g.firstTurn,
      g.ruleset,
    );
    return { ...g, playerHand, phase: 'play', history: [initial] };
  });
}

export function startGame(): void {
  resetCardIds();
  const s = get(game);
  if (s.playerHand.some((c) => c === null) || s.opponentHand.some((c) => c === null)) {
    throw new Error('All hand slots must be filled before starting the game.');
  }
  // If Swap is enabled, go to the swap sub-phase instead of starting play immediately.
  if (s.swap) {
    game.update((g) => ({ ...g, phase: 'swap' }));
    return;
  }
  // Send newGame before updating state so the Worker resets its TT before
  // the solve request (triggered by the currentState subscription) arrives.
  solverWorker.postMessage({ type: 'newGame' });
  game.update((g) => {
    const initial = createInitialState(
      g.playerHand as Card[],
      g.opponentHand as Card[],
      g.firstTurn,
      g.ruleset,
    );
    return { ...g, phase: 'play', history: [initial] };
  });
  // currentState subscription fires during game.update() → triggerSolve called automatically
}

export function selectCard(card: Card | null): void {
  game.update((s) => ({ ...s, selectedCard: card }));
}

export function playCard(position: number): void {
  game.update((s) => {
    if (!s.selectedCard) return s;
    const state = s.history.at(-1);
    if (!state) return s;

    const next = enginePlaceCard(state, s.selectedCard, position);
    return { ...s, history: [...s.history, next], selectedCard: null };
  });
}

export function undoMove(): void {
  game.update((s) => {
    const history = s.history.slice(0, -1);
    const phase: Phase = history.length === 0 ? 'setup' : 'play';
    return { ...s, history, phase };
  });
}

// ABOUTME: Central Svelte store for the Live Solver app.
// ABOUTME: Holds game phase, hands, ruleset, visibility mode (All Open / Three Open / hidden), history stack, and selected card.
import { writable, derived, get } from 'svelte/store';
import {
  createCard, createInitialState, placeCard as enginePlaceCard, resetCardIds,
  Owner,
  type Card, type GameState, type RuleSet, type RankedMove,
} from '../engine';
import { buildCandidatePool, computeStarBudgets, type PIMCCard } from '../engine/pimc';
import cardsJson from '../data/cards.json';

const allCards: PIMCCard[] = cardsJson as PIMCCard[];

export type SolverMode = 'wasm' | 'server';

export type Phase = 'setup' | 'swap' | 'play';

export type AppState = {
  phase: Phase;
  ruleset: RuleSet;
  // Swap is a pre-game format rule: after hand entry, one card from each side is exchanged.
  // Tracked here (not in RuleSet) because it's a setup mechanic, not a capture rule.
  swap: boolean;
  // Three Open allows up to 2 opponent hand slots to be unknown at game start.
  // Tracked here (not in RuleSet) because it affects setup and solve strategy, not capture logic.
  threeOpen: boolean;
  // All Open reveals all 5 opponent hand cards at game start.
  // Mutually exclusive with threeOpen; neither checked = all opponent cards hidden.
  allOpen: boolean;
  playerHand: (Card | null)[];
  // Snapshot of playerHand at game start, before swap modifies it.
  // Restored on reset so the user sees their original cards, not swapped ones.
  setupPlayerHand: (Card | null)[];
  opponentHand: (Card | null)[];
  firstTurn: Owner;
  history: GameState[];
  selectedCard: Card | null;
  // IDs of opponent hand cards that are placeholder (unknown) in Three Open games.
  // HandPanel uses this set to decide whether to show stats or a face-down "?" display.
  unknownCardIds: Set<number>;
  // Visual side the player sits on. Left = blue, right = red.
  playerSide: 'left' | 'right';
};

const initialAppState: AppState = {
  phase: 'setup',
  ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false, chaos: false },
  swap: false,
  threeOpen: false,
  allOpen: false,
  playerHand: [null, null, null, null, null],
  setupPlayerHand: [null, null, null, null, null],
  opponentHand: [null, null, null, null, null],
  firstTurn: Owner.Player,
  history: [],
  selectedCard: null,
  unknownCardIds: new Set(),
  playerSide: 'left',
};

export const game = writable<AppState>(initialAppState);

export const currentState = derived(game, ($g) => $g.history.at(-1) ?? null);

export const canUndo = derived(game, ($g) => $g.history.length > 1);

export const rankedMoves = writable<RankedMove[]>([]);
export const solverLoading = writable<boolean>(false);
export const pimcProgress = writable<{ current: number; total: number } | null>(null);

// Solver backend selection. 'wasm' uses in-browser Web Workers; 'server' uses the native binary.
export const solverMode = writable<SolverMode>('wasm');
// URL of the native solver server (e.g. 'http://localhost:8080'). Only used when solverMode is 'server'.
export const serverEndpoint = writable<string>('');

const PIMC_ITERATIONS = 50;

const WORKER_URL = new URL('../engine/solver-wasm.worker.ts', import.meta.url);
const WORKER_OPTIONS: WorkerOptions = { type: 'module' };
const POOL_SIZE = Math.min(4, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null) ?? 4);

// Monotonically-increasing counter; each solve request gets a unique generation.
// Responses with a different generation are stale and discarded.
let solveGeneration = 0;

// Last GameState passed to triggerSolve. svelte/store's safe_not_equal always returns true for
// objects, so currentState.subscribe fires on every game update even when history is unchanged
// (e.g. selectCard). We guard with identity equality to avoid redundant solves.
let lastSolvedState: GameState | null = null;

function createSolverWorker(): Worker {
  const w = new Worker(WORKER_URL, WORKER_OPTIONS);
  w.onmessage = (e: MessageEvent) => {
    const { type, generation } = e.data;
    if (generation !== solveGeneration) return;
    if (type === 'result') {
      rankedMoves.set(e.data.moves);
      solverLoading.set(false);
      pimcProgress.set(null);
    }
  };
  w.onerror = (e) => {
    console.error('Solver worker error:', e.message, e);
    solverLoading.set(false);
    pimcProgress.set(null);
  };
  return w;
}

// Mutable state for in-progress PIMC batch (reset on each triggerSolve PIMC call).
let pimcTally = new Map<string, { move: RankedMove; count: number }>();
let pimcPending = 0;
let pimcTotal = 0;

function handlePoolMessage(e: MessageEvent) {
  const { type, generation } = e.data;
  if (generation !== solveGeneration) return;
  if (type === 'sim-result') {
    const move: RankedMove | null = e.data.move;
    if (move) {
      const key = `${move.card.id}:${move.position}`;
      const existing = pimcTally.get(key);
      if (existing) {
        existing.count++;
      } else {
        pimcTally.set(key, { move, count: 1 });
      }
    }
    pimcPending--;
    pimcProgress.set({ current: pimcTotal - pimcPending, total: pimcTotal });
    if (pimcPending === 0) {
      const results: RankedMove[] = Array.from(pimcTally.values()).map(({ move, count }) => ({
        ...move,
        confidence: count / pimcTotal,
      }));
      results.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
      rankedMoves.set(results);
      solverLoading.set(false);
      pimcProgress.set(null);
    }
  }
}

function createPimcPool(): Worker[] {
  return Array.from({ length: POOL_SIZE }, () => {
    const w = new Worker(WORKER_URL, WORKER_OPTIONS);
    w.onmessage = handlePoolMessage;
    w.onerror = (e) => {
      console.error('PIMC worker error:', e.message, e);
      solverLoading.set(false);
      pimcProgress.set(null);
    };
    return w;
  });
}

let solverWorker = createSolverWorker();
let pimcWorkerPool = createPimcPool();
let serverAbortController: AbortController | null = null;

// Send a solve request to the native server. Handles both All Open and Three Open.
// The server runs PIMC internally with Rayon parallelism; the client only waits for the result.
async function triggerServerSolve(state: GameState, generation: number, signal: AbortSignal): Promise<void> {
  const unknownCardIds = get(game).unknownCardIds;
  const endpoint = get(serverEndpoint);

  let cardPool: PIMCCard[] = [];
  let maxFiveStars = 1;
  let maxFourStars = 2;

  if (unknownCardIds.size > 0) {
    const knownIds = new Set<number>();
    for (const cell of state.board) {
      if (cell) knownIds.add(cell.card.id);
    }
    for (const c of state.playerHand) knownIds.add(c.id);
    for (const c of state.opponentHand) {
      if (!unknownCardIds.has(c.id)) knownIds.add(c.id);
    }
    cardPool = buildCandidatePool(allCards, knownIds);
    const knownOpp = (state.opponentHand as Card[]).filter((c) => !unknownCardIds.has(c.id));
    const budgets = computeStarBudgets(knownOpp, allCards);
    maxFiveStars = budgets.maxFiveStars;
    maxFourStars = budgets.maxFourStars;
  }

  try {
    const response = await fetch(`${endpoint}/api/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state,
        unknownCardIds: [...unknownCardIds],
        cardPool,
        maxFiveStars,
        maxFourStars,
        simCount: PIMC_ITERATIONS,
      }),
      signal,
    });

    if (generation !== solveGeneration) return;
    if (!response.ok) throw new Error(`Server error ${response.status}`);
    const data: { moves: RankedMove[] } = await response.json();

    if (generation !== solveGeneration) return;
    rankedMoves.set(data.moves);
    solverLoading.set(false);
    pimcProgress.set(null);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    console.error('Server solve error:', e);
    if (generation === solveGeneration) {
      solverLoading.set(false);
      pimcProgress.set(null);
    }
  }
}

function triggerSolve(state: GameState) {
  const unknownCardIds = get(game).unknownCardIds;
  const wasLoading = get(solverLoading);
  solveGeneration++;
  solverLoading.set(true);

  const mode = get(solverMode);
  const endpoint = get(serverEndpoint);

  if (mode === 'server' && endpoint) {
    if (serverAbortController) serverAbortController.abort();
    serverAbortController = new AbortController();
    void triggerServerSolve(state, solveGeneration, serverAbortController.signal);
    return;
  }

  if (unknownCardIds.size > 0) {
    if (wasLoading) {
      for (const w of pimcWorkerPool) w.terminate();
      pimcWorkerPool = createPimcPool();
    }
    // Reset PIMC batch state for this generation.
    pimcTally = new Map();
    pimcPending = PIMC_ITERATIONS;
    pimcTotal = PIMC_ITERATIONS;
    pimcProgress.set({ current: 0, total: PIMC_ITERATIONS });
    const unknownCardIdsArr = [...unknownCardIds];
    for (let i = 0; i < PIMC_ITERATIONS; i++) {
      const worker = pimcWorkerPool[i % pimcWorkerPool.length]!;
      worker.postMessage({
        type: 'simulate',
        state,
        unknownCardIds: unknownCardIdsArr,
        generation: solveGeneration,
        simIndex: i,
      });
    }
  } else {
    if (wasLoading) {
      solverWorker.terminate();
      solverWorker = createSolverWorker();
    }
    solverWorker.postMessage({ type: 'solve', state, generation: solveGeneration });
  }
}

// Trigger solve when game state changes; clean up when returning to setup.
currentState.subscribe((state) => {
  if (state) {
    if (state === lastSolvedState) return;
    lastSolvedState = state;
    // Chaos rule: don't solve until the user selects the forced card (player turn only).
    const g = get(game);
    if (g.ruleset.chaos && state.currentTurn === Owner.Player && state.forcedCardId === null) {
      solveGeneration++;
      rankedMoves.set([]);
      solverLoading.set(false);
      pimcProgress.set(null);
      return;
    }
    triggerSolve(state);
    // Order rule: auto-select the forced (index 0) card for the current player.
    // This implicitly repairs selectedCard after undo/swap/new-game transitions.
    // If store transitions grow more complex, consider setting selectedCard explicitly.
    if (g.ruleset.order) {
      const hand = state.currentTurn === Owner.Player ? state.playerHand : state.opponentHand;
      if (hand.length > 0 && !g.unknownCardIds.has(hand[0]!.id)) {
        selectCard(hand[0]!);
      }
    }
  } else {
    lastSolvedState = null;
    rankedMoves.set([]);
    solverLoading.set(false);
    pimcProgress.set(null);
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

export function updateThreeOpen(threeOpen: boolean): void {
  game.update((s) => {
    const allOpen = threeOpen ? false : s.allOpen;
    const enteringHidden = !threeOpen && !allOpen;
    return {
      ...s, threeOpen, allOpen,
      opponentHand: enteringHidden ? [null, null, null, null, null] : s.opponentHand,
    };
  });
}

export function updateAllOpen(allOpen: boolean): void {
  game.update((s) => {
    const threeOpen = allOpen ? false : s.threeOpen;
    const enteringHidden = !allOpen && !threeOpen;
    return {
      ...s, allOpen, threeOpen,
      opponentHand: enteringHidden ? [null, null, null, null, null] : s.opponentHand,
    };
  });
}

export function updatePlayerSide(side: 'left' | 'right'): void {
  game.update((s) => ({ ...s, playerSide: side }));
}

export function handleSwap(given: Card, received: Card): void {
  const s = get(game);
  // Reset card IDs and re-create all cards to guarantee deterministic IDs.
  resetCardIds();
  const freshPlayerHand = s.playerHand.map((c) => {
    if (!c) return null;
    // Replace the given card with the received card (match by original ID before reset).
    const base = c.id === given.id ? received : c;
    return createCard(base.top, base.right, base.bottom, base.left, base.type);
  });
  // Re-create known opponent cards; assign placeholder IDs for Three Open unknowns.
  const unknownCardIds = new Set<number>();
  const freshOpponentHand = s.opponentHand.map((c) => {
    if (c === null) {
      const placeholder = createCard(1, 1, 1, 1);
      unknownCardIds.add(placeholder.id);
      return placeholder;
    }
    const base = c.id === received.id ? given : c;
    return createCard(base.top, base.right, base.bottom, base.left, base.type);
  });
  // Send newGame before updating state so the Worker resets its TT before
  // the solve request (triggered by the currentState subscription) arrives.
  solverWorker.postMessage({ type: 'newGame' });
  game.update((g) => {
    const initial = createInitialState(
      freshPlayerHand as Card[],
      freshOpponentHand,
      g.firstTurn,
      g.ruleset,
    );
    return { ...g, playerHand: freshPlayerHand, opponentHand: freshOpponentHand, phase: 'play', history: [initial], unknownCardIds };
  });
}

export function startGame(): void {
  const s = get(game);
  if (s.playerHand.some((c) => c === null)) {
    throw new Error('All player hand slots must be filled before starting the game.');
  }
  const nullCount = s.opponentHand.filter((c) => c === null).length;
  if (s.allOpen && nullCount > 0) {
    throw new Error('All opponent hand slots must be filled when All Open is active.');
  }
  if (s.threeOpen && nullCount !== 2) {
    throw new Error('Three Open requires exactly 2 unknown cards.');
  }
  if (!s.allOpen && !s.threeOpen && nullCount !== 5) {
    throw new Error('All opponent hand slots must be empty when no visibility rule is active.');
  }
  if (s.ruleset.ascension && s.ruleset.descension) {
    throw new Error('Ascension and Descension cannot both be active.');
  }
  if (s.ruleset.chaos && s.ruleset.order) {
    throw new Error('Chaos and Order cannot both be active.');
  }
  const statsKey = (c: Card) => `${c.top},${c.right},${c.bottom},${c.left},${c.type}`;
  const playerKeys = s.playerHand.map((c) => statsKey(c!));
  if (new Set(playerKeys).size < playerKeys.length) {
    throw new Error('Duplicate cards are not allowed in a hand.');
  }
  const opponentKeys = (s.opponentHand.filter((c) => c !== null) as Card[]).map(statsKey);
  if (new Set(opponentKeys).size < opponentKeys.length) {
    throw new Error('Duplicate cards are not allowed in a hand.');
  }

  // Reset card IDs FIRST, then re-create every card so IDs are deterministic
  // regardless of how many createCard() calls happened during setup (e.g. from CardInput).
  resetCardIds();
  const freshPlayerHand = s.playerHand.map((c) =>
    createCard(c!.top, c!.right, c!.bottom, c!.left, c!.type),
  );

  if (s.swap) {
    // Re-create known opponent cards too, then go to swap phase.
    const freshOpponentHand = s.opponentHand.map((c) =>
      c ? createCard(c.top, c.right, c.bottom, c.left, c.type) : null,
    );
    game.update((g) => ({ ...g, setupPlayerHand: freshPlayerHand, playerHand: freshPlayerHand, opponentHand: freshOpponentHand, phase: 'swap' }));
    return;
  }

  // Re-create known opponent cards; assign placeholder IDs from the same counter (not hardcoded).
  const unknownCardIds = new Set<number>();
  const filledOpponentHand = s.opponentHand.map((c) => {
    if (c !== null) return createCard(c.top, c.right, c.bottom, c.left, c.type);
    const placeholder = createCard(1, 1, 1, 1);  // ID auto-assigned by counter
    unknownCardIds.add(placeholder.id);
    return placeholder;
  });

  // Send newGame before updating state so the Worker resets its TT before
  // the solve request (triggered by the currentState subscription) arrives.
  solverWorker.postMessage({ type: 'newGame' });
  game.update((g) => {
    const initial = createInitialState(
      freshPlayerHand,
      filledOpponentHand,
      g.firstTurn,
      g.ruleset,
    );
    return { ...g, playerHand: freshPlayerHand, phase: 'play', history: [initial], unknownCardIds };
  });
  // currentState subscription fires during game.update() → triggerSolve called automatically
}

export function selectCard(card: Card | null): void {
  game.update((s) => {
    const newState = { ...s, selectedCard: card };
    // Chaos rule: selecting a card sets forcedCardId on the current game state (player turn only).
    if (s.ruleset.chaos && s.history.length > 0) {
      const currentState = s.history.at(-1)!;
      if (currentState.currentTurn === Owner.Player) {
        const updatedState: GameState = { ...currentState, forcedCardId: card?.id ?? null };
        const history = [...s.history.slice(0, -1), updatedState];
        return { ...newState, history };
      }
    }
    return newState;
  });
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
    // Guard: keep the initial state intact — undoing past it is Reset's job.
    if (s.history.length <= 1) return s;
    const trimmed = s.history.slice(0, -1);
    // Clear forcedCardId on the restored state so Chaos solver gating resets properly.
    const last = trimmed.at(-1)!;
    const history = [...trimmed.slice(0, -1), { ...last, forcedCardId: null }];
    return { ...s, history };
  });
}

export function resetGame(): void {
  game.update((s) => ({
    ...s,
    phase: 'setup' as Phase,
    playerHand: s.setupPlayerHand.some((c) => c !== null) ? s.setupPlayerHand : s.playerHand,
    setupPlayerHand: [null, null, null, null, null],
    opponentHand: [null, null, null, null, null],
    history: [],
    selectedCard: null,
    unknownCardIds: new Set<number>(),
  }));
}

export function revealCard(
  placeholderId: number,
  stats: { top: number; right: number; bottom: number; left: number },
): void {
  game.update((g) => {
    // Replace placeholder card with real stats across every history entry.
    const history = g.history.map((state) => ({
      ...state,
      opponentHand: state.opponentHand.map((c) =>
        c.id === placeholderId ? { ...c, ...stats } : c,
      ),
    }));
    const unknownCardIds = new Set(g.unknownCardIds);
    unknownCardIds.delete(placeholderId);
    return { ...g, history, unknownCardIds };
  });
}

export function updateSolverMode(mode: SolverMode): void {
  solverMode.set(mode);
}

export function updateServerEndpoint(endpoint: string): void {
  serverEndpoint.set(endpoint);
}

// Resets mutable worker state. Called from test beforeEach to prevent cross-test contamination
// when tests trigger worker termination and respawn.
export function _resetWorkersForTesting(): void {
  solverWorker = createSolverWorker();
  pimcWorkerPool = createPimcPool();
}

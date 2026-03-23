// ABOUTME: Tests for the central game store — phase transitions, move placement, and undo.
// ABOUTME: Covers startGame, playCard, undoMove, selectCard, and hand/ruleset updates.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  game, currentState, rankedMoves, solverLoading, pimcProgress,
  startGame, playCard, undoMove, selectCard,
  updatePlayerCard, updateOpponentCard, updateRuleset, updateFirstTurn,
  updateSwap, handleSwap, updateThreeOpen, revealCard,
  updateSolverMode, updateServerEndpoint,
} from '../../src/app/store';
import { createCard, CardType, Owner, Outcome, resetCardIds, type RankedMove } from '../../src/engine';
import { lastWorkerInstance, workerInstances } from './setup';

function makePlayerHand() {
  return Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
}

function makeOpponentHand() {
  return Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
}

beforeEach(() => {
  resetCardIds();
  // Clear accumulated messages on all worker instances so each test starts with a clean slate.
  for (const w of workerInstances) {
    w.postedMessages.length = 0;
  }
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
    swap: false,
    threeOpen: false,
    playerHand: [null, null, null, null, null],
    opponentHand: [null, null, null, null, null],
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
    unknownCardIds: new Set(),
  });
});

describe('setup', () => {
  it('starts in setup phase with empty hands', () => {
    const state = get(game);
    expect(state.phase).toBe('setup');
    expect(state.playerHand).toEqual([null, null, null, null, null]);
    expect(state.opponentHand).toEqual([null, null, null, null, null]);
  });

  it('updates a player hand slot', () => {
    const card = createCard(5, 5, 5, 5);
    updatePlayerCard(0, card);
    expect(get(game).playerHand[0]).toEqual(card);
  });

  it('updates an opponent hand slot', () => {
    const card = createCard(3, 3, 3, 3);
    updateOpponentCard(2, card);
    expect(get(game).opponentHand[2]).toEqual(card);
  });

  it('updates ruleset', () => {
    updateRuleset({ plus: true, same: false, reverse: false, fallenAce: false, ascension: false, descension: false });
    expect(get(game).ruleset).toEqual({ plus: true, same: false, reverse: false, fallenAce: false, ascension: false, descension: false });
  });

  it('defaults firstTurn to Player', () => {
    expect(get(game).firstTurn).toBe(Owner.Player);
  });
});

describe('startGame', () => {
  it('transitions to play phase and creates initial game state', () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));

    startGame();

    const state = get(game);
    expect(state.phase).toBe('play');
    expect(state.history).toHaveLength(1);
    expect(get(currentState)).not.toBeNull();
  });

  it('respects firstTurn when creating initial state', () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    updateFirstTurn(Owner.Opponent);
    startGame();
    expect(get(currentState)!.currentTurn).toBe(Owner.Opponent);
  });

  it('throws if any hand slot is null', () => {
    makePlayerHand().slice(0, 4).forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));

    expect(() => startGame()).toThrow();
  });

  it('throws if both Ascension and Descension are active', () => {
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
    updateRuleset({ plus: false, same: false, reverse: false, fallenAce: false, ascension: true, descension: true });

    expect(() => startGame()).toThrow('Ascension and Descension cannot both be active');
  });
});

describe('selectCard', () => {
  it('sets selectedCard', () => {
    const card = createCard(5, 5, 5, 5);
    selectCard(card);
    expect(get(game).selectedCard).toEqual(card);
  });

  it('clears selectedCard when passed null', () => {
    const card = createCard(5, 5, 5, 5);
    selectCard(card);
    selectCard(null);
    expect(get(game).selectedCard).toBeNull();
  });
});

describe('playCard', () => {
  function setup() {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    // startGame re-creates cards with fresh IDs; use the store's hand for card references.
    const freshHand = get(game).playerHand;
    return { ph: freshHand, oh };
  }

  it('places card and pushes new state to history', () => {
    const { ph } = setup();
    selectCard(ph[0]!);
    playCard(4);

    const state = get(game);
    expect(state.history).toHaveLength(2);
    expect(get(currentState)!.board[4]).not.toBeNull();
  });

  it('clears selectedCard after placement', () => {
    const { ph } = setup();
    selectCard(ph[0]!);
    playCard(0);
    expect(get(game).selectedCard).toBeNull();
  });

  it('does nothing if no card is selected', () => {
    setup();
    playCard(0);
    expect(get(game).history).toHaveLength(1);
  });
});

describe('undoMove', () => {
  function setup() {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    // startGame re-creates cards with fresh IDs; use the store's hand for card references.
    const freshHand = get(game).playerHand;
    return { ph: freshHand };
  }

  it('pops the last state from history', () => {
    const { ph } = setup();
    selectCard(ph[0]!);
    playCard(0);
    expect(get(game).history).toHaveLength(2);

    undoMove();
    expect(get(game).history).toHaveLength(1);
  });

  it('does not return to setup when undoing from the initial state', () => {
    setup();
    undoMove();
    expect(get(game).phase).toBe('play');
    expect(get(game).history).toHaveLength(1);
  });

  it('is a no-op when history has only the initial state (no moves played)', () => {
    setup();
    // history has exactly 1 entry (initial state)
    expect(get(game).history).toHaveLength(1);
    undoMove();
    // Still in play phase with 1 history entry — not popped to setup
    expect(get(game).phase).toBe('play');
    expect(get(game).history).toHaveLength(1);
  });

  it('still works normally when history has 2+ entries', () => {
    const { ph } = setup();
    selectCard(ph[0]!);
    playCard(0);
    expect(get(game).history).toHaveLength(2);
    undoMove();
    expect(get(game).history).toHaveLength(1);
    expect(get(game).phase).toBe('play');
  });
});

describe('derived stores', () => {
  it('currentState is null in setup phase', () => {
    expect(get(currentState)).toBeNull();
  });

  it('rankedMoves is empty in setup phase', () => {
    expect(get(rankedMoves)).toEqual([]);
  });

  it('solverLoading is false initially', () => {
    expect(get(solverLoading)).toBe(false);
  });
});

describe('async solver', () => {
  it('startGame sets solverLoading to true while worker computes', () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    expect(get(solverLoading)).toBe(true);
  });

  it('rankedMoves is empty after startGame until worker responds', () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    expect(get(rankedMoves)).toEqual([]);
  });
});

describe('generation counter', () => {
  function currentGeneration(): number {
    return (lastWorkerInstance!.lastPostedMessage as { generation: number }).generation;
  }

  it('discards stale solver results', () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    const gen = currentGeneration();
    const move = { card: ph[0]!, position: 0, outcome: Outcome.Win, robustness: 0 };
    // simulate stale result (previous generation)
    lastWorkerInstance!.onmessage!({ data: { type: 'result', generation: gen - 1, moves: [move] } } as MessageEvent);
    expect(get(rankedMoves)).toEqual([]);
    // simulate current generation arriving
    lastWorkerInstance!.onmessage!({ data: { type: 'result', generation: gen, moves: [move] } } as MessageEvent);
    expect(get(rankedMoves)).toHaveLength(1);
  });

  it('only the latest result is kept when two results arrive', () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    const gen1 = currentGeneration();

    // Simulate playing a card by pushing a new fake state onto history.
    // This changes currentState, triggering another solve (gen2).
    const initial = get(currentState)!;
    game.update((s) => ({ ...s, history: [...s.history, { ...initial }] }));
    const gen2 = currentGeneration();

    const move1 = { card: ph[1]!, position: 0, outcome: Outcome.Win, robustness: 0 };
    const move2 = { card: ph[2]!, position: 1, outcome: Outcome.Draw, robustness: 0 };
    // stale result from gen1 arrives after gen2 was issued
    lastWorkerInstance!.onmessage!({ data: { type: 'result', generation: gen1, moves: [move1] } } as MessageEvent);
    expect(get(rankedMoves)).toEqual([]);
    // current generation result arrives
    lastWorkerInstance!.onmessage!({ data: { type: 'result', generation: gen2, moves: [move2] } } as MessageEvent);
    expect(get(rankedMoves)).toHaveLength(1);
    expect(get(rankedMoves)[0]!.outcome).toBe(Outcome.Draw);
  });
});

describe('swap rule', () => {
  it('updateSwap sets swap flag in store', () => {
    updateSwap(true);
    expect(get(game).swap).toBe(true);
    updateSwap(false);
    expect(get(game).swap).toBe(false);
  });

  it('handleSwap replaces given card with received card in playerHand', () => {
    const cards = makePlayerHand();
    cards.forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));

    const given = cards[2]!;
    const received = createCard(7, 7, 7, 7);
    handleSwap(given, received);

    const hand = get(game).playerHand;
    expect(hand).not.toContain(given);
    expect(hand).toContainEqual(expect.objectContaining({ top: 7, right: 7, bottom: 7, left: 7 }));
    expect(hand.filter((c) => c !== null)).toHaveLength(5);
  });

  it('handleSwap preserves hand order (replaced card stays at same index)', () => {
    const cards = makePlayerHand();
    cards.forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));

    const given = cards[1]!;
    const received = createCard(3, 3, 3, 3);
    handleSwap(given, received);

    expect(get(game).playerHand[1]).toMatchObject({ top: 3, right: 3, bottom: 3, left: 3 });
  });

  it('phase transitions to swap when swap is enabled and Start Game is pressed', () => {
    updateSwap(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    expect(get(game).phase).toBe('swap');
  });

  it('phase stays play when swap is disabled', () => {
    updateSwap(false);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    expect(get(game).phase).toBe('play');
  });

  it('handleSwap produces cards with IDs 0–9 even after extra createCard calls pollute the counter', () => {
    const cards = makePlayerHand();
    cards.forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));

    // Simulate _nextCardId pollution (as if CardInput called createCard while user was typing)
    createCard(1, 1, 1, 1);
    createCard(1, 1, 1, 1);
    createCard(1, 1, 1, 1);

    const given = cards[2]!;
    const received = createCard(7, 7, 7, 7);
    handleSwap(given, received);

    const state = get(game);
    const allCards = [...state.playerHand.filter((c) => c !== null), ...state.opponentHand.filter((c) => c !== null)];
    const ids = allCards.map((c) => c.id).sort((a, b) => a - b);
    expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('three open rule', () => {
  it('updateThreeOpen sets threeOpen flag', () => {
    updateThreeOpen(true);
    expect(get(game).threeOpen).toBe(true);
    updateThreeOpen(false);
    expect(get(game).threeOpen).toBe(false);
  });

  it('startGame allows null opponent slots when threeOpen is true', () => {
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    // leave some opponent slots null
    updateOpponentCard(0, createCard(5, 5, 5, 5));
    updateOpponentCard(1, createCard(5, 5, 5, 5));
    updateOpponentCard(2, createCard(5, 5, 5, 5));
    // slots 3 and 4 remain null
    expect(() => startGame()).not.toThrow();
  });

  it('startGame still rejects null player slots even when threeOpen is true', () => {
    updateThreeOpen(true);
    // only fill 4 player slots
    makePlayerHand().slice(0, 4).forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
    expect(() => startGame()).toThrow();
  });

  it('startGame still rejects null opponent slots when threeOpen is false', () => {
    updateThreeOpen(false);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    // leave some opponent slots null
    updateOpponentCard(0, createCard(5, 5, 5, 5));
    expect(() => startGame()).toThrow();
  });

  it('startGame fills null opponent slots with placeholder cards', () => {
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    updateOpponentCard(0, createCard(5, 5, 5, 5));
    updateOpponentCard(1, createCard(5, 5, 5, 5));
    updateOpponentCard(2, createCard(5, 5, 5, 5));
    // slots 3 and 4 are null
    startGame();
    const state = get(currentState)!;
    expect(state.opponentHand).toHaveLength(5);
    // All 5 slots are now filled
    expect(state.opponentHand.every((c) => c !== null)).toBe(true);
  });

  it('startGame tracks placeholder card IDs in unknownCardIds', () => {
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    updateOpponentCard(0, createCard(5, 5, 5, 5));
    updateOpponentCard(1, createCard(5, 5, 5, 5));
    updateOpponentCard(2, createCard(5, 5, 5, 5));
    // slots 3 and 4 are null
    startGame();
    const unknownIds = get(game).unknownCardIds;
    expect(unknownIds.size).toBe(2);
    // Placeholder IDs should correspond to opponent hand positions 3 and 4
    const state = get(currentState)!;
    const placeholders = state.opponentHand.filter((c) => unknownIds.has(c.id));
    expect(placeholders).toHaveLength(2);
  });

  it('placeholder IDs do not collide with known opponent card IDs even after extra createCard calls', () => {
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    // Simulate _nextCardId pollution BEFORE opponent cards are created
    // (as if CardInput.onTypeChange called createCard for earlier fields)
    createCard(1, 1, 1, 1);
    createCard(1, 1, 1, 1);
    createCard(1, 1, 1, 1);
    // Known opponent cards now get higher IDs (8, 9, 10 if player hand was 0-4)
    updateOpponentCard(0, createCard(5, 5, 5, 5));
    updateOpponentCard(1, createCard(5, 5, 5, 5));
    updateOpponentCard(2, createCard(5, 5, 5, 5));
    // slots 3 and 4 are null
    startGame();
    const unknownIds = get(game).unknownCardIds;
    const state = get(currentState)!;
    // Known opponent cards should NOT be in unknownCardIds
    const knownOpponents = state.opponentHand.filter((c) => !unknownIds.has(c.id));
    expect(knownOpponents).toHaveLength(3);
    expect(unknownIds.size).toBe(2);
  });
});

describe('revealCard', () => {
  function setupThreeOpen() {
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    updateOpponentCard(0, createCard(5, 5, 5, 5));
    updateOpponentCard(1, createCard(5, 5, 5, 5));
    updateOpponentCard(2, createCard(5, 5, 5, 5));
    // slots 3 and 4 remain null → placeholder IDs 8 and 9
    startGame();
  }

  it('replaces placeholder stats in current state with real card stats', () => {
    setupThreeOpen();
    const state = get(currentState)!;
    const unknownIds = get(game).unknownCardIds;
    const placeholderId = [...unknownIds][0]!;
    revealCard(placeholderId, { top: 7, right: 6, bottom: 5, left: 4 });
    const updated = get(currentState)!;
    const revealed = updated.opponentHand.find((c) => c.id === placeholderId)!;
    expect(revealed.top).toBe(7);
    expect(revealed.right).toBe(6);
  });

  it('removes revealed card ID from unknownCardIds', () => {
    setupThreeOpen();
    const unknownIds = get(game).unknownCardIds;
    const placeholderId = [...unknownIds][0]!;
    revealCard(placeholderId, { top: 7, right: 6, bottom: 5, left: 4 });
    expect(get(game).unknownCardIds.has(placeholderId)).toBe(false);
  });

  it('replaces placeholder in all history entries', () => {
    setupThreeOpen();
    const unknownIds = get(game).unknownCardIds;
    const placeholderId = [...unknownIds][0]!;
    // Push a second fake history entry to simulate a move being played
    const initial = get(currentState)!;
    game.update((g) => ({ ...g, history: [...g.history, { ...initial }] }));
    revealCard(placeholderId, { top: 9, right: 8, bottom: 7, left: 6 });
    const { history } = get(game);
    expect(history).toHaveLength(2);
    for (const state of history) {
      const card = state.opponentHand.find((c) => c.id === placeholderId)!;
      expect(card.top).toBe(9);
    }
  });
});

describe('PIMC parallel dispatch', () => {
  function setupThreeOpen() {
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    updateOpponentCard(0, createCard(5, 5, 5, 5));
    updateOpponentCard(1, createCard(5, 5, 5, 5));
    updateOpponentCard(2, createCard(5, 5, 5, 5));
    // slots 3 and 4 remain null
    startGame();
  }

  it('dispatches 50 simulate messages total across pool workers', () => {
    setupThreeOpen();
    const poolWorkers = workerInstances.slice(1); // indices 1+ are pool workers
    const totalSims = poolWorkers.reduce(
      (sum, w) => sum + w.postedMessages.filter((m: any) => (m as any).type === 'simulate').length,
      0,
    );
    expect(totalSims).toBe(50);
  });

  it('each simulate message carries the current generation', () => {
    setupThreeOpen();
    const poolWorkers = workerInstances.slice(1);
    const simMsgs = poolWorkers.flatMap((w) =>
      w.postedMessages.filter((m: any) => (m as any).type === 'simulate'),
    ) as Array<{ generation: number }>;
    const gen = simMsgs[0]!.generation;
    expect(simMsgs.every((m) => m.generation === gen)).toBe(true);
  });

  it('updates pimcProgress as sim-results arrive', () => {
    setupThreeOpen();
    const poolWorker = workerInstances[1]!;
    const simMsg = poolWorker.postedMessages.find((m: any) => (m as any).type === 'simulate') as any;

    const card = createCard(5, 5, 5, 5);
    poolWorker.onmessage!({
      data: {
        type: 'sim-result',
        move: { card, position: 0, outcome: Outcome.Win, robustness: 1 },
        generation: simMsg.generation,
        simIndex: 0,
      },
    } as MessageEvent);

    const progress = get(pimcProgress);
    expect(progress).not.toBeNull();
    expect(progress!.current).toBe(1);
    expect(progress!.total).toBe(50);
  });

  it('sets rankedMoves and clears loading when all 50 results arrive', () => {
    setupThreeOpen();
    const poolWorkers = workerInstances.slice(1);
    const simMsgs = poolWorkers.flatMap((w) =>
      w.postedMessages.filter((m: any) => (m as any).type === 'simulate'),
    ) as Array<{ generation: number; simIndex: number }>;
    const gen = simMsgs[0]!.generation;

    const card = createCard(5, 5, 5, 5);
    poolWorkers.forEach((w) => {
      const workerSims = w.postedMessages.filter((m: any) => (m as any).type === 'simulate') as any[];
      workerSims.forEach((msg) => {
        w.onmessage!({
          data: {
            type: 'sim-result',
            move: { card, position: msg.simIndex % 9, outcome: Outcome.Win, robustness: 1 },
            generation: gen,
            simIndex: msg.simIndex,
          },
        } as MessageEvent);
      });
    });

    expect(get(solverLoading)).toBe(false);
    expect(get(pimcProgress)).toBeNull();
    expect(get(rankedMoves).length).toBeGreaterThan(0);
    expect(get(rankedMoves)[0]!.confidence).toBeGreaterThan(0);
  });

  it('discards stale sim-results from previous generation', () => {
    setupThreeOpen();
    const poolWorker = workerInstances[1]!;
    const simMsg = poolWorker.postedMessages.find((m: any) => (m as any).type === 'simulate') as any;
    const staleGen = simMsg.generation - 1;

    const card = createCard(5, 5, 5, 5);
    poolWorker.onmessage!({
      data: {
        type: 'sim-result',
        move: { card, position: 0, outcome: Outcome.Win, robustness: 1 },
        generation: staleGen,
        simIndex: 0,
      },
    } as MessageEvent);

    // pimcProgress should still show 0 completed (stale result discarded)
    expect(get(pimcProgress)?.current).toBe(0);
  });

  it('mid-flight generation bump discards remaining in-flight results without corrupting new batch', () => {
    setupThreeOpen();
    const poolWorker = workerInstances[1]!;
    const simMsgs = poolWorker.postedMessages.filter((m: any) => (m as any).type === 'simulate') as any[];
    const gen1 = simMsgs[0]!.generation;
    const card = createCard(5, 5, 5, 5);

    // Deliver one result for gen1
    poolWorker.onmessage!({ data: { type: 'sim-result', move: { card, position: 0, outcome: Outcome.Win, robustness: 1 }, generation: gen1, simIndex: 0 } } as MessageEvent);
    expect(get(pimcProgress)!.current).toBe(1);

    // Bump generation by pushing a new state to history (triggers triggerSolve via currentState)
    const initial = get(currentState)!;
    game.update((s) => ({ ...s, history: [...s.history, { ...initial }] }));

    // Clear postedMessages before checking to get only the new batch's messages
    const newSimMsgs = poolWorker.postedMessages.filter((m: any) => (m as any).type === 'simulate' && (m as any).generation > gen1) as any[];
    expect(newSimMsgs.length).toBeGreaterThan(0);
    const gen2 = newSimMsgs[0]!.generation;
    expect(gen2).toBeGreaterThan(gen1);

    // Late gen1 result arrives — must be discarded, gen2 pimcProgress must show 0 completed
    poolWorker.onmessage!({ data: { type: 'sim-result', move: { card, position: 0, outcome: Outcome.Win, robustness: 1 }, generation: gen1, simIndex: 1 } } as MessageEvent);
    expect(get(pimcProgress)!.current).toBe(0); // gen2 has 0 completed, gen1 result was discarded
  });
});

describe('server solver mode', () => {
  const mockMoves: RankedMove[] = [
    { card: { id: 0, top: 5, right: 5, bottom: 5, left: 5, type: CardType.None }, position: 0, outcome: Outcome.Win, robustness: 0.5 },
  ];

  beforeEach(() => {
    updateSolverMode('wasm');
    updateServerEndpoint('');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    updateSolverMode('wasm');
    updateServerEndpoint('');
  });

  it('POSTs to /api/solve when solverMode is server', () => {
    const endpoint = 'http://localhost:8080';
    updateServerEndpoint(endpoint);
    updateSolverMode('server');
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ moves: mockMoves }) } as Response);

    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
    startGame();

    // fetch is invoked synchronously (before the first await inside triggerServerSolve)
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      `${endpoint}/api/solve`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sets rankedMoves from the server response', async () => {
    const endpoint = 'http://localhost:8080';
    updateServerEndpoint(endpoint);
    updateSolverMode('server');
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ moves: mockMoves }) } as Response);

    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
    startGame();

    // Flush microtasks: fetch resolves → json() resolves → rankedMoves.set runs
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(get(rankedMoves)).toHaveLength(1);
    expect(get(solverLoading)).toBe(false);
  });

  it('falls back to WASM solve when endpoint is empty', () => {
    updateSolverMode('server');
    updateServerEndpoint('');
    const mockFetch = vi.mocked(global.fetch);

    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
    startGame();

    // No fetch call — falls back to WASM worker path
    expect(mockFetch).not.toHaveBeenCalled();
    expect(get(solverLoading)).toBe(true); // WASM loading still in progress
  });

  it('sends unknownCardIds and cardPool when Three Open', async () => {
    const endpoint = 'http://localhost:8080';
    updateServerEndpoint(endpoint);
    updateSolverMode('server');
    updateThreeOpen(true);
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ moves: mockMoves }) } as Response);

    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    updateOpponentCard(0, createCard(5, 5, 5, 5));
    updateOpponentCard(1, createCard(5, 5, 5, 5));
    updateOpponentCard(2, createCard(5, 5, 5, 5));
    // slots 3 and 4 remain null (unknown)
    startGame();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.unknownCardIds).toHaveLength(2);
    expect(body.cardPool).toBeDefined();
    expect(Array.isArray(body.cardPool)).toBe(true);
  });
});


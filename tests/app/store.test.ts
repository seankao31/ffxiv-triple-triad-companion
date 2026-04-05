// ABOUTME: Tests for the central game store — phase transitions, move placement, and undo.
// ABOUTME: Covers startGame, playCard, undoMove, selectCard, handleSwap, and hand/ruleset updates.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  game, currentState, rankedMoves, solverLoading, pimcProgress,
  startGame, playCard, undoMove, selectCard, resetGame,
  updatePlayerCard, updateOpponentCard, updateRuleset, updateFirstTurn,
  updateSwap, handleSwap, updateThreeOpen, revealCard,
  updateSolverMode, updateServerEndpoint,
  _resetWorkersForTesting,
} from '../../src/app/store';
import { createCard, CardType, Owner, resetCardIds, type Card, type RankedMove } from '../../src/engine';
import { lastWorkerInstance, workerInstances, resetWorkers } from './setup';

function makePlayerHand() {
  return [
    createCard(10, 8, 6, 4),
    createCard(9, 7, 5, 3),
    createCard(8, 6, 10, 2),
    createCard(7, 10, 4, 8),
    createCard(6, 5, 9, 7),
  ];
}

function makeOpponentHand() {
  return [
    createCard(1, 3, 5, 2),
    createCard(2, 4, 1, 6),
    createCard(3, 1, 2, 4),
    createCard(4, 2, 6, 1),
    createCard(5, 6, 3, 3),
  ];
}

// 3 unique known opponent cards for Three Open tests (slots 3-4 stay null).
function makeThreeOpenOpponentCards(): void {
  updateOpponentCard(0, createCard(5, 5, 5, 5));
  updateOpponentCard(1, createCard(4, 4, 4, 4));
  updateOpponentCard(2, createCard(3, 3, 3, 3));
}

beforeEach(() => {
  resetCardIds();
  resetWorkers();
  _resetWorkersForTesting();
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

  it('throws if player hand contains duplicate cards', () => {
    const dup = createCard(5, 3, 7, 2);
    // Two cards with the same stats in the player hand
    updatePlayerCard(0, dup);
    updatePlayerCard(1, createCard(5, 3, 7, 2)); // same stats, different object
    updatePlayerCard(2, createCard(4, 6, 2, 8));
    updatePlayerCard(3, createCard(3, 5, 5, 7));
    updatePlayerCard(4, createCard(6, 4, 3, 9));
    makeOpponentHand().forEach((c: Card, i: number) => updateOpponentCard(i, c));

    expect(() => startGame()).toThrow('Duplicate cards');
  });

  it('throws if opponent hand contains duplicate cards', () => {
    makePlayerHand().forEach((c: Card, i: number) => updatePlayerCard(i, c));
    updateOpponentCard(0, createCard(4, 5, 6, 3));
    updateOpponentCard(1, createCard(4, 5, 6, 3)); // duplicate
    updateOpponentCard(2, createCard(2, 8, 1, 6));
    updateOpponentCard(3, createCard(5, 5, 5, 5));
    updateOpponentCard(4, createCard(3, 6, 4, 7));

    expect(() => startGame()).toThrow('Duplicate cards');
  });

  it('allows same card stats across player and opponent hands', () => {
    // Cross-hand sharing is legal — only within-hand duplicates are illegal
    updatePlayerCard(0, createCard(5, 3, 7, 2));
    updatePlayerCard(1, createCard(4, 6, 2, 8));
    updatePlayerCard(2, createCard(3, 5, 5, 7));
    updatePlayerCard(3, createCard(6, 4, 3, 9));
    updatePlayerCard(4, createCard(7, 2, 8, 1));
    updateOpponentCard(0, createCard(5, 3, 7, 2)); // same as player card 0
    updateOpponentCard(1, createCard(8, 3, 5, 4));
    updateOpponentCard(2, createCard(2, 8, 1, 6));
    updateOpponentCard(3, createCard(9, 5, 5, 5));
    updateOpponentCard(4, createCard(3, 6, 4, 7));

    expect(() => startGame()).not.toThrow();
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

describe('resetGame', () => {
  function setup() {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    updateRuleset({ plus: true, same: false, reverse: false, fallenAce: false, ascension: false, descension: false });
    updateFirstTurn(Owner.Opponent);
    startGame();
  }

  it('returns to setup phase', () => {
    setup();
    resetGame();
    expect(get(game).phase).toBe('setup');
  });

  it('preserves ruleset', () => {
    setup();
    resetGame();
    expect(get(game).ruleset.plus).toBe(true);
  });

  it('preserves firstTurn', () => {
    setup();
    resetGame();
    expect(get(game).firstTurn).toBe(Owner.Opponent);
  });

  it('preserves playerHand (with card objects from the game)', () => {
    setup();
    const handBefore = get(game).playerHand;
    resetGame();
    const handAfter = get(game).playerHand;
    // Cards are preserved (same stats), though IDs may differ after next startGame
    expect(handAfter).toHaveLength(5);
    expect(handAfter.every((c) => c !== null)).toBe(true);
    expect(handAfter[0]!.top).toBe(handBefore[0]!.top);
  });

  it('clears opponentHand to all nulls', () => {
    setup();
    resetGame();
    expect(get(game).opponentHand).toEqual([null, null, null, null, null]);
  });

  it('clears history', () => {
    setup();
    resetGame();
    expect(get(game).history).toEqual([]);
  });

  it('clears selectedCard', () => {
    setup();
    selectCard(get(game).playerHand[0]!);
    resetGame();
    expect(get(game).selectedCard).toBeNull();
  });

  it('clears unknownCardIds', () => {
    setup();
    game.update((g) => ({ ...g, unknownCardIds: new Set([99]) }));
    resetGame();
    expect(get(game).unknownCardIds.size).toBe(0);
  });

  it('preserves swap setting', () => {
    updateSwap(true);
    setup();
    resetGame();
    expect(get(game).swap).toBe(true);
  });

  it('preserves threeOpen setting', () => {
    updateThreeOpen(true);
    // Need to set up with threeOpen
    const ph = makePlayerHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    makeThreeOpenOpponentCards();
    startGame();
    resetGame();
    expect(get(game).threeOpen).toBe(true);
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
    const move = { card: ph[0]!, position: 0, score: 7, robustness: 0 };
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
    const oldWorker = workerInstances[0]!;

    // Simulate playing a card by pushing a new fake state onto history.
    // This changes currentState, triggering another solve (gen2).
    // Because solverLoading is true, the old worker is terminated and a new one is spawned.
    const initial = get(currentState)!;
    game.update((s) => ({ ...s, history: [...s.history, { ...initial }] }));
    const newWorker = workerInstances.find(
      (w) => w !== oldWorker && !w.terminated && w.postedMessages.some((m: any) => m.type === 'solve'),
    )!;
    const gen2 = (newWorker.lastPostedMessage as { generation: number }).generation;

    const move1 = { card: ph[1]!, position: 0, score: 7, robustness: 0 };
    const move2 = { card: ph[2]!, position: 1, score: 5, robustness: 0 };
    // stale result from gen1 on the old worker's handler — discarded by generation check
    oldWorker.onmessage!({ data: { type: 'result', generation: gen1, moves: [move1] } } as MessageEvent);
    expect(get(rankedMoves)).toEqual([]);
    // current generation result arrives on the new worker
    newWorker.onmessage!({ data: { type: 'result', generation: gen2, moves: [move2] } } as MessageEvent);
    expect(get(rankedMoves)).toHaveLength(1);
    expect(get(rankedMoves)[0]!.score).toBe(5);
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
    const playerCards = makePlayerHand();
    playerCards.forEach((c, i) => updatePlayerCard(i, c));
    const oppCards = [createCard(2, 3, 4, 5), createCard(3, 4, 5, 6), createCard(4, 5, 6, 7), createCard(5, 6, 7, 8), createCard(6, 7, 8, 9)];
    oppCards.forEach((c, i) => updateOpponentCard(i, c));

    const given = playerCards[2]!;
    const received = oppCards[3]!;
    handleSwap(given, received);

    const hand = get(game).playerHand;
    expect(hand).toContainEqual(expect.objectContaining({ top: 5, right: 6, bottom: 7, left: 8 }));
    expect(hand.filter((c) => c !== null)).toHaveLength(5);
  });

  it('handleSwap replaces received card with given card in opponentHand', () => {
    const playerCards = makePlayerHand();
    playerCards.forEach((c, i) => updatePlayerCard(i, c));
    const oppCards = [createCard(2, 3, 4, 5), createCard(3, 4, 5, 6), createCard(4, 5, 6, 7), createCard(5, 6, 7, 8), createCard(6, 7, 8, 9)];
    oppCards.forEach((c, i) => updateOpponentCard(i, c));

    const given = playerCards[2]!;
    const received = oppCards[3]!;
    handleSwap(given, received);

    const oppHand = get(game).opponentHand;
    // Opponent should now have the given card's stats (playerCards[2]) instead of the received card's
    expect(oppHand).toContainEqual(expect.objectContaining({ top: 8, right: 6, bottom: 10, left: 2 }));
    // The received card's stats should no longer be in the opponent hand
    expect(oppHand).not.toContainEqual(expect.objectContaining({ top: 5, right: 6, bottom: 7, left: 8 }));
    expect(oppHand.filter((c) => c !== null)).toHaveLength(5);
  });

  it('handleSwap preserves hand order on both sides', () => {
    const playerCards = makePlayerHand();
    playerCards.forEach((c, i) => updatePlayerCard(i, c));
    const oppCards = [createCard(2, 3, 4, 5), createCard(3, 4, 5, 6), createCard(4, 5, 6, 7), createCard(5, 6, 7, 8), createCard(6, 7, 8, 9)];
    oppCards.forEach((c, i) => updateOpponentCard(i, c));

    const given = playerCards[1]!;
    const received = oppCards[3]!;
    handleSwap(given, received);

    // Player hand: index 1 should have received card's stats
    expect(get(game).playerHand[1]).toMatchObject({ top: 5, right: 6, bottom: 7, left: 8 });
    // Opponent hand: index 3 should have given card's stats (playerCards[1])
    expect(get(game).opponentHand[3]).toMatchObject({ top: 9, right: 7, bottom: 5, left: 3 });
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
    const playerCards = makePlayerHand();
    playerCards.forEach((c, i) => updatePlayerCard(i, c));
    const oppCards = makeOpponentHand();
    oppCards.forEach((c, i) => updateOpponentCard(i, c));

    // Simulate _nextCardId pollution (as if UI rendered extra createCard calls)
    createCard(1, 1, 1, 1);
    createCard(1, 1, 1, 1);
    createCard(1, 1, 1, 1);

    const given = playerCards[2]!;
    const received = oppCards[3]!;
    handleSwap(given, received);

    const state = get(game);
    const allCards = [...state.playerHand.filter((c) => c !== null), ...state.opponentHand.filter((c) => c !== null)];
    const ids = allCards.map((c) => c.id).sort((a, b) => a - b);
    expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('handleSwap works when opponent hand has null slots (Three Open + Swap)', () => {
    updateSwap(true);
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeThreeOpenOpponentCards(); // fills slots 0-2, leaves 3-4 null
    startGame(); // enters swap phase
    expect(get(game).phase).toBe('swap');

    const s = get(game);
    const given = s.playerHand[0]!;
    const received = s.opponentHand[0]!; // one of the 3 known cards
    expect(() => handleSwap(given, received)).not.toThrow();
    expect(get(game).phase).toBe('play');
  });

  it('handleSwap populates unknownCardIds for null opponent slots (Three Open + Swap)', () => {
    updateSwap(true);
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeThreeOpenOpponentCards(); // fills slots 0-2, leaves 3-4 null
    startGame();

    const s = get(game);
    const given = s.playerHand[0]!;
    const received = s.opponentHand[0]!;
    handleSwap(given, received);

    const after = get(game);
    // 2 null slots → 2 unknown card IDs
    expect(after.unknownCardIds.size).toBe(2);
    // All 5 opponent hand entries should be non-null Card objects
    expect(after.opponentHand.every((c) => c !== null)).toBe(true);
    // The placeholder IDs should match specific opponent hand entries
    for (const id of after.unknownCardIds) {
      expect(after.opponentHand.some((c) => c!.id === id)).toBe(true);
    }
  });

  it('handleSwap produces cards with IDs 0–9 when Three Open has null slots', () => {
    updateSwap(true);
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeThreeOpenOpponentCards(); // fills slots 0-2, leaves 3-4 null
    startGame();

    // Simulate ID counter pollution
    createCard(1, 1, 1, 1);
    createCard(1, 1, 1, 1);

    const s = get(game);
    const given = s.playerHand[2]!;
    const received = s.opponentHand[1]!;
    handleSwap(given, received);

    const after = get(game);
    const allCards = [
      ...after.playerHand.filter((c): c is Card => c !== null),
      ...after.opponentHand.filter((c): c is Card => c !== null),
    ];
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
    makeThreeOpenOpponentCards();
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
    makeThreeOpenOpponentCards();
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
    makeThreeOpenOpponentCards();
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
    makeThreeOpenOpponentCards();
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
    makeThreeOpenOpponentCards();
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
    makeThreeOpenOpponentCards();
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
        move: { card, position: 0, score: 7, robustness: 1 },
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
            move: { card, position: msg.simIndex % 9, score: 7, robustness: 1 },
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
    expect(get(rankedMoves)[0]!.confidence).toBeLessThanOrEqual(1);
  });

  it('sorts PIMC results by confidence descending', () => {
    setupThreeOpen();
    const poolWorkers = workerInstances.slice(1);
    const simMsgs = poolWorkers.flatMap((w) =>
      w.postedMessages.filter((m: any) => (m as any).type === 'simulate'),
    ) as Array<{ generation: number; simIndex: number }>;
    const gen = simMsgs[0]!.generation;

    const card = createCard(5, 5, 5, 5);
    // Send 50 results: first 30 vote for position 0, next 20 for position 1.
    let sent = 0;
    poolWorkers.forEach((w) => {
      const workerSims = w.postedMessages.filter((m: any) => (m as any).type === 'simulate') as any[];
      workerSims.forEach((msg) => {
        const position = sent < 30 ? 0 : 1;
        w.onmessage!({
          data: {
            type: 'sim-result',
            move: { card, position, score: 7, robustness: 1 },
            generation: gen,
            simIndex: msg.simIndex,
          },
        } as MessageEvent);
        sent++;
      });
    });

    const moves = get(rankedMoves);
    expect(moves.length).toBe(2);
    expect(moves[0]!.confidence).toBeGreaterThan(moves[1]!.confidence!);
    expect(moves[0]!.position).toBe(0);
    expect(moves[1]!.position).toBe(1);
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
        move: { card, position: 0, score: 7, robustness: 1 },
        generation: staleGen,
        simIndex: 0,
      },
    } as MessageEvent);

    // pimcProgress should still show 0 completed (stale result discarded)
    expect(get(pimcProgress)?.current).toBe(0);
  });

  it('mid-flight generation bump discards remaining in-flight results without corrupting new batch', () => {
    setupThreeOpen();
    const oldPool = workerInstances.filter(
      (w) => w.postedMessages.some((m: any) => m.type === 'simulate'),
    );
    const gen1SimMsg = oldPool[0]!.postedMessages.find((m: any) => (m as any).type === 'simulate') as any;
    const gen1 = gen1SimMsg.generation;
    const card = createCard(5, 5, 5, 5);

    // Deliver one result for gen1
    oldPool[0]!.onmessage!({ data: { type: 'sim-result', move: { card, position: 0, score: 7, robustness: 1 }, generation: gen1, simIndex: 0 } } as MessageEvent);
    expect(get(pimcProgress)!.current).toBe(1);

    // Bump generation by pushing a new state to history (triggers triggerSolve via currentState).
    // This terminates the old pool and creates new pool workers.
    const initial = get(currentState)!;
    game.update((s) => ({ ...s, history: [...s.history, { ...initial }] }));

    // New pool workers should have gen2 simulate messages.
    const newPoolWorkers = workerInstances.filter(
      (w) => !w.terminated && !oldPool.includes(w) && w.postedMessages.some((m: any) => m.type === 'simulate'),
    );
    expect(newPoolWorkers.length).toBeGreaterThan(0);
    const gen2SimMsg = newPoolWorkers[0]!.postedMessages.find((m: any) => (m as any).type === 'simulate') as any;
    const gen2 = gen2SimMsg.generation;
    expect(gen2).toBeGreaterThan(gen1);

    // Late gen1 result arrives on a new worker — must be discarded, gen2 pimcProgress must show 0 completed
    newPoolWorkers[0]!.onmessage!({ data: { type: 'sim-result', move: { card, position: 0, score: 7, robustness: 1 }, generation: gen1, simIndex: 1 } } as MessageEvent);
    expect(get(pimcProgress)!.current).toBe(0); // gen2 has 0 completed, gen1 result was discarded
  });

  it('clears solverLoading when a pool worker crashes via onerror', () => {
    setupThreeOpen();
    expect(get(solverLoading)).toBe(true);
    const poolWorker = workerInstances[1]!;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    poolWorker.onerror!({ message: 'out of memory' } as ErrorEvent);

    expect(get(solverLoading)).toBe(false);
    expect(get(pimcProgress)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('PIMC worker error:', 'out of memory', expect.anything());
    errorSpy.mockRestore();
  });
});

describe('server solver mode', () => {
  const mockMoves: RankedMove[] = [
    { card: { id: 0, top: 5, right: 5, bottom: 5, left: 5, type: CardType.None }, position: 0, score: 7, robustness: 0.5 },
  ];

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    updateSolverMode('wasm');
    updateServerEndpoint('');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    // Restore only fetch — vi.unstubAllGlobals() would also remove the Worker stub from setup.ts.
    vi.stubGlobal('fetch', originalFetch);
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
    makeThreeOpenOpponentCards();
    // slots 3 and 4 remain null (unknown)
    startGame();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.unknownCardIds).toHaveLength(2);
    expect(body.cardPool).toBeDefined();
    expect(Array.isArray(body.cardPool)).toBe(true);
  });

  it('aborts in-flight fetch when a new solve triggers', async () => {
    const endpoint = 'http://localhost:8080';
    updateServerEndpoint(endpoint);
    updateSolverMode('server');
    const mockFetch = vi.mocked(global.fetch);

    // First fetch: never resolves (simulates long-running solve).
    let firstSignal: AbortSignal | undefined;
    mockFetch.mockImplementationOnce((_url, init) => {
      firstSignal = (init as RequestInit).signal as AbortSignal;
      return new Promise(() => {}); // never resolves
    });
    // Second fetch: resolves immediately.
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ moves: [] }) } as Response);

    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
    startGame(); // triggers first fetch

    expect(firstSignal).toBeDefined();
    expect(firstSignal!.aborted).toBe(false);

    // Trigger a new solve by pushing a fake history entry.
    const initial = get(currentState)!;
    game.update((s) => ({ ...s, history: [...s.history, { ...initial }] }));

    expect(firstSignal!.aborted).toBe(true);
  });
});

describe('solver interruption', () => {
  function setupAndStartGame() {
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));
    startGame();
    return get(game).playerHand;
  }

  it('terminates solver worker when a new solve triggers during in-flight All Open solve', () => {
    const freshHand = setupAndStartGame();
    // solverLoading is true — All Open solve is in-flight.
    expect(get(solverLoading)).toBe(true);
    const oldSolver = workerInstances[0]!;

    // Play a card → triggers new solve while old solve is in-flight.
    selectCard(freshHand[0]!);
    playCard(4);

    expect(oldSolver.terminated).toBe(true);
  });

  it('creates a new solver worker that receives the solve message after termination', () => {
    const freshHand = setupAndStartGame();
    const oldSolver = workerInstances[0]!;

    selectCard(freshHand[0]!);
    playCard(4);

    // New solver worker should exist and have received the solve message.
    const newSolver = workerInstances.find(
      (w) => w !== oldSolver && !w.terminated && w.postedMessages.some((m: any) => m.type === 'solve'),
    );
    expect(newSolver).toBeDefined();
    expect(newSolver!.postedMessages.some((m: any) => m.type === 'solve')).toBe(true);
  });

  it('terminates PIMC pool workers when a new solve triggers during in-flight PIMC', () => {
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeThreeOpenOpponentCards();
    startGame();
    // PIMC in-flight: solverLoading = true, pool workers have sim messages.
    expect(get(solverLoading)).toBe(true);
    const oldPool = workerInstances.filter(
      (w) => w.postedMessages.some((m: any) => m.type === 'simulate'),
    );
    expect(oldPool.length).toBeGreaterThan(0);

    // Trigger a new solve by pushing a fake history entry.
    const initial = get(currentState)!;
    game.update((s) => ({ ...s, history: [...s.history, { ...initial }] }));

    for (const w of oldPool) {
      expect(w.terminated).toBe(true);
    }
  });

  it('creates new PIMC pool workers that receive sim messages after termination', () => {
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    makeThreeOpenOpponentCards();
    startGame();
    const oldPool = workerInstances.filter(
      (w) => w.postedMessages.some((m: any) => m.type === 'simulate'),
    );

    const initial = get(currentState)!;
    game.update((s) => ({ ...s, history: [...s.history, { ...initial }] }));

    // New pool workers should exist (non-terminated, have sim messages from gen2).
    const gen2Messages = workerInstances.filter(
      (w) => !w.terminated && !oldPool.includes(w) && w.postedMessages.some((m: any) => m.type === 'simulate'),
    );
    expect(gen2Messages.length).toBeGreaterThan(0);
    const totalNewSims = gen2Messages.reduce(
      (sum, w) => sum + w.postedMessages.filter((m: any) => m.type === 'simulate').length,
      0,
    );
    expect(totalNewSims).toBe(50);
  });

  it('does not terminate solver worker when no solve is in-flight', () => {
    const freshHand = setupAndStartGame();
    const solver = workerInstances[0]!;

    // Simulate the solver finishing: deliver a result for the current generation.
    const gen = (solver.lastPostedMessage as any).generation;
    solver.onmessage!({ data: { type: 'result', generation: gen, moves: [] } } as MessageEvent);
    expect(get(solverLoading)).toBe(false);

    // Now play a card — should NOT terminate, should reuse the same worker.
    selectCard(freshHand[0]!);
    playCard(4);
    expect(solver.terminated).toBe(false);
    expect(solver.postedMessages.filter((m: any) => m.type === 'solve')).toHaveLength(2);
  });

  it('does not trigger a redundant solve when selectCard fires without a state change', () => {
    const freshHand = setupAndStartGame();
    const solver = workerInstances[0]!;
    const solveCount = solver.postedMessages.filter((m: any) => m.type === 'solve').length;
    expect(solveCount).toBe(1);

    // selectCard changes game but NOT history — should not trigger another solve.
    selectCard(freshHand[0]!);

    const newSolveCount = solver.postedMessages.filter((m: any) => m.type === 'solve').length;
    expect(newSolveCount).toBe(1);
  });
});


// ABOUTME: Tests for the central game store — phase transitions, move placement, and undo.
// ABOUTME: Covers startGame, playCard, undoMove, selectCard, and hand/ruleset updates.
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  game, currentState, rankedMoves, solverLoading, pimcProgress,
  startGame, playCard, undoMove, selectCard,
  updatePlayerCard, updateOpponentCard, updateRuleset, updateFirstTurn,
  updateSwap, handleSwap, updateThreeOpen, revealCard,
} from '../../src/app/store';
import { createCard, CardType, Owner, Outcome } from '../../src/engine';
import { lastWorkerInstance } from './setup';

function makePlayerHand() {
  return Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
}

function makeOpponentHand() {
  return Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
}

beforeEach(() => {
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
    return { ph, oh };
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
    return { ph };
  }

  it('pops the last state from history', () => {
    const { ph } = setup();
    selectCard(ph[0]!);
    playCard(0);
    expect(get(game).history).toHaveLength(2);

    undoMove();
    expect(get(game).history).toHaveLength(1);
  });

  it('returns to setup phase when history becomes empty', () => {
    setup();
    undoMove();
    expect(get(game).phase).toBe('setup');
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
    expect(hand).toContain(received);
    expect(hand.filter((c) => c !== null)).toHaveLength(5);
  });

  it('handleSwap preserves hand order (replaced card stays at same index)', () => {
    const cards = makePlayerHand();
    cards.forEach((c, i) => updatePlayerCard(i, c));
    makeOpponentHand().forEach((c, i) => updateOpponentCard(i, c));

    const given = cards[1]!;
    const received = createCard(3, 3, 3, 3);
    handleSwap(given, received);

    expect(get(game).playerHand[1]).toBe(received);
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
    // (playerHandSize=5, so opponentSlot3=ID 8, opponentSlot4=ID 9)
    const state = get(currentState)!;
    const placeholders = state.opponentHand.filter((c) => unknownIds.has(c.id));
    expect(placeholders).toHaveLength(2);
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

describe('PIMC store integration', () => {
  function setupThreeOpen() {
    updateThreeOpen(true);
    makePlayerHand().forEach((c, i) => updatePlayerCard(i, c));
    updateOpponentCard(0, createCard(5, 5, 5, 5));
    updateOpponentCard(1, createCard(5, 5, 5, 5));
    updateOpponentCard(2, createCard(5, 5, 5, 5));
    // slots 3 and 4 remain null
    startGame();
  }

  it('pimcProgress is null initially', () => {
    expect(get(pimcProgress)).toBeNull();
  });

  it('triggerSolve sends pimc message when unknownCardIds is non-empty', () => {
    setupThreeOpen();
    const msg = lastWorkerInstance!.lastPostedMessage as { type: string };
    expect(msg.type).toBe('pimc');
  });

  it('pimc message includes unknownCardIds and generation', () => {
    setupThreeOpen();
    const msg = lastWorkerInstance!.lastPostedMessage as {
      type: string; unknownCardIds: number[]; generation: number;
    };
    expect(msg.type).toBe('pimc');
    expect(Array.isArray(msg.unknownCardIds)).toBe(true);
    expect(msg.unknownCardIds.length).toBe(2);
    expect(typeof msg.generation).toBe('number');
  });

  it('pimc-progress message updates pimcProgress store', () => {
    setupThreeOpen();
    const gen = (lastWorkerInstance!.lastPostedMessage as { generation: number }).generation;
    lastWorkerInstance!.onmessage!({
      data: { type: 'pimc-progress', generation: gen, current: 5, total: 50 },
    } as MessageEvent);
    expect(get(pimcProgress)).toEqual({ current: 5, total: 50 });
  });

  it('result message clears pimcProgress', () => {
    setupThreeOpen();
    const gen = (lastWorkerInstance!.lastPostedMessage as { generation: number }).generation;
    lastWorkerInstance!.onmessage!({
      data: { type: 'pimc-progress', generation: gen, current: 10, total: 50 },
    } as MessageEvent);
    lastWorkerInstance!.onmessage!({
      data: { type: 'result', generation: gen, moves: [] },
    } as MessageEvent);
    expect(get(pimcProgress)).toBeNull();
  });
});

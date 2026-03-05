// ABOUTME: Tests for the central game store — phase transitions, move placement, and undo.
// ABOUTME: Covers startGame, playCard, undoMove, selectCard, and hand/ruleset updates.
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  game, currentState, rankedMoves,
  startGame, playCard, undoMove, selectCard,
  updatePlayerCard, updateOpponentCard, updateRuleset,
} from '../../src/app/store';
import { createCard, CardType, Owner, Outcome } from '../../src/engine';

function makePlayerHand() {
  return Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
}

function makeOpponentHand() {
  return Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
}

beforeEach(() => {
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false },
    playerHand: [null, null, null, null, null],
    opponentHand: [null, null, null, null, null],
    history: [],
    selectedCard: null,
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
    updateRuleset({ plus: true, same: false });
    expect(get(game).ruleset).toEqual({ plus: true, same: false });
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

  it('rankedMoves updates after startGame', () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    startGame();

    expect(get(rankedMoves).length).toBeGreaterThan(0);
  });
});

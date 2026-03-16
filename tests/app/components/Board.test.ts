// ABOUTME: Tests for the Board component — renders cells, handles placement, shows highlights.
// ABOUTME: Uses asymmetric hands (player all-10s, opponent all-1s) for fast solver termination.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, startGame, selectCard, rankedMoves, currentState } from '../../../src/app/store';
import Board from '../../../src/app/components/game/Board.svelte';
import { createCard, Owner, findBestMove } from '../../../src/engine';

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

describe('Board', () => {
  it('renders 9 cells', () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();

    render(Board);
    expect(screen.getAllByRole('button')).toHaveLength(9);
  });

  it('places a card when an empty cell is clicked with a card selected', async () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();
    // startGame re-creates cards with fresh IDs; use the store's hand for card references.
    selectCard(get(game).playerHand[0]!);

    render(Board);
    await fireEvent.click(screen.getAllByRole('button')[0]!);

    expect(get(game).history).toHaveLength(2);
  });

  it('highlights the suggested cell when a card is selected', async () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();
    // startGame re-creates cards with fresh IDs; use the store's hand for card references.
    const freshHand = get(game).playerHand;
    rankedMoves.set(findBestMove(get(currentState)!));
    selectCard(freshHand[0]!);

    const { container } = render(Board);
    expect(container.querySelector('.ring-2')).not.toBeNull();
  });

  it('shows outcome overlays on empty cells when a card is selected', async () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();
    // startGame re-creates cards with fresh IDs; use the store's hand for card references.
    const freshHand = get(game).playerHand;
    rankedMoves.set(findBestMove(get(currentState)!));
    selectCard(freshHand[0]!);

    const { container } = render(Board);
    // All 9 cells are empty, each should have data-eval attribute
    const evalCells = container.querySelectorAll('[data-eval]');
    expect(evalCells.length).toBe(9);
  });

  it('shows outcome overlays when moves come from a deserialized source (Worker)', async () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();
    // startGame re-creates cards with fresh IDs; use the store's hand for card references.
    const freshHand = get(game).playerHand;
    // Simulate Worker structured-clone: card.id is a primitive number and survives deserialization
    const moves = findBestMove(get(currentState)!);
    rankedMoves.set(JSON.parse(JSON.stringify(moves)));
    selectCard(freshHand[0]!); // fresh reference — id matches deserialized move.card.id

    const { container } = render(Board);
    const evalCells = container.querySelectorAll('[data-eval]');
    expect(evalCells.length).toBe(9);
  });

  it('highlights the suggested cell when moves come from a deserialized source (Worker)', async () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();
    // startGame re-creates cards with fresh IDs; use the store's hand for card references.
    const freshHand = get(game).playerHand;
    const moves = findBestMove(get(currentState)!);
    rankedMoves.set(JSON.parse(JSON.stringify(moves)));
    selectCard(freshHand[0]!);

    const { container } = render(Board);
    expect(container.querySelector('.ring-2')).not.toBeNull();
  });
});

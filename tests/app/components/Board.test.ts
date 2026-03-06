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
    ruleset: { plus: false, same: false },
    playerHand: [null, null, null, null, null],
    opponentHand: [null, null, null, null, null],
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
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
    selectCard(ph[0]!);

    render(Board);
    await fireEvent.click(screen.getAllByRole('button')[0]!);

    expect(get(game).history).toHaveLength(2);
  });

  it('highlights the suggested cell when a card is selected', async () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();
    rankedMoves.set(findBestMove(get(currentState)!));
    selectCard(ph[0]!);

    const { container } = render(Board);
    expect(container.querySelector('.ring-2')).not.toBeNull();
  });

  it('shows outcome overlays on empty cells when a card is selected', async () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();
    rankedMoves.set(findBestMove(get(currentState)!));
    selectCard(ph[0]!);

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
    // Simulate Worker structured-clone: new object references for card objects
    const moves = findBestMove(get(currentState)!);
    rankedMoves.set(JSON.parse(JSON.stringify(moves)));
    selectCard(ph[0]!); // original reference — won't === deserialized move.card

    const { container } = render(Board);
    const evalCells = container.querySelectorAll('[data-eval]');
    expect(evalCells.length).toBe(9);
  });

  it('highlights the suggested cell when moves come from a deserialized source (Worker)', async () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));
    startGame();
    const moves = findBestMove(get(currentState)!);
    rankedMoves.set(JSON.parse(JSON.stringify(moves)));
    selectCard(ph[0]!);

    const { container } = render(Board);
    expect(container.querySelector('.ring-2')).not.toBeNull();
  });
});

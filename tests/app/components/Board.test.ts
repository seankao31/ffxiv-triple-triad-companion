// ABOUTME: Tests for the Board component — renders cells, handles placement, shows highlights.
// ABOUTME: Uses asymmetric hands (player all-10s, opponent all-1s) for fast solver termination.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, startGame, selectCard, rankedMoves, currentState } from '../../../src/app/store';
import Board from '../../../src/app/components/game/Board.svelte';
import { createCard, Owner, type Card, type RankedMove } from '../../../src/engine';

// Constructs all 45 ranked moves (5 cards × 9 positions) as wins, mirroring what the solver
// returns for all-10s vs all-1s hands. Used to populate rankedMoves without invoking the solver.
function makeAllMoves(hand: readonly Card[]): RankedMove[] {
  return hand.flatMap((card) =>
    Array.from({ length: 9 }, (_, position) => ({ card, position, score: 7, robustness: 1 }))
  );
}

function makePlayerHand() {
  return [createCard(10, 8, 6, 4), createCard(9, 7, 5, 3), createCard(8, 6, 10, 2), createCard(7, 10, 4, 8), createCard(6, 5, 9, 7)];
}

function makeOpponentHand() {
  return [createCard(1, 3, 5, 2), createCard(2, 4, 1, 6), createCard(3, 1, 2, 4), createCard(4, 2, 6, 1), createCard(5, 6, 3, 3)];
}

beforeEach(() => {
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false },
    swap: false,
    threeOpen: false,
    playerHand: [null, null, null, null, null],
    setupPlayerHand: [null, null, null, null, null],
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
    rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));
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
    rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));
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
    const moves = makeAllMoves(get(currentState)!.playerHand);
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
    const moves = makeAllMoves(get(currentState)!.playerHand);
    rankedMoves.set(JSON.parse(JSON.stringify(moves)));
    selectCard(freshHand[0]!);

    const { container } = render(Board);
    expect(container.querySelector('.ring-2')).not.toBeNull();
  });
});

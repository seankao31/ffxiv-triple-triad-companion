// ABOUTME: Tests for GameView — game layout, undo button state, reset button, and active rules display.
// ABOUTME: Verifies undo is disabled at initial state and enabled after a move.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, startGame, selectCard, playCard, currentState, rankedMoves, resetGame } from '../../../src/app/store';
import GameView from '../../../src/app/components/game/GameView.svelte';
import { createCard, Owner, type Card, type RankedMove } from '../../../src/engine';

function makePlayerHand() {
  return [createCard(10, 8, 6, 4), createCard(9, 7, 5, 3), createCard(8, 6, 10, 2), createCard(7, 10, 4, 8), createCard(6, 5, 9, 7)];
}

function makeOpponentHand() {
  return [createCard(1, 3, 5, 2), createCard(2, 4, 1, 6), createCard(3, 1, 2, 4), createCard(4, 2, 6, 1), createCard(5, 6, 3, 3)];
}

function makeAllMoves(hand: readonly Card[]): RankedMove[] {
  return hand.flatMap((card) =>
    Array.from({ length: 9 }, (_, position) => ({ card, position, score: 7, robustness: 1 }))
  );
}

beforeEach(() => {
  const ph = makePlayerHand();
  const oh = makeOpponentHand();
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
    swap: false,
    threeOpen: false,
    playerHand: ph,
    setupPlayerHand: [null, null, null, null, null],
    opponentHand: oh,
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
    unknownCardIds: new Set(),
  });
  startGame();
  rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));
});

describe('GameView', () => {
  it('disables Undo button at the initial state (no moves played)', () => {
    render(GameView);
    const undoButton = screen.getByRole('button', { name: /undo/i });
    expect(undoButton).toBeDisabled();
  });

  it('enables Undo button after a move is played', () => {
    selectCard(get(game).playerHand[0]!);
    playCard(0);
    render(GameView);
    const undoButton = screen.getByRole('button', { name: /undo/i });
    expect(undoButton).not.toBeDisabled();
  });

  it('renders a Reset button', () => {
    render(GameView);
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('clicking Reset returns to setup phase', async () => {
    render(GameView);
    const resetButton = screen.getByRole('button', { name: /reset/i });
    await fireEvent.click(resetButton);
    expect(get(game).phase).toBe('setup');
  });

  it('displays active rules above the board', () => {
    game.update((s) => ({ ...s, ruleset: { ...s.ruleset, plus: true, same: true } }));
    render(GameView);
    expect(screen.getByText('Active rules: Plus · Same')).toBeInTheDocument();
  });
});

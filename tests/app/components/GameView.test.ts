// ABOUTME: Tests for GameView — game layout, undo button state, and reset button.
// ABOUTME: Verifies undo is disabled at initial state and enabled after a move.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, startGame, selectCard, playCard, currentState, rankedMoves, resetGame } from '../../../src/app/store';
import GameView from '../../../src/app/components/game/GameView.svelte';
import { createCard, Owner, Outcome, type Card, type RankedMove } from '../../../src/engine';

function makePlayerHand() {
  return Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
}

function makeOpponentHand() {
  return Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
}

function makeAllMoves(hand: readonly Card[]): RankedMove[] {
  return hand.flatMap((card) =>
    Array.from({ length: 9 }, (_, position) => ({ card, position, outcome: Outcome.Win, robustness: 1 }))
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
});

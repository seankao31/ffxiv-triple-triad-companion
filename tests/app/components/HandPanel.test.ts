// ABOUTME: Tests for HandPanel — renders remaining cards, highlights best move, handles selection.
// ABOUTME: Uses asymmetric hands for fast solver termination.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, startGame, selectCard, rankedMoves, currentState } from '../../../src/app/store';
import HandPanel from '../../../src/app/components/game/HandPanel.svelte';
import { createCard, Owner, findBestMove } from '../../../src/engine';

function makePlayerHand() {
  return Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
}

function makeOpponentHand() {
  return Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
}

beforeEach(() => {
  const ph = makePlayerHand();
  const oh = makeOpponentHand();
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false },
    playerHand: ph,
    opponentHand: oh,
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
  });
  startGame();
  // Worker is mocked — populate rankedMoves directly for component tests.
  rankedMoves.set(findBestMove(get(currentState)!));
});

describe('HandPanel', () => {
  it('renders 5 cards for the player hand', () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('sets selectedCard when a card is clicked on the active turn', async () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    await fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(get(game).selectedCard).not.toBeNull();
  });

  it('does not set selectedCard when the inactive hand is clicked', async () => {
    render(HandPanel, { props: { owner: Owner.Opponent } });
    await fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(get(game).selectedCard).toBeNull();
  });

  it('highlights the card matching the top ranked move', () => {
    render(HandPanel, { props: { owner: Owner.Player } });
    const highlighted = screen
      .getAllByRole('button')
      .filter((b) => b.classList.contains('ring-2'));
    expect(highlighted.length).toBeGreaterThanOrEqual(1);
  });
});

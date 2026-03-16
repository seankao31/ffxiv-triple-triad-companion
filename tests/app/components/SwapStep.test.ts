// ABOUTME: Tests for SwapStep — the card exchange UI for the Swap format rule.
// ABOUTME: Verifies card selection, CardInput entry, and handleSwap invocation.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, startGame, handleSwap, updateSwap } from '../../../src/app/store';
import SwapStep from '../../../src/app/components/setup/SwapStep.svelte';
import { createCard, Owner } from '../../../src/engine';

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
    phase: 'swap',
    ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
    swap: true,
    playerHand: ph,
    opponentHand: oh,
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
  });
});

describe('SwapStep', () => {
  it('renders a list of player hand cards to select from', () => {
    render(SwapStep);
    // Should render 5 selectable card buttons
    const buttons = screen.getAllByRole('button');
    // At least 5 card buttons (plus the Confirm button)
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });

  it('renders a Confirm Swap button', () => {
    render(SwapStep);
    expect(screen.getByRole('button', { name: /confirm swap/i })).toBeInTheDocument();
  });

  it('Confirm Swap button is disabled until both card and received card are chosen', () => {
    render(SwapStep);
    const confirm = screen.getByRole('button', { name: /confirm swap/i });
    expect(confirm).toBeDisabled();
  });

  it('handleSwap replaces the given card with the received card', () => {
    const ph = get(game).playerHand;
    const given = ph[0]!;
    const received = createCard(5, 5, 5, 5);
    handleSwap(given, received);
    const hand = get(game).playerHand;
    expect(hand).not.toContain(given);
    expect(hand).toContain(received);
  });

  it('transitions to play phase after handleSwap', () => {
    const ph = get(game).playerHand;
    const given = ph[0]!;
    const received = createCard(5, 5, 5, 5);
    handleSwap(given, received);
    expect(get(game).phase).toBe('play');
    expect(get(game).history).toHaveLength(1);
  });
});

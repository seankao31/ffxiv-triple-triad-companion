// ABOUTME: Tests for SwapStep — the card exchange UI for the Swap format rule.
// ABOUTME: Verifies card selection from both hands and handleSwap invocation.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, handleSwap } from '../../../src/app/store';
import SwapStep from '../../../src/app/components/setup/SwapStep.svelte';
import { createCard, resetCardIds, Owner } from '../../../src/engine';

function makePlayerHand() {
  return [createCard(10, 10, 10, 10), createCard(9, 8, 7, 6), createCard(5, 4, 3, 2), createCard(8, 8, 8, 8), createCard(6, 6, 6, 6)];
}

function makeOpponentHand() {
  return [createCard(1, 2, 3, 4), createCard(2, 3, 4, 5), createCard(3, 4, 5, 6), createCard(4, 5, 6, 7), createCard(5, 6, 7, 8)];
}

beforeEach(() => {
  resetCardIds();
  const ph = makePlayerHand();
  const oh = makeOpponentHand();
  game.set({
    phase: 'swap',
    ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false, order: false, chaos: false },
    swap: true,
    threeOpen: false,
    allOpen: false,
    playerHand: ph,
    setupPlayerHand: [null, null, null, null, null],
    opponentHand: oh,
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
    unknownCardIds: new Set(),
    playerSide: 'left',
  });
});

describe('SwapStep', () => {
  it('renders player hand cards and opponent hand cards as selectable buttons', () => {
    render(SwapStep);
    // 5 player cards + 5 opponent cards + 1 Confirm button = at least 11 buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(11);
  });

  it('renders a Confirm Swap button', () => {
    render(SwapStep);
    expect(screen.getByRole('button', { name: /confirm swap/i })).toBeInTheDocument();
  });

  it('Confirm Swap button is disabled until both given and received cards are chosen', () => {
    render(SwapStep);
    const confirm = screen.getByRole('button', { name: /confirm swap/i });
    expect(confirm).toBeDisabled();
  });

  it('handleSwap replaces the given card with the received card in both hands', () => {
    const ph = get(game).playerHand;
    const oh = get(game).opponentHand;
    const given = ph[0]!;
    const received = oh[2]!;
    handleSwap(given, received);

    const playerHand = get(game).playerHand;
    expect(playerHand).toContainEqual(expect.objectContaining({ top: 3, right: 4, bottom: 5, left: 6 }));

    const oppHand = get(game).opponentHand;
    expect(oppHand).toContainEqual(expect.objectContaining({ top: 10, right: 10, bottom: 10, left: 10 }));
  });

  it('transitions to play phase after handleSwap', () => {
    const ph = get(game).playerHand;
    const oh = get(game).opponentHand;
    handleSwap(ph[0]!, oh[0]!);
    expect(get(game).phase).toBe('play');
    expect(get(game).history).toHaveLength(1);
  });

  it('Confirm Swap enables after clicking one player card and one opponent card', async () => {
    render(SwapStep);
    const buttons = screen.getAllByRole('button');
    const confirm = screen.getByRole('button', { name: /confirm swap/i });
    // Buttons: 5 player + 5 opponent + 1 confirm = 11
    // Player cards are buttons 0–4, opponent cards are 5–9
    const playerCards = buttons.filter(b => b !== confirm).slice(0, 5);
    const opponentCards = buttons.filter(b => b !== confirm).slice(5, 10);

    expect(confirm).toBeDisabled();

    // Click only a player card — still disabled
    await fireEvent.click(playerCards[0]!);
    expect(confirm).toBeDisabled();

    // Click an opponent card — now enabled
    await fireEvent.click(opponentCards[2]!);
    expect(confirm).toBeEnabled();
  });

  it('clicking Confirm Swap transitions to play phase with swapped hands', async () => {
    render(SwapStep);
    const buttons = screen.getAllByRole('button');
    const confirm = screen.getByRole('button', { name: /confirm swap/i });
    const playerCards = buttons.filter(b => b !== confirm).slice(0, 5);
    const opponentCards = buttons.filter(b => b !== confirm).slice(5, 10);

    // Select player card 0 (A/A/A/A) and opponent card 2 (3/4/5/6)
    await fireEvent.click(playerCards[0]!);
    await fireEvent.click(opponentCards[2]!);
    await fireEvent.click(confirm);

    expect(get(game).phase).toBe('play');
    // Player hand should have the received card (3/4/5/6) at index 0
    expect(get(game).playerHand[0]).toMatchObject({ top: 3, right: 4, bottom: 5, left: 6 });
    // Opponent hand should have the given card (A/A/A/A) at index 2
    expect(get(game).opponentHand[2]).toMatchObject({ top: 10, right: 10, bottom: 10, left: 10 });
  });
});

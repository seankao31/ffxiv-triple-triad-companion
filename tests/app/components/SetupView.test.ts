// ABOUTME: Tests for SetupView — validates hand entry and triggers game start.
// ABOUTME: Tests store integration: filling hands and clicking Start Game transitions to play.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game } from '../../../src/app/store';
import SetupView from '../../../src/app/components/setup/SetupView.svelte';
import { createCard, CardType, Owner } from '../../../src/engine';

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
    allOpen: false,
    playerHand: [null, null, null, null, null],
    setupPlayerHand: [null, null, null, null, null],
    opponentHand: [null, null, null, null, null],
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
    unknownCardIds: new Set(),
  });
});

describe('SetupView', () => {
  it('renders a Start Game button', () => {
    render(SetupView);
    expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
  });

  it('renders Plus and Same checkboxes', () => {
    render(SetupView);
    expect(screen.getByLabelText(/plus/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/same/i)).toBeInTheDocument();
  });

  it('transitions to play phase when all cards are filled and Start Game is clicked', async () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));

    render(SetupView);
    await fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(get(game).phase).toBe('play');
  });

  it('transitions to play phase when Enter is pressed with complete hands', async () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));

    render(SetupView);
    await fireEvent.submit(screen.getByRole('form'));

    expect(get(game).phase).toBe('play');
  });

  it('does not transition when hands are incomplete', async () => {
    render(SetupView);
    await fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    expect(get(game).phase).toBe('setup');
  });

  it('shows an error message when Start Game is clicked with incomplete hands', async () => {
    render(SetupView);
    await fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders a first-move selector defaulting to Player (You)', () => {
    render(SetupView);
    const playerRadio = screen.getByLabelText(/you/i);
    expect(playerRadio).toBeChecked();
  });

  it('updates firstTurn in store when Opponent radio is clicked', async () => {
    render(SetupView);
    const opponentRadio = screen.getByLabelText(/opponent/i);
    await fireEvent.click(opponentRadio);
    expect(get(game).firstTurn).toBe(Owner.Opponent);
  });

  it('transitions to swap phase when Swap checkbox is checked and Start Game is clicked', async () => {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    game.update((s) => ({ ...s, playerHand: ph, opponentHand: oh }));

    render(SetupView);
    await fireEvent.click(screen.getByLabelText(/swap/i));
    await fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(get(game).phase).toBe('swap');
  });

  it('displays preserved player hand values after reset', () => {
    // Simulate the state after resetGame — playerHand preserved, opponentHand cleared
    const playerHand = [
      createCard(5, 3, 7, 2, CardType.Primal),
      createCard(10, 1, 4, 6),
      createCard(8, 8, 8, 8),
      createCard(3, 9, 2, 5),
      createCard(7, 4, 6, 1),
    ];
    game.update((s) => ({ ...s, playerHand, opponentHand: [null, null, null, null, null] }));

    render(SetupView);

    // "Your Hand" section should show the first card's stats
    const topInputs = screen.getAllByLabelText('Top');
    // First 5 inputs are player hand, next 5 are opponent hand
    expect(topInputs[0]).toHaveValue('5');  // card 1 top
    expect(topInputs[1]).toHaveValue('A');  // card 2 top (10 → A)
    expect(topInputs[2]).toHaveValue('8');  // card 3 top

    // Opponent hand inputs should be empty
    expect(topInputs[5]).toHaveValue('');
  });
});

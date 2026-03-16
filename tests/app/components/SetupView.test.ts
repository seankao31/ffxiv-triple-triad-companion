// ABOUTME: Tests for SetupView — validates hand entry and triggers game start.
// ABOUTME: Tests store integration: filling hands and clicking Start Game transitions to play.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game } from '../../../src/app/store';
import SetupView from '../../../src/app/components/setup/SetupView.svelte';
import { createCard, Owner } from '../../../src/engine';

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
});

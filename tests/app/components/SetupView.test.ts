// ABOUTME: Tests for SetupView — validates hand entry and triggers game start.
// ABOUTME: Tests store integration: filling hands and clicking Start Game transitions to play.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game } from '../../../src/app/store';
import SetupView from '../../../src/app/components/setup/SetupView.svelte';
import { createCard } from '../../../src/engine';

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
    history: [],
    selectedCard: null,
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
});

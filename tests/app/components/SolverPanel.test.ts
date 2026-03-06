// ABOUTME: Tests for SolverPanel — displays ranked move suggestions with outcomes.
// ABOUTME: Uses asymmetric hands for fast solver termination.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { game, startGame } from '../../../src/app/store';
import SolverPanel from '../../../src/app/components/game/SolverPanel.svelte';
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
    phase: 'setup',
    ruleset: { plus: false, same: false },
    playerHand: ph,
    opponentHand: oh,
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
  });
  startGame();
});

describe('SolverPanel', () => {
  it('renders a list of move suggestions', () => {
    render(SolverPanel);
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('shows outcome labels (Win, Draw, or Loss)', () => {
    render(SolverPanel);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/win|draw|loss/i);
  });

  it('renders the first move with a distinct highlight class', () => {
    const { container } = render(SolverPanel);
    const items = container.querySelectorAll('li');
    expect(items.length).toBeGreaterThan(0);
    // First item should have ring-1 (top move highlight)
    expect(items[0]!.classList.contains('ring-1')).toBe(true);
  });
});

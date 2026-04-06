// ABOUTME: Tests for ActiveRules — verifies active rule names are displayed during a game.
// ABOUTME: Covers capture rules, format rules, and the empty-rules fallback.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { game } from '../../../src/app/store';
import ActiveRules from '../../../src/app/components/game/ActiveRules.svelte';
import { Owner } from '../../../src/engine';

function setRules(overrides: Partial<{
  plus: boolean; same: boolean; reverse: boolean;
  fallenAce: boolean; ascension: boolean; descension: boolean;
  swap: boolean; threeOpen: boolean;
}> = {}) {
  game.set({
    phase: 'play',
    ruleset: {
      plus: overrides.plus ?? false,
      same: overrides.same ?? false,
      reverse: overrides.reverse ?? false,
      fallenAce: overrides.fallenAce ?? false,
      ascension: overrides.ascension ?? false,
      descension: overrides.descension ?? false,
    },
    swap: overrides.swap ?? false,
    threeOpen: overrides.threeOpen ?? false,
    playerHand: [null, null, null, null, null],
    setupPlayerHand: [null, null, null, null, null],
    opponentHand: [null, null, null, null, null],
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
    unknownCardIds: new Set(),
  });
}

describe('ActiveRules', () => {
  beforeEach(() => setRules());

  it('renders "No active rules" when no rules are enabled', () => {
    render(ActiveRules);
    expect(screen.getByText('No active rules')).toBeInTheDocument();
  });

  it('renders active capture rules joined by middle dot', () => {
    setRules({ plus: true, same: true });
    render(ActiveRules);
    expect(screen.getByText('Active rules: Plus · Same')).toBeInTheDocument();
  });

  it('renders Fallen Ace with proper casing', () => {
    setRules({ fallenAce: true });
    render(ActiveRules);
    expect(screen.getByText('Active rules: Fallen Ace')).toBeInTheDocument();
  });

  it('includes format rules when active', () => {
    setRules({ reverse: true, swap: true, threeOpen: true });
    render(ActiveRules);
    expect(screen.getByText('Active rules: Reverse · Swap · Three Open')).toBeInTheDocument();
  });
});

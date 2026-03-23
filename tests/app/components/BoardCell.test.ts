// ABOUTME: Tests for BoardCell — renders placed cards with type labels and modifiers.
// ABOUTME: Validates type abbreviation display and Ascension/Descension modifier indicators.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { CardType, Owner, createCard, resetCardIds } from '../../../src/engine';
import BoardCell from '../../../src/app/components/game/BoardCell.svelte';

beforeEach(() => {
  resetCardIds();
});

describe('BoardCell type label', () => {
  it('shows type abbreviation for a Primal card', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        onclick: () => {},
      },
    });
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('shows type abbreviation for a Scion card', () => {
    const card = createCard(5, 5, 5, 5, CardType.Scion);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        onclick: () => {},
      },
    });
    expect(screen.getByText('Sc')).toBeInTheDocument();
  });

  it('does not show type label for a None-type card', () => {
    const card = createCard(5, 5, 5, 5, CardType.None);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        onclick: () => {},
      },
    });
    expect(screen.queryByText('P')).not.toBeInTheDocument();
    expect(screen.queryByText('Sc')).not.toBeInTheDocument();
    expect(screen.queryByText('So')).not.toBeInTheDocument();
    expect(screen.queryByText('G')).not.toBeInTheDocument();
  });
});

describe('BoardCell modifier', () => {
  it('shows positive modifier when ascension modifier is provided', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        modifier: 2,
        onclick: () => {},
      },
    });
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('shows negative modifier when descension modifier is provided', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        modifier: -1,
        onclick: () => {},
      },
    });
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('does not show modifier when modifier is 0', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        modifier: 0,
        onclick: () => {},
      },
    });
    expect(screen.queryByText('+0')).not.toBeInTheDocument();
    expect(screen.queryByText('-0')).not.toBeInTheDocument();
  });

  it('does not show modifier when not provided', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        onclick: () => {},
      },
    });
    // No modifier elements — just the card values and type label
    expect(screen.queryByText(/^\+\d$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^-\d$/)).not.toBeInTheDocument();
  });
});

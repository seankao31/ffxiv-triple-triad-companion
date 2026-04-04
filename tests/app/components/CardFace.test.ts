// ABOUTME: Tests for CardFace — pure display of card stats in cross layout.
// ABOUTME: Validates stat formatting, type badge, modifier overlay, and unknown placeholder.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createCard, CardType, resetCardIds } from '../../../src/engine';
import CardFace from '../../../src/app/components/CardFace.svelte';

beforeEach(() => {
  resetCardIds();
});

describe('CardFace stat display', () => {
  it('renders all four stat values', () => {
    const card = createCard(3, 7, 2, 9);
    render(CardFace, { props: { card } });
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('renders 10 as A', () => {
    const card = createCard(10, 10, 10, 10);
    render(CardFace, { props: { card } });
    const aces = screen.getAllByText('A');
    expect(aces).toHaveLength(4);
  });
});

describe('CardFace type badge', () => {
  it('shows type abbreviation for Primal card', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(CardFace, { props: { card } });
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('hides type badge when showType is false', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(CardFace, { props: { card, showType: false } });
    expect(screen.queryByText('P')).not.toBeInTheDocument();
  });

  it('shows no type badge for None-type card', () => {
    const card = createCard(5, 5, 5, 5, CardType.None);
    render(CardFace, { props: { card } });
    expect(screen.queryByText('P')).not.toBeInTheDocument();
    expect(screen.queryByText('Sc')).not.toBeInTheDocument();
    expect(screen.queryByText('So')).not.toBeInTheDocument();
    expect(screen.queryByText('G')).not.toBeInTheDocument();
  });
});

describe('CardFace modifier', () => {
  it('shows positive modifier', () => {
    const card = createCard(5, 5, 5, 5);
    render(CardFace, { props: { card, modifier: 2 } });
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('shows negative modifier', () => {
    const card = createCard(5, 5, 5, 5);
    render(CardFace, { props: { card, modifier: -1 } });
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('shows zero modifier', () => {
    const card = createCard(5, 5, 5, 5);
    render(CardFace, { props: { card, modifier: 0 } });
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('does not show modifier when null', () => {
    const card = createCard(5, 5, 5, 5);
    render(CardFace, { props: { card } });
    expect(screen.queryByText(/^\+\d$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^-\d$/)).not.toBeInTheDocument();
  });
});

describe('CardFace unknown', () => {
  it('shows ? placeholder when unknown', () => {
    const card = createCard(5, 5, 5, 5);
    render(CardFace, { props: { card, unknown: true } });
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('does not show stats when unknown', () => {
    const card = createCard(3, 7, 2, 9);
    render(CardFace, { props: { card, unknown: true } });
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });
});

// ABOUTME: Tests for the CardInput component — single card slot with value and type inputs.
// ABOUTME: Verifies Card emission on valid input and null emission on incomplete/invalid input.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CardInput from '../../../src/app/components/setup/CardInput.svelte';
import { CardType } from '../../../src/engine';

describe('CardInput', () => {
  it('renders four value inputs and a type selector', () => {
    render(CardInput, { props: { onchange: vi.fn(), onadvance: vi.fn() } });
    expect(screen.getByLabelText('Top')).toBeInTheDocument();
    expect(screen.getByLabelText('Right')).toBeInTheDocument();
    expect(screen.getByLabelText('Bottom')).toBeInTheDocument();
    expect(screen.getByLabelText('Left')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('calls onchange with a Card when all values are filled', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange, onadvance: vi.fn() } });

    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '3' });
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '7' });
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: '2' });

    expect(onchange).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 5, right: 3, bottom: 7, left: 2, type: CardType.None }),
    );
  });

  it('calls onchange with null when any field is missing', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange, onadvance: vi.fn() } });

    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '3' });
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '7' });
    // Left is not filled — expect null from the last call (when Bottom was set)

    expect(onchange).toHaveBeenLastCalledWith(null);
  });

  it('accepts "A" keypress as value 10', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange, onadvance: vi.fn() } });

    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: 'A' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: 'A' });
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: 'A' });
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: 'A' });

    expect(onchange).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 10, right: 10, bottom: 10, left: 10 }),
    );
  });

  it('emits the selected card type', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange, onadvance: vi.fn() } });

    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: '5' });
    await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'primal' } });

    expect(onchange).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: CardType.Primal }),
    );
  });

  it('interprets "a" keypress as value 10 for Top', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange, onadvance: vi.fn() } });
    const top = screen.getByLabelText('Top');
    await fireEvent.keyDown(top, { key: 'a' });
    // top is now 10, but other fields empty → onchange(null)
    expect(onchange).toHaveBeenLastCalledWith(null);
  });

  it('interprets "0" keypress as value 10', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange, onadvance: vi.fn() } });
    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '0' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: '5' });
    expect(onchange).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 10, right: 5, bottom: 5, left: 5 }),
    );
  });

  it('calls onadvance after filling the last field (left)', async () => {
    const onadvance = vi.fn();
    render(CardInput, { props: { onchange: vi.fn(), onadvance } });
    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: '5' });
    expect(onadvance).toHaveBeenCalledOnce();
  });

  it('auto-advances focus from Top to Right on valid keypress', async () => {
    render(CardInput, { props: { onchange: vi.fn(), onadvance: vi.fn() } });
    const top = screen.getByLabelText('Top');
    top.focus();
    await fireEvent.keyDown(top, { key: '5' });
    expect(document.activeElement).toBe(screen.getByLabelText('Right'));
  });

  it('Backspace on Right moves focus to Top', async () => {
    render(CardInput, { props: { onchange: vi.fn(), onadvance: vi.fn(), onback: vi.fn() } });
    screen.getByLabelText('Right').focus();
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: 'Backspace' });
    expect(document.activeElement).toBe(screen.getByLabelText('Top'));
  });

  it('Backspace on Bottom moves focus to Right', async () => {
    render(CardInput, { props: { onchange: vi.fn(), onadvance: vi.fn(), onback: vi.fn() } });
    screen.getByLabelText('Bottom').focus();
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: 'Backspace' });
    expect(document.activeElement).toBe(screen.getByLabelText('Right'));
  });

  it('Backspace on Left moves focus to Bottom', async () => {
    render(CardInput, { props: { onchange: vi.fn(), onadvance: vi.fn(), onback: vi.fn() } });
    screen.getByLabelText('Left').focus();
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: 'Backspace' });
    expect(document.activeElement).toBe(screen.getByLabelText('Bottom'));
  });

  it('Backspace on Top calls onback', async () => {
    const onback = vi.fn();
    render(CardInput, { props: { onchange: vi.fn(), onadvance: vi.fn(), onback } });
    screen.getByLabelText('Top').focus();
    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: 'Backspace' });
    expect(onback).toHaveBeenCalledOnce();
  });

  it('Backspace clears the current field and emits null when card is incomplete', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange, onadvance: vi.fn(), onback: vi.fn() } });
    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '3' });
    // Backspace on Right: clears Right, moves to Top — card is now incomplete
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: 'Backspace' });
    expect(onchange).toHaveBeenLastCalledWith(null);
  });

  it('Backspace clears the field and re-emits card with updated value', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange, onadvance: vi.fn(), onback: vi.fn() } });
    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '3' });
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '7' });
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: '2' });
    // Backspace on Left: clears Left → card becomes incomplete
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: 'Backspace' });
    expect(onchange).toHaveBeenLastCalledWith(null);
  });

  it('card container is large enough to avoid dropdown overlap (w-36)', () => {
    const { container } = render(CardInput, { props: { onchange: vi.fn() } });
    const card = container.firstElementChild;
    expect(card?.classList.contains('w-36')).toBe(true);
  });

  it('does not show unknown toggle when allowUnknown is false (default)', () => {
    render(CardInput, { props: { onchange: vi.fn() } });
    expect(screen.queryByLabelText('Toggle unknown')).not.toBeInTheDocument();
  });

  it('shows unknown toggle button when allowUnknown is true', () => {
    render(CardInput, { props: { onchange: vi.fn(), allowUnknown: true } });
    expect(screen.getByLabelText('Toggle unknown')).toBeInTheDocument();
  });

  it('clicking unknown toggle emits null and hides stat inputs', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange, allowUnknown: true } });
    await fireEvent.click(screen.getByLabelText('Toggle unknown'));
    expect(onchange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByLabelText('Top')).not.toBeInTheDocument();
  });

  it('clicking unknown toggle again restores stat inputs', async () => {
    render(CardInput, { props: { onchange: vi.fn(), allowUnknown: true } });
    await fireEvent.click(screen.getByLabelText('Toggle unknown'));
    await fireEvent.click(screen.getByLabelText('Toggle unknown'));
    expect(screen.getByLabelText('Top')).toBeInTheDocument();
  });
});

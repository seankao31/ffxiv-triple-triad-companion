// ABOUTME: Tests for the CardInput component — single card slot with value and type inputs.
// ABOUTME: Verifies Card emission on valid input and null emission on incomplete/invalid input.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CardInput from '../../../src/app/components/setup/CardInput.svelte';
import { CardType } from '../../../src/engine';

describe('CardInput', () => {
  it('renders four value inputs and a type selector', () => {
    render(CardInput, { props: { onchange: vi.fn() } });
    expect(screen.getByLabelText('Top')).toBeInTheDocument();
    expect(screen.getByLabelText('Right')).toBeInTheDocument();
    expect(screen.getByLabelText('Bottom')).toBeInTheDocument();
    expect(screen.getByLabelText('Left')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('calls onchange with a Card when all values are filled', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange } });

    await fireEvent.change(screen.getByLabelText('Top'), { target: { value: '5' } });
    await fireEvent.change(screen.getByLabelText('Right'), { target: { value: '3' } });
    await fireEvent.change(screen.getByLabelText('Bottom'), { target: { value: '7' } });
    await fireEvent.change(screen.getByLabelText('Left'), { target: { value: '2' } });

    expect(onchange).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 5, right: 3, bottom: 7, left: 2, type: CardType.None }),
    );
  });

  it('calls onchange with null when any value is cleared', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange } });

    await fireEvent.change(screen.getByLabelText('Top'), { target: { value: '5' } });
    await fireEvent.change(screen.getByLabelText('Right'), { target: { value: '3' } });
    await fireEvent.change(screen.getByLabelText('Bottom'), { target: { value: '7' } });
    await fireEvent.change(screen.getByLabelText('Left'), { target: { value: '2' } });
    await fireEvent.change(screen.getByLabelText('Top'), { target: { value: '' } });

    expect(onchange).toHaveBeenLastCalledWith(null);
  });

  it('accepts 10 as a value (A)', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange } });

    await fireEvent.change(screen.getByLabelText('Top'), { target: { value: '10' } });
    await fireEvent.change(screen.getByLabelText('Right'), { target: { value: '10' } });
    await fireEvent.change(screen.getByLabelText('Bottom'), { target: { value: '10' } });
    await fireEvent.change(screen.getByLabelText('Left'), { target: { value: '10' } });

    expect(onchange).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 10, right: 10, bottom: 10, left: 10 }),
    );
  });

  it('emits the selected card type', async () => {
    const onchange = vi.fn();
    render(CardInput, { props: { onchange } });

    await fireEvent.change(screen.getByLabelText('Top'), { target: { value: '5' } });
    await fireEvent.change(screen.getByLabelText('Right'), { target: { value: '5' } });
    await fireEvent.change(screen.getByLabelText('Bottom'), { target: { value: '5' } });
    await fireEvent.change(screen.getByLabelText('Left'), { target: { value: '5' } });
    await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'primal' } });

    expect(onchange).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: CardType.Primal }),
    );
  });
});

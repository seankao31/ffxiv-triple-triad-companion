// ABOUTME: Tests for RevealableCard — conditionally shows CardInput or children snippet.
// ABOUTME: Verifies reveal/hide toggling, auto-focus, and onreveal callback.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import RevealableCardTest from './RevealableCardTest.svelte';

describe('RevealableCard', () => {
  it('renders children when not revealing', () => {
    render(RevealableCardTest, { props: { revealing: false, onreveal: vi.fn() } });
    expect(screen.getByText('child-content')).toBeInTheDocument();
    expect(screen.queryByLabelText('Top')).not.toBeInTheDocument();
  });

  it('shows CardInput when revealing', () => {
    render(RevealableCardTest, { props: { revealing: true, onreveal: vi.fn() } });
    expect(screen.getByLabelText('Top')).toBeInTheDocument();
    expect(screen.queryByText('child-content')).not.toBeInTheDocument();
  });

  it('auto-focuses the Top input when revealing becomes true', async () => {
    const { rerender } = render(RevealableCardTest, { props: { revealing: false, onreveal: vi.fn() } });
    await rerender({ revealing: true, onreveal: vi.fn() });
    expect(document.activeElement).toBe(screen.getByLabelText('Top'));
  });

  it('does not call onreveal when CardInput emits null (incomplete input)', async () => {
    const onreveal = vi.fn();
    render(RevealableCardTest, { props: { revealing: true, onreveal } });

    // Type one digit then backspace — CardInput emits null
    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '3' });
    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: 'Backspace' });

    expect(onreveal).not.toHaveBeenCalled();
  });

  it('calls onreveal when CardInput emits a complete card', async () => {
    const onreveal = vi.fn();
    render(RevealableCardTest, { props: { revealing: true, onreveal } });

    await fireEvent.keyDown(screen.getByLabelText('Top'), { key: '3' });
    await fireEvent.keyDown(screen.getByLabelText('Right'), { key: '4' });
    await fireEvent.keyDown(screen.getByLabelText('Bottom'), { key: '5' });
    await fireEvent.keyDown(screen.getByLabelText('Left'), { key: '6' });

    expect(onreveal).toHaveBeenCalledOnce();
    expect(onreveal).toHaveBeenCalledWith(
      expect.objectContaining({ top: 3, right: 4, bottom: 5, left: 6 }),
    );
  });
});

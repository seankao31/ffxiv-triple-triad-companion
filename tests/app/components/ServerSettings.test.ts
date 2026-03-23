// ABOUTME: Tests for ServerSettings — solver mode switching and server URL handling.
// ABOUTME: Validates default URL population on solver mode switch.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { solverMode, serverEndpoint, updateSolverMode, updateServerEndpoint } from '../../../src/app/store';
import ServerSettings from '../../../src/app/components/setup/ServerSettings.svelte';

beforeEach(() => {
  updateSolverMode('wasm');
  updateServerEndpoint('');
});

describe('ServerSettings default URL', () => {
  it('populates endpoint with http://127.0.0.1:8080 when switching to server mode', async () => {
    render(ServerSettings);

    const serverRadio = screen.getByLabelText(/native server/i);
    await fireEvent.click(serverRadio);

    expect(get(serverEndpoint)).toBe('http://127.0.0.1:8080');
  });

  it('does not overwrite an existing endpoint when switching to server mode', async () => {
    updateServerEndpoint('http://custom:9090');
    updateSolverMode('server');

    render(ServerSettings);

    // Switch to wasm and back
    const wasmRadio = screen.getByLabelText(/wasm/i);
    await fireEvent.click(wasmRadio);
    const serverRadio = screen.getByLabelText(/native server/i);
    await fireEvent.click(serverRadio);

    // Should preserve the custom URL, not overwrite with default
    expect(get(serverEndpoint)).toBe('http://custom:9090');
  });
});

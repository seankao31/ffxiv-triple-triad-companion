// ABOUTME: Tests for ServerSettings — solver mode switching, server URL handling, and health check.
// ABOUTME: Validates default URL population on mode switch and connection status on URL blur.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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

describe('ServerSettings health check', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows "Connected" after successful health check on blur', async () => {
    updateSolverMode('server');
    updateServerEndpoint('http://127.0.0.1:8080');
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) } as Response);

    render(ServerSettings);

    const input = screen.getByLabelText(/server url/i);
    await fireEvent.blur(input);

    // Wait for async health check to complete
    await vi.waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });
  });

  it('shows "Cannot connect" after failed health check on blur', async () => {
    updateSolverMode('server');
    updateServerEndpoint('http://127.0.0.1:8080');
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(ServerSettings);

    const input = screen.getByLabelText(/server url/i);
    await fireEvent.blur(input);

    await vi.waitFor(() => {
      expect(screen.getByText(/cannot connect/i)).toBeInTheDocument();
    });
  });

  it('shows "Checking..." while health check is in progress', async () => {
    updateSolverMode('server');
    updateServerEndpoint('http://127.0.0.1:8080');
    const mockFetch = vi.mocked(global.fetch);
    // Never-resolving promise to keep the check in progress
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(ServerSettings);

    const input = screen.getByLabelText(/server url/i);
    await fireEvent.blur(input);

    expect(screen.getByText(/checking/i)).toBeInTheDocument();
  });
});

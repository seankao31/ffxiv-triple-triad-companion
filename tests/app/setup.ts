// ABOUTME: Vitest global setup — extends expect with jest-dom matchers.
// ABOUTME: Imported by vite.config.ts as a setupFile for all app tests.
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Tracks the most recently constructed Worker mock instance, so tests can
// simulate worker responses by calling onmessage/onerror directly.
export let lastWorkerInstance: {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  lastPostedMessage: unknown;
} | null = null;

// Mock Worker so store tests don't attempt to load solver.worker.ts
vi.stubGlobal('Worker', class {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  lastPostedMessage: unknown = null;
  postMessage(msg: unknown) { this.lastPostedMessage = msg; }
  terminate() {}
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastWorkerInstance = this as typeof lastWorkerInstance;
  }
});

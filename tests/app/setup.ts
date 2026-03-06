// ABOUTME: Vitest global setup — extends expect with jest-dom matchers.
// ABOUTME: Imported by vite.config.ts as a setupFile for all app tests.
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock Worker so store tests don't attempt to load solver.worker.ts
vi.stubGlobal('Worker', class {
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage(_msg: unknown) {}
  terminate() {}
});

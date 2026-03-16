// ABOUTME: Vitest global setup — extends expect with jest-dom matchers.
// ABOUTME: Imported by vite.config.ts as a setupFile for all app tests.
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

export interface MockWorker {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postedMessages: unknown[];
  get lastPostedMessage(): unknown;
}

// All Worker instances created by the store at module load time.
// Index 0 = main solver worker; indices 1+ = PIMC pool workers.
export const workerInstances: MockWorker[] = [];

// Backward-compat alias: main solver worker (index 0).
export let lastWorkerInstance: MockWorker | null = null;

vi.stubGlobal('Worker', class implements MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postedMessages: unknown[] = [];
  get lastPostedMessage() { return this.postedMessages.at(-1) ?? null; }
  postMessage(msg: unknown) { this.postedMessages.push(msg); }
  terminate() {}
  constructor() {
    workerInstances.push(this as unknown as MockWorker);
    if (workerInstances.length === 1) lastWorkerInstance = this as unknown as MockWorker;
  }
});

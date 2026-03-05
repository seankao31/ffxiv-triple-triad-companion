// ABOUTME: Smoke test confirming Vitest is configured correctly.
// ABOUTME: Verifies the Vitest + happy-dom environment initializes without errors.
import { describe, it, expect } from 'vitest';

describe('vitest smoke test', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});

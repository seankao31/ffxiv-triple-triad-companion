// ABOUTME: Smoke test confirming Vitest is configured correctly.
// ABOUTME: Safe to delete once real app tests exist.
import { describe, it, expect } from 'vitest';

describe('vitest smoke test', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});

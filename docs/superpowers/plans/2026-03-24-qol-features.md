# QoL Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement five quality-of-life features: undo guard, reset game, server URL default, server health check, and card type & modifier display.

**Architecture:** Each feature is independent and can be implemented in order. Features 1–3 are small store/component changes. Feature 4 spans Rust server and Svelte client. Feature 5 requires extracting shared display maps and adding derived state to card rendering components.

**Tech Stack:** Svelte 5, TypeScript (strict), Rust/Axum, vitest + @testing-library/svelte, bun test runner, cargo test

**Spec:** `docs/superpowers/specs/2026-03-24-qol-features-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/app/card-display.ts` | Shared `typeAbbrev`, `typeColor` maps and `boardTypeCount` helper |

### Modified files
| File | Changes |
|------|---------|
| `src/app/store.ts` | Guard `undoMove()`, add `resetGame()`, export `canUndo` derived store |
| `src/app/components/game/GameView.svelte` | Disable Undo button via `canUndo`, add Reset button |
| `src/app/components/setup/ServerSettings.svelte` | Default URL on mode switch, health check on blur |
| `src/app/components/game/SolverPanel.svelte` | Import shared type maps from `card-display.ts` |
| `src/app/components/game/BoardCell.svelte` | Add type label and modifier overlay |
| `src/app/components/game/HandPanel.svelte` | Add type label and modifier to hand cards |
| `engine-rs/src/bin/server.rs` | Add `GET /api/health`, add clap `--port` flag |
| `engine-rs/Cargo.toml` | Add `clap` dependency with `derive` feature; add `tower`/`http-body-util` dev-deps |

### Test files
| File | Tests added |
|------|------------|
| `tests/app/store.test.ts` | Undo guard tests, reset game tests |
| `tests/app/components/GameView.test.ts` (new) | Undo button disabled state, Reset button |
| `tests/app/components/ServerSettings.test.ts` (new) | Default URL population, health check states |
| `tests/app/card-display.test.ts` (new) | `boardTypeCount` unit tests |
| `tests/app/components/BoardCell.test.ts` (new) | Type label and modifier rendering |
| `tests/app/components/HandPanel.test.ts` | Type label and modifier on hand cards |

---

## Task 1: Undo Guard — Store Logic

**Files:**
- Modify: `src/app/store.ts:366-372` (undoMove function)
- Test: `tests/app/store.test.ts` (add to existing `undoMove` describe block)

- [x] **Step 1: Write failing tests for undo guard**

Add these tests inside the existing `describe('undoMove', ...)` block in `tests/app/store.test.ts`, before the closing `});` of that block:

```typescript
it('is a no-op when history has only the initial state (no moves played)', () => {
  setup();
  // history has exactly 1 entry (initial state)
  expect(get(game).history).toHaveLength(1);
  undoMove();
  // Still in play phase with 1 history entry — not popped to setup
  expect(get(game).phase).toBe('play');
  expect(get(game).history).toHaveLength(1);
});

it('still works normally when history has 2+ entries', () => {
  const { ph } = setup();
  selectCard(ph[0]!);
  playCard(0);
  expect(get(game).history).toHaveLength(2);
  undoMove();
  expect(get(game).history).toHaveLength(1);
  expect(get(game).phase).toBe('play');
});
```

Note: the existing test `'returns to setup phase when history becomes empty'` (line 187) will now FAIL because `undoMove()` is guarded. Update it:

```typescript
// REPLACE the existing test at line 187-191 with:
it('does not return to setup when undoing from the initial state', () => {
  setup();
  undoMove();
  expect(get(game).phase).toBe('play');
  expect(get(game).history).toHaveLength(1);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/store.test.ts`

Expected: The new tests fail (undoMove still pops to empty). The replaced test also fails (it expects 'setup' but now we expect 'play').

- [x] **Step 3: Implement undo guard**

In `src/app/store.ts`, replace lines 366–372:

```typescript
export function undoMove(): void {
  game.update((s) => {
    if (s.history.length <= 1) return s;
    const history = s.history.slice(0, -1);
    return { ...s, history };
  });
}
```

Key changes:
- Guard: `if (s.history.length <= 1) return s` — no-op when only the initial state remains
- Phase stays `'play'` — never transitions to setup (that's Reset's job now)

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/store.test.ts`

Expected: All undoMove tests pass. No other tests should break.

- [x] **Step 5: Commit**

```
git add src/app/store.ts tests/app/store.test.ts
git commit -m 'feat(store): guard undoMove to be no-op at initial state'
```

---

## Task 2: Undo Guard — UI (Disable Button)

**Files:**
- Modify: `src/app/store.ts` (add `canUndo` derived store)
- Modify: `src/app/components/game/GameView.svelte:7,21-26`
- Test: `tests/app/components/GameView.test.ts` (new file)

- [x] **Step 1: Write failing test for disabled Undo button**

Create `tests/app/components/GameView.test.ts`:

```typescript
// ABOUTME: Tests for GameView — game layout, undo button state, and reset button.
// ABOUTME: Verifies undo is disabled at initial state and enabled after a move.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { game, startGame, selectCard, playCard, currentState, rankedMoves } from '../../../src/app/store';
import GameView from '../../../src/app/components/game/GameView.svelte';
import { createCard, Owner, Outcome, type Card, type RankedMove } from '../../../src/engine';

function makePlayerHand() {
  return Array.from({ length: 5 }, () => createCard(10, 10, 10, 10));
}

function makeOpponentHand() {
  return Array.from({ length: 5 }, () => createCard(1, 1, 1, 1));
}

function makeAllMoves(hand: readonly Card[]): RankedMove[] {
  return hand.flatMap((card) =>
    Array.from({ length: 9 }, (_, position) => ({ card, position, outcome: Outcome.Win, robustness: 1 }))
  );
}

beforeEach(() => {
  const ph = makePlayerHand();
  const oh = makeOpponentHand();
  game.set({
    phase: 'setup',
    ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
    swap: false,
    threeOpen: false,
    playerHand: ph,
    opponentHand: oh,
    firstTurn: Owner.Player,
    history: [],
    selectedCard: null,
    unknownCardIds: new Set(),
  });
  startGame();
  rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));
});

describe('GameView', () => {
  it('disables Undo button at the initial state (no moves played)', () => {
    render(GameView);
    const undoButton = screen.getByRole('button', { name: /undo/i });
    expect(undoButton).toBeDisabled();
  });

  it('enables Undo button after a move is played', () => {
    selectCard(get(game).playerHand[0]!);
    playCard(0);
    render(GameView);
    const undoButton = screen.getByRole('button', { name: /undo/i });
    expect(undoButton).not.toBeDisabled();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/app/components/GameView.test.ts`

Expected: FAIL — Undo button is not disabled (no `disabled` attribute yet).

- [x] **Step 3: Add `canUndo` derived store and wire up GameView**

In `src/app/store.ts`, add after the `currentState` derived store (after line 52):

```typescript
export const canUndo = derived(game, ($g) => $g.history.length > 1);
```

In `src/app/components/game/GameView.svelte`, update the imports (line 7):

```typescript
import { undoMove, currentState, canUndo } from '../../store';
```

Update the Undo button (lines 21–26):

```svelte
<button
  onclick={undoMove}
  disabled={!$canUndo}
  class="px-3 py-1 border border-surface-500 rounded text-sm
    {$canUndo ? 'hover:border-surface-400 hover:bg-surface-700' : 'opacity-40 cursor-not-allowed'}"
>
  Undo
</button>
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/GameView.test.ts`

Expected: Both tests pass.

- [x] **Step 5: Run all UI tests to check for regressions**

Run: `bunx vitest run`

Expected: All tests pass.

- [x] **Step 6: Commit**

```
git add src/app/store.ts src/app/components/game/GameView.svelte tests/app/components/GameView.test.ts
git commit -m 'feat(ui): disable Undo button at initial game state'
```

---

## Task 3: Reset Game — Store Logic

**Files:**
- Modify: `src/app/store.ts` (add `resetGame()`)
- Test: `tests/app/store.test.ts` (add new describe block)

- [x] **Step 1: Write failing tests for resetGame**

Add a new describe block in `tests/app/store.test.ts` (after the `undoMove` block):

```typescript
describe('resetGame', () => {
  function setup() {
    const ph = makePlayerHand();
    const oh = makeOpponentHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    oh.forEach((c, i) => updateOpponentCard(i, c));
    updateRuleset({ plus: true, same: false, reverse: false, fallenAce: false, ascension: false, descension: false });
    updateFirstTurn(Owner.Opponent);
    startGame();
  }

  it('returns to setup phase', () => {
    setup();
    resetGame();
    expect(get(game).phase).toBe('setup');
  });

  it('preserves ruleset', () => {
    setup();
    resetGame();
    expect(get(game).ruleset.plus).toBe(true);
  });

  it('preserves firstTurn', () => {
    setup();
    resetGame();
    expect(get(game).firstTurn).toBe(Owner.Opponent);
  });

  it('preserves playerHand (with card objects from the game)', () => {
    setup();
    const handBefore = get(game).playerHand;
    resetGame();
    const handAfter = get(game).playerHand;
    // Cards are preserved (same stats), though IDs may differ after next startGame
    expect(handAfter).toHaveLength(5);
    expect(handAfter.every((c) => c !== null)).toBe(true);
    expect(handAfter[0]!.top).toBe(handBefore[0]!.top);
  });

  it('clears opponentHand to all nulls', () => {
    setup();
    resetGame();
    expect(get(game).opponentHand).toEqual([null, null, null, null, null]);
  });

  it('clears history', () => {
    setup();
    resetGame();
    expect(get(game).history).toEqual([]);
  });

  it('clears selectedCard', () => {
    setup();
    selectCard(get(game).playerHand[0]!);
    resetGame();
    expect(get(game).selectedCard).toBeNull();
  });

  it('clears unknownCardIds', () => {
    setup();
    game.update((g) => ({ ...g, unknownCardIds: new Set([99]) }));
    resetGame();
    expect(get(game).unknownCardIds.size).toBe(0);
  });

  it('preserves swap setting', () => {
    updateSwap(true);
    setup();
    resetGame();
    expect(get(game).swap).toBe(true);
  });

  it('preserves threeOpen setting', () => {
    updateThreeOpen(true);
    // Need to set up with threeOpen
    const ph = makePlayerHand();
    ph.forEach((c, i) => updatePlayerCard(i, c));
    updateOpponentCard(0, createCard(5, 5, 5, 5));
    updateOpponentCard(1, createCard(5, 5, 5, 5));
    updateOpponentCard(2, createCard(5, 5, 5, 5));
    startGame();
    resetGame();
    expect(get(game).threeOpen).toBe(true);
  });
});
```

Import `resetGame` at the top of the test file (line 8), adding it to the existing import:

```typescript
import {
  game, currentState, rankedMoves, solverLoading, pimcProgress,
  startGame, playCard, undoMove, selectCard, resetGame,
  updatePlayerCard, updateOpponentCard, updateRuleset, updateFirstTurn,
  updateSwap, handleSwap, updateThreeOpen, revealCard,
  updateSolverMode, updateServerEndpoint,
} from '../../src/app/store';
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/store.test.ts`

Expected: FAIL — `resetGame` is not exported from the store.

- [x] **Step 3: Implement resetGame**

In `src/app/store.ts`, add after the `undoMove` function:

```typescript
export function resetGame(): void {
  game.update((s) => ({
    ...s,
    phase: 'setup' as Phase,
    opponentHand: [null, null, null, null, null],
    history: [],
    selectedCard: null,
    unknownCardIds: new Set<number>(),
  }));
}
```

Key design: `playerHand`, `ruleset`, `firstTurn`, `swap`, and `threeOpen` are preserved by the spread — only the fields that need clearing are overwritten.

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/store.test.ts`

Expected: All resetGame tests pass.

- [x] **Step 5: Commit**

```
git add src/app/store.ts tests/app/store.test.ts
git commit -m 'feat(store): add resetGame to return to setup while preserving settings'
```

---

## Task 4: Reset Game — UI Button

**Files:**
- Modify: `src/app/components/game/GameView.svelte:7,21-26`
- Test: `tests/app/components/GameView.test.ts` (add tests)

- [x] **Step 1: Write failing test for Reset button**

Add to `tests/app/components/GameView.test.ts`:

Update imports to include `resetGame`:

```typescript
import { game, startGame, selectCard, playCard, currentState, rankedMoves, resetGame } from '../../../src/app/store';
```

Add tests inside the existing describe block:

```typescript
it('renders a Reset button', () => {
  render(GameView);
  expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
});

it('clicking Reset returns to setup phase', async () => {
  render(GameView);
  const resetButton = screen.getByRole('button', { name: /reset/i });
  await fireEvent.click(resetButton);
  expect(get(game).phase).toBe('setup');
});
```

Also add `fireEvent` to the imports from `@testing-library/svelte`.

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/GameView.test.ts`

Expected: FAIL — no Reset button exists.

- [x] **Step 3: Add Reset button to GameView**

In `src/app/components/game/GameView.svelte`, update import (line 7):

```typescript
import { undoMove, resetGame, currentState, canUndo } from '../../store';
```

Add the Reset button after the Undo button (after the closing `</button>` tag on line ~28). Place it in a flex container with the Undo button. Replace the button area (the div containing the Undo button) with:

```svelte
<div class="flex gap-2">
  <button
    onclick={undoMove}
    disabled={!$canUndo}
    class="px-3 py-1 border border-surface-500 rounded text-sm
      {$canUndo ? 'hover:border-surface-400 hover:bg-surface-700' : 'opacity-40 cursor-not-allowed'}"
  >
    Undo
  </button>
  <button
    onclick={resetGame}
    class="px-3 py-1 text-sm text-surface-400 hover:text-surface-300 hover:bg-surface-700 rounded"
  >
    Reset
  </button>
</div>
```

The Reset button is intentionally styled differently — text-only without a border, using muted text color. This provides visual distinction from Undo since Reset is a more destructive action.

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/GameView.test.ts`

Expected: All tests pass.

- [x] **Step 5: Run all UI tests**

Run: `bunx vitest run`

Expected: All tests pass.

- [x] **Step 6: Commit**

```
git add src/app/components/game/GameView.svelte tests/app/components/GameView.test.ts
git commit -m 'feat(ui): add Reset button to GameView header'
```

---

## Task 5: Server URL Default

**Files:**
- Modify: `src/app/components/setup/ServerSettings.svelte:6,23`
- Test: `tests/app/components/ServerSettings.test.ts` (new file)

- [x] **Step 1: Write failing test for default URL population**

Create `tests/app/components/ServerSettings.test.ts`:

```typescript
// ABOUTME: Tests for ServerSettings — solver mode switching and server URL handling.
// ABOUTME: Validates default URL population and health check indicator states.
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/app/components/ServerSettings.test.ts`

Expected: FAIL — switching to server mode doesn't populate the endpoint.

- [x] **Step 3: Implement default URL population**

In `src/app/components/setup/ServerSettings.svelte`, update the `onchange` handler for the server radio (line 33). Replace the entire `<script>` block:

```svelte
<script lang="ts">
  import { solverMode, serverEndpoint, updateSolverMode, updateServerEndpoint } from '../../store';

  const DEFAULT_SERVER_URL = 'http://127.0.0.1:8080';

  let endpointInput = $state($serverEndpoint);

  function handleModeChange(mode: 'wasm' | 'server') {
    updateSolverMode(mode);
    if (mode === 'server' && !endpointInput) {
      endpointInput = DEFAULT_SERVER_URL;
      updateServerEndpoint(DEFAULT_SERVER_URL);
    }
  }

  function handleEndpointBlur() {
    updateServerEndpoint(endpointInput.trim());
  }
</script>
```

Update the radio button `onchange` handlers in the template:

Replace `onchange={() => updateSolverMode('wasm')}` with `onchange={() => handleModeChange('wasm')}`

Replace `onchange={() => updateSolverMode('server')}` with `onchange={() => handleModeChange('server')}`

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/ServerSettings.test.ts`

Expected: Both tests pass.

- [x] **Step 5: Commit**

```
git add src/app/components/setup/ServerSettings.svelte tests/app/components/ServerSettings.test.ts
git commit -m 'feat(ui): auto-populate server URL with 127.0.0.1:8080 on mode switch'
```

---

## Task 6: Server Health Check — Rust Server (Health Endpoint)

**Files:**
- Modify: `engine-rs/src/bin/server.rs:4,136-149`
- Modify: `engine-rs/Cargo.toml:12,19`

- [x] **Step 1: Add test dev-dependencies and write failing Rust test**

First, add dev-dependencies to `engine-rs/Cargo.toml`. Add after the `[dependencies]` section:

```toml
[dev-dependencies]
tower = { version = "0.5", features = ["util"] }
http-body-util = "0.1"
```

Then in `engine-rs/src/bin/server.rs`, add this test inside the `mod tests` block (after the existing tests):

```rust
#[tokio::test]
async fn health_endpoint_returns_ok() {
    use tower::ServiceExt;
    use http_body_util::BodyExt;

    let app = Router::new().route("/api/health", axum::routing::get(health));
    let response = app
        .oneshot(
            axum::http::Request::builder()
                .uri("/api/health")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "ok");
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml -- health_endpoint`

Expected: FAIL — `health` function not found.

- [x] **Step 3: Implement health endpoint**

In `engine-rs/src/bin/server.rs`, add the health handler after the `solve` handler (after line 134):

```rust
async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}
```

Update the router in `main()` to include the health route. Change line 143:

```rust
let app = Router::new()
    .route("/api/solve", post(solve))
    .route("/api/health", axum::routing::get(health))
    .layer(cors);
```

Also add the needed import at the top — `axum::routing::get` is needed alongside `post`. Update line 4:

```rust
use axum::{routing::{get, post}, Json, Router};
```

- [x] **Step 4: Run test to verify it passes**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml -- health_endpoint`

Expected: PASS

- [x] **Step 5: Commit**

```
git add engine-rs/src/bin/server.rs engine-rs/Cargo.toml
git commit -m 'feat(server): add GET /api/health endpoint returning {"status":"ok"}'
```

---

## Task 7: Server Health Check — Rust Server (clap --port flag)

**Files:**
- Modify: `engine-rs/Cargo.toml:12,14-23`
- Modify: `engine-rs/src/bin/server.rs:136-149`

- [x] **Step 1: Add clap dependency**

In `engine-rs/Cargo.toml`, add `clap` to the server feature and dependencies.

Update the `[features]` section (line 12):

```toml
server = ["dep:axum", "dep:tokio", "dep:rayon", "dep:rand", "dep:tower-http", "dep:clap"]
```

Add to `[dependencies]` (after the `tower-http` line):

```toml
clap = { version = "4", features = ["derive"], optional = true }
```

- [x] **Step 2: Implement --port flag**

In `engine-rs/src/bin/server.rs`, add the clap import and CLI struct. Add after line 8:

```rust
use clap::Parser;

#[derive(Parser)]
#[command(about = "Triple Triad solver server")]
struct Cli {
    /// Port to listen on
    #[arg(short, long, default_value_t = 8080)]
    port: u16,
}
```

Update the `main()` function to use clap. Replace lines 137–149:

```rust
#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/solve", post(solve))
        .route("/api/health", get(health))
        .layer(cors);

    let addr = format!("127.0.0.1:{}", cli.port);
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("failed to bind");
    println!("Triple Triad solver server listening on http://{addr}");
    axum::serve(listener, app).await.expect("server error");
}
```

- [x] **Step 3: Verify it compiles**

Run: `cargo build --features server --manifest-path engine-rs/Cargo.toml`

Expected: Compiles successfully.

- [x] **Step 4: Run all Rust tests**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml -- --skip benchmark`

Expected: All tests pass (including the health endpoint test from Task 6).

- [x] **Step 5: Commit**

```
git add engine-rs/Cargo.toml engine-rs/src/bin/server.rs
git commit -m 'feat(server): add clap --port flag (default 8080)'
```

---

## Task 8: Server Health Check — Client Side

**Files:**
- Modify: `src/app/components/setup/ServerSettings.svelte`
- Test: `tests/app/components/ServerSettings.test.ts`

- [x] **Step 1: Write failing tests for health check UI states**

Add to `tests/app/components/ServerSettings.test.ts`:

```typescript
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
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/ServerSettings.test.ts`

Expected: FAIL — no health check indicator rendered.

- [x] **Step 3: Implement health check on blur**

In `src/app/components/setup/ServerSettings.svelte`, update the `<script>` block:

```svelte
<script lang="ts">
  import { solverMode, serverEndpoint, updateSolverMode, updateServerEndpoint } from '../../store';

  const DEFAULT_SERVER_URL = 'http://127.0.0.1:8080';

  let endpointInput = $state($serverEndpoint);
  let healthStatus: 'idle' | 'checking' | 'connected' | 'failed' = $state('idle');
  let lastCheckedUrl = '';

  function handleModeChange(mode: 'wasm' | 'server') {
    updateSolverMode(mode);
    if (mode === 'server' && !endpointInput) {
      endpointInput = DEFAULT_SERVER_URL;
      updateServerEndpoint(DEFAULT_SERVER_URL);
    }
  }

  async function handleEndpointBlur() {
    const trimmed = endpointInput.trim();
    updateServerEndpoint(trimmed);

    if (!trimmed || trimmed === lastCheckedUrl) return;
    lastCheckedUrl = trimmed;
    healthStatus = 'checking';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${trimmed}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      healthStatus = response.ok ? 'connected' : 'failed';
    } catch {
      healthStatus = 'failed';
    }
  }
</script>
```

Add the health status indicator in the template, inside the `{#if $solverMode === 'server'}` block, after the input:

```svelte
{#if $solverMode === 'server'}
  <div class="flex items-center gap-2 justify-center">
    <label class="text-sm text-surface-400" for="server-endpoint">Server URL</label>
    <input
      id="server-endpoint"
      type="text"
      class="px-2 py-1 text-sm bg-surface-800 border border-surface-600 rounded w-56"
      placeholder="http://127.0.0.1:8080"
      bind:value={endpointInput}
      onblur={handleEndpointBlur}
    />
    {#if healthStatus === 'checking'}
      <span class="text-sm text-surface-400">Checking…</span>
    {:else if healthStatus === 'connected'}
      <span class="text-sm text-eval-win">✓ Connected</span>
    {:else if healthStatus === 'failed'}
      <span class="text-sm text-eval-loss">✗ Cannot connect</span>
    {/if}
  </div>
{/if}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/ServerSettings.test.ts`

Expected: All tests pass.

- [x] **Step 5: Run all UI tests**

Run: `bunx vitest run`

Expected: All tests pass.

- [x] **Step 6: Commit**

```
git add src/app/components/setup/ServerSettings.svelte tests/app/components/ServerSettings.test.ts
git commit -m 'feat(ui): add server health check on URL blur with status indicator'
```

---

## Task 9: Card Display — Shared Module

**Files:**
- Create: `src/app/card-display.ts`
- Test: `tests/app/card-display.test.ts` (new file)

- [x] **Step 1: Write failing tests for boardTypeCount and shared maps**

Create `tests/app/card-display.test.ts`:

```typescript
// ABOUTME: Tests for card display helpers — type abbreviation maps and board type counting.
// ABOUTME: Validates boardTypeCount against various board configurations.
import { describe, it, expect } from 'vitest';
import { boardTypeCount, typeAbbrev, typeColor } from '../../src/app/card-display';
import { CardType, Owner, createInitialState, createCard, resetCardIds, type GameState } from '../../src/engine';
import { placeCard } from '../../src/engine';

function emptyState(): GameState {
  resetCardIds();
  const ph = Array.from({ length: 5 }, () => createCard(5, 5, 5, 5));
  const oh = Array.from({ length: 5 }, () => createCard(5, 5, 5, 5));
  return createInitialState(ph, oh);
}

describe('typeAbbrev', () => {
  it('maps Primal to P', () => {
    expect(typeAbbrev[CardType.Primal]).toBe('P');
  });

  it('maps Scion to Sc', () => {
    expect(typeAbbrev[CardType.Scion]).toBe('Sc');
  });

  it('maps Society to So', () => {
    expect(typeAbbrev[CardType.Society]).toBe('So');
  });

  it('maps Garlean to G', () => {
    expect(typeAbbrev[CardType.Garlean]).toBe('G');
  });

  it('returns undefined for None', () => {
    expect(typeAbbrev[CardType.None]).toBeUndefined();
  });
});

describe('typeColor', () => {
  it('maps Primal to text-type-primal', () => {
    expect(typeColor[CardType.Primal]).toBe('text-type-primal');
  });
});

describe('boardTypeCount', () => {
  it('returns 0 for an empty board', () => {
    const state = emptyState();
    expect(boardTypeCount(state, CardType.Primal)).toBe(0);
  });

  it('counts cards of the given type on the board', () => {
    resetCardIds();
    const primal1 = createCard(5, 5, 5, 5, CardType.Primal);
    const primal2 = createCard(5, 5, 5, 5, CardType.Primal);
    const scion = createCard(5, 5, 5, 5, CardType.Scion);
    const ph = [primal1, primal2, scion, createCard(5, 5, 5, 5), createCard(5, 5, 5, 5)];
    const oh = Array.from({ length: 5 }, () => createCard(5, 5, 5, 5));
    let state = createInitialState(ph, oh);
    // Place primal1 at position 0
    state = placeCard(state, primal1, 0);
    // Place an opponent card at position 1
    state = placeCard(state, oh[0]!, 1);
    // Place primal2 at position 2
    state = placeCard(state, primal2, 2);

    expect(boardTypeCount(state, CardType.Primal)).toBe(2);
    expect(boardTypeCount(state, CardType.Scion)).toBe(0);
    expect(boardTypeCount(state, CardType.None)).toBe(1); // opponent's None-type card
  });

  it('returns 0 for CardType.None when no None-type cards are on the board', () => {
    resetCardIds();
    const primal = createCard(5, 5, 5, 5, CardType.Primal);
    const ph = [primal, createCard(5, 5, 5, 5), createCard(5, 5, 5, 5), createCard(5, 5, 5, 5), createCard(5, 5, 5, 5)];
    const oh = Array.from({ length: 5 }, () => createCard(5, 5, 5, 5, CardType.Scion));
    let state = createInitialState(ph, oh);
    state = placeCard(state, primal, 0);
    expect(boardTypeCount(state, CardType.None)).toBe(0);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/card-display.test.ts`

Expected: FAIL — module `src/app/card-display.ts` not found.

- [x] **Step 3: Create card-display.ts**

Create `src/app/card-display.ts`:

```typescript
// ABOUTME: Shared card display helpers for type labels and modifier calculation.
// ABOUTME: Used by BoardCell, HandPanel, and SolverPanel.
import { CardType, type GameState } from '../engine';

export const typeAbbrev: Partial<Record<CardType, string>> = {
  [CardType.Primal]: 'P',
  [CardType.Scion]: 'Sc',
  [CardType.Society]: 'So',
  [CardType.Garlean]: 'G',
};

export const typeColor: Partial<Record<CardType, string>> = {
  [CardType.Primal]: 'text-type-primal',
  [CardType.Scion]: 'text-type-scion',
  [CardType.Society]: 'text-type-society',
  [CardType.Garlean]: 'text-type-garlean',
};

export function boardTypeCount(state: GameState, type: CardType): number {
  let count = 0;
  for (const cell of state.board) {
    if (cell && cell.card.type === type) count++;
  }
  return count;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/card-display.test.ts`

Expected: All tests pass.

- [x] **Step 5: Commit**

```
git add src/app/card-display.ts tests/app/card-display.test.ts
git commit -m 'feat: add shared card-display module with type maps and boardTypeCount'
```

---

## Task 10: Card Display — Update SolverPanel to Use Shared Maps

**Files:**
- Modify: `src/app/components/game/SolverPanel.svelte:5,19-31`

- [x] **Step 1: Replace local maps with shared imports in SolverPanel**

In `src/app/components/game/SolverPanel.svelte`, replace lines 19–31 (the local `typeAbbrev` and `typeColor` definitions) with an import.

Add to the imports (after line 5):

```typescript
import { typeAbbrev, typeColor } from '../../card-display';
```

Delete the local `typeAbbrev` and `typeColor` const declarations (lines 19–31).

- [x] **Step 2: Run SolverPanel tests to verify no regressions**

Run: `bunx vitest run tests/app/components/SolverPanel.test.ts`

Expected: All tests pass — same maps, different source.

- [x] **Step 3: Commit**

```
git add src/app/components/game/SolverPanel.svelte
git commit -m 'refactor(SolverPanel): import type maps from shared card-display module'
```

---

## Task 11: Card Display — Type Label on BoardCell

**Files:**
- Modify: `src/app/components/game/BoardCell.svelte:3-4,41-52`
- Test: `tests/app/components/BoardCell.test.ts` (new tests)

- [x] **Step 1: Write failing test for type label on board cards**

Create `tests/app/components/BoardCell.test.ts` (add to existing file if it exists, but the Glob shows `Board.test.ts`, not `BoardCell.test.ts`, so create it):

```typescript
// ABOUTME: Tests for BoardCell — renders placed cards with type labels and modifiers.
// ABOUTME: Validates type abbreviation display and Ascension/Descension modifier indicators.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { CardType, Owner, createCard, resetCardIds } from '../../../src/engine';
import BoardCell from '../../../src/app/components/game/BoardCell.svelte';

beforeEach(() => {
  resetCardIds();
});

describe('BoardCell type label', () => {
  it('shows type abbreviation for a Primal card', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        onclick: () => {},
      },
    });
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('shows type abbreviation for a Scion card', () => {
    const card = createCard(5, 5, 5, 5, CardType.Scion);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        onclick: () => {},
      },
    });
    expect(screen.getByText('Sc')).toBeInTheDocument();
  });

  it('does not show type label for a None-type card', () => {
    const card = createCard(5, 5, 5, 5, CardType.None);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        onclick: () => {},
      },
    });
    expect(screen.queryByText('P')).not.toBeInTheDocument();
    expect(screen.queryByText('Sc')).not.toBeInTheDocument();
    expect(screen.queryByText('So')).not.toBeInTheDocument();
    expect(screen.queryByText('G')).not.toBeInTheDocument();
  });
});

describe('BoardCell modifier', () => {
  it('shows positive modifier when ascension modifier is provided', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        modifier: 2,
        onclick: () => {},
      },
    });
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('shows negative modifier when descension modifier is provided', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        modifier: -1,
        onclick: () => {},
      },
    });
    expect(screen.getByText('-1')).toBeInTheDocument();
  });

  it('does not show modifier when modifier is 0', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        modifier: 0,
        onclick: () => {},
      },
    });
    expect(screen.queryByText('+0')).not.toBeInTheDocument();
    expect(screen.queryByText('-0')).not.toBeInTheDocument();
  });

  it('does not show modifier when not provided', () => {
    const card = createCard(5, 5, 5, 5, CardType.Primal);
    render(BoardCell, {
      props: {
        cell: { card, owner: Owner.Player },
        onclick: () => {},
      },
    });
    // No modifier elements — just the card values and type label
    expect(screen.queryByText(/^\+\d$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^-\d$/)).not.toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/BoardCell.test.ts`

Expected: FAIL — no type label rendered, no `modifier` prop accepted.

- [x] **Step 3: Implement type label and modifier on BoardCell**

In `src/app/components/game/BoardCell.svelte`, update the script and template.

Add import after line 4:

```typescript
import { typeAbbrev, typeColor } from '../../card-display';
```

Update the props to accept `modifier` (add to the props type after `evaluation`):

```typescript
let {
  cell,
  highlighted = false,
  evaluation = null,
  modifier = null,
  onclick,
}: {
  cell: BoardCellData;
  highlighted?: boolean;
  evaluation?: Outcome | null;
  modifier?: number | null;
  onclick: () => void;
} = $props();
```

Replace the card display grid (lines 42–52) with a version that includes type label and modifier:

```svelte
{#if cell}
  {@const abbr = typeAbbrev[cell.card.type]}
  {@const colorClass = typeColor[cell.card.type]}
  <div class="grid grid-cols-3 gap-0 text-xs font-bold font-mono w-full h-full p-1 relative">
    {#if modifier}
      <div class="absolute top-0.5 left-1 text-[10px] font-semibold {modifier > 0 ? 'text-eval-win' : 'text-eval-loss'}">
        {modifier > 0 ? '+' : ''}{modifier}
      </div>
    {/if}
    {#if abbr}
      <div class="absolute top-0.5 right-1 text-[10px] font-semibold {colorClass}">{abbr}</div>
    {/if}
    <div></div>
    <div class="flex items-center justify-center">{displayValue(cell.card.top)}</div>
    <div></div>
    <div class="flex items-center justify-center">{displayValue(cell.card.left)}</div>
    <div></div>
    <div class="flex items-center justify-center">{displayValue(cell.card.right)}</div>
    <div></div>
    <div class="flex items-center justify-center">{displayValue(cell.card.bottom)}</div>
    <div></div>
  </div>
{:else}
  <span class="text-surface-500 text-2xl">·</span>
{/if}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/BoardCell.test.ts`

Expected: All tests pass.

- [x] **Step 5: Run all Board tests for regressions**

Run: `bunx vitest run tests/app/components/Board.test.ts`

Expected: All tests pass (type label renders but existing tests don't query for it).

- [x] **Step 6: Commit**

```
git add src/app/components/game/BoardCell.svelte tests/app/components/BoardCell.test.ts
git commit -m 'feat(BoardCell): show card type label and modifier overlay'
```

---

## Task 12: Card Display — Type Label and Modifier on HandPanel

**Files:**
- Modify: `src/app/components/game/HandPanel.svelte:3,51-77`
- Test: `tests/app/components/HandPanel.test.ts` (add to existing file)

- [x] **Step 1: Write failing tests for type label and modifier on hand cards**

Add to `tests/app/components/HandPanel.test.ts`. First, update imports to include `CardType` and `updateRuleset`:

```typescript
import { createCard, Owner, Outcome, CardType, type Card, type RankedMove } from '../../../src/engine';
import { game, startGame, selectCard, rankedMoves, currentState, updateThreeOpen, revealCard, updateRuleset } from '../../../src/app/store';
```

Add new describe blocks:

```typescript
describe('HandPanel type label', () => {
  it('shows type abbreviation for typed cards in hand', () => {
    // Set up with typed cards
    resetCardIds();
    const ph = [
      createCard(10, 10, 10, 10, CardType.Primal),
      createCard(10, 10, 10, 10, CardType.Scion),
      createCard(10, 10, 10, 10, CardType.Society),
      createCard(10, 10, 10, 10, CardType.Garlean),
      createCard(10, 10, 10, 10),
    ];
    const oh = makeOpponentHand();
    game.set({
      phase: 'setup',
      ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: false, descension: false },
      swap: false,
      threeOpen: false,
      playerHand: ph,
      opponentHand: oh,
      firstTurn: Owner.Player,
      history: [],
      selectedCard: null,
      unknownCardIds: new Set(),
    });
    startGame();
    rankedMoves.set(makeAllMoves(get(currentState)!.playerHand));

    render(HandPanel, { props: { owner: Owner.Player } });
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('Sc')).toBeInTheDocument();
    expect(screen.getByText('So')).toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
  });
});

describe('HandPanel modifier', () => {
  it('shows modifier for typed cards when Ascension is active and same-type cards are on the board', () => {
    resetCardIds();
    const primal1 = createCard(10, 10, 10, 10, CardType.Primal);
    const primal2 = createCard(10, 10, 10, 10, CardType.Primal);
    const ph = [primal1, primal2, createCard(10, 10, 10, 10), createCard(10, 10, 10, 10), createCard(10, 10, 10, 10)];
    const oh = makeOpponentHand();
    game.set({
      phase: 'setup',
      ruleset: { plus: false, same: false, reverse: false, fallenAce: false, ascension: true, descension: false },
      swap: false,
      threeOpen: false,
      playerHand: ph,
      opponentHand: oh,
      firstTurn: Owner.Player,
      history: [],
      selectedCard: null,
      unknownCardIds: new Set(),
    });
    startGame();

    // Place primal1 at position 0 (now a Primal card is on the board)
    const freshHand = get(currentState)!.playerHand;
    selectCard(freshHand[0]!);
    playCard(0);

    rankedMoves.set(makeAllMoves(get(currentState)!.opponentHand));

    // Render player hand — primal2 should show +1 modifier
    render(HandPanel, { props: { owner: Owner.Player } });
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('does not show modifier when Ascension/Descension are not active', () => {
    // Default setup has no ascension/descension — already tested by existing tests
    // that don't expect modifier text. Just verify explicitly.
    render(HandPanel, { props: { owner: Owner.Player } });
    expect(screen.queryByText(/^\+\d$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^-\d$/)).not.toBeInTheDocument();
  });
});
```

Also add `resetCardIds` to imports:

```typescript
import { createCard, Owner, Outcome, CardType, type Card, type RankedMove, resetCardIds } from '../../../src/engine';
```

And add `playCard` to the store import:

```typescript
import { game, startGame, selectCard, playCard, rankedMoves, currentState, updateThreeOpen, revealCard, updateRuleset } from '../../../src/app/store';
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/app/components/HandPanel.test.ts`

Expected: FAIL — no type label or modifier rendered on hand cards.

- [x] **Step 3: Implement type label and modifier on HandPanel**

In `src/app/components/game/HandPanel.svelte`, add imports:

```typescript
import { typeAbbrev, typeColor, boardTypeCount } from '../../card-display';
import type { GameState, RuleSet } from '../../../engine';
```

`game` and `currentState` are already imported from the store. Add a helper function in the script block that takes explicit parameters (rather than reading stores directly inside the function body) so Svelte 5's template reactivity can track the dependencies:

```typescript
function getModifier(card: Card, state: GameState | null, ruleset: RuleSet): number | null {
  if (!state || !typeAbbrev[card.type]) return null;
  if (!ruleset.ascension && !ruleset.descension) return null;
  const count = boardTypeCount(state, card.type);
  if (count === 0) return null;
  return ruleset.ascension ? count : -count;
}
```

The `typeAbbrev[card.type]` check filters out `CardType.None` (returns `undefined`).

Update the template for known cards (lines 66–75). Replace the card value grid with one that includes type label and modifier:

```svelte
{:else}
  {@const abbr = typeAbbrev[card.type]}
  {@const colorClass = typeColor[card.type]}
  {@const mod = getModifier(card, $currentState, $game.ruleset)}
  <div class="relative col-span-3 row-span-3 grid grid-cols-3">
    {#if mod}
      <div class="absolute top-0 left-0.5 text-[10px] font-semibold {mod > 0 ? 'text-eval-win' : 'text-eval-loss'}">
        {mod > 0 ? '+' : ''}{mod}
      </div>
    {/if}
    {#if abbr}
      <div class="absolute top-0 right-0.5 text-[10px] font-semibold {colorClass}">{abbr}</div>
    {/if}
    <div></div>
    <div class="flex items-center justify-center">{card.top === 10 ? 'A' : card.top}</div>
    <div></div>
    <div class="flex items-center justify-center">{card.left === 10 ? 'A' : card.left}</div>
    <div></div>
    <div class="flex items-center justify-center">{card.right === 10 ? 'A' : card.right}</div>
    <div></div>
    <div class="flex items-center justify-center">{card.bottom === 10 ? 'A' : card.bottom}</div>
    <div></div>
  </div>
{/if}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/app/components/HandPanel.test.ts`

Expected: All tests pass.

- [x] **Step 5: Run all UI tests for regressions**

Run: `bunx vitest run`

Expected: All tests pass.

- [x] **Step 6: Commit**

```
git add src/app/components/game/HandPanel.svelte tests/app/components/HandPanel.test.ts
git commit -m 'feat(HandPanel): show card type labels and Ascension/Descension modifiers'
```

---

## Task 13: Card Display — Wire Modifier into Board Component

**Files:**
- Modify: `src/app/components/game/Board.svelte`

The Board component creates BoardCell instances. It needs to compute and pass the `modifier` prop to each BoardCell when Ascension or Descension is active.

- [x] **Step 1: Read Board.svelte to understand current structure**

Read: `src/app/components/game/Board.svelte`

Note the pattern for how it renders cells and what props it passes to BoardCell.

- [x] **Step 2: Wire modifier computation into Board**

In `src/app/components/game/Board.svelte`, add imports:

```typescript
import { boardTypeCount, typeAbbrev } from '../../card-display';
```

For each cell that has a placed card, compute the modifier:

```typescript
import { boardTypeCount, typeAbbrev } from '../../card-display';
import type { BoardCell as BoardCellData, GameState, RuleSet } from '../../../engine';

function getCellModifier(cell: BoardCellData, state: GameState | null, ruleset: RuleSet): number | null {
  if (!state || !cell || !typeAbbrev[cell.card.type]) return null;
  if (!ruleset.ascension && !ruleset.descension) return null;
  const count = boardTypeCount(state, cell.card.type);
  if (count === 0) return null;
  return ruleset.ascension ? count : -count;
}
```

Pass the store values explicitly in the template so Svelte 5 tracks the reactive dependencies:

```svelte
modifier={getCellModifier(cell, $currentState, $game.ruleset)}
```

as a prop to each `<BoardCell>` in the template. The `$currentState` and `$game.ruleset` reads in the template expression ensure re-evaluation when game state changes.

- [x] **Step 3: Run Board tests and full test suite**

Run: `bunx vitest run`

Expected: All tests pass.

- [x] **Step 4: Commit**

```
git add src/app/components/game/Board.svelte
git commit -m 'feat(Board): pass Ascension/Descension modifier to BoardCell'
```

---

## Task 14: Final Verification

- [x] **Step 1: Run all TypeScript tests**

Run: `bun run test`

Expected: All tests pass.

- [x] **Step 2: Run type check**

Run: `bunx tsc --noEmit`

Expected: No type errors.

- [x] **Step 3: Run Rust tests**

Run: `cargo test --features server --manifest-path engine-rs/Cargo.toml -- --skip benchmark`

Expected: All tests pass.

- [x] **Step 4: Visual smoke test**

Start the dev server and verify:
1. Undo button is disabled at game start, enabled after a move
2. Reset button returns to setup with player hand preserved
3. Switching to server mode populates URL with `http://127.0.0.1:8080`
4. Blurring the URL input shows health check status
5. Card type labels appear on board and hand cards
6. Modifiers appear when Ascension/Descension is active and same-type cards are on the board

- [x] **Step 5: Final commit if any fixes were needed**

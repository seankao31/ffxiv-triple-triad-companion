# QoL Features Implementation Decisions

Decisions made during the QoL features implementation (2026-03-24).

---

## Undo Guard: No-Op vs. Error

**Decision:** `undoMove()` silently returns the current state when `history.length <= 1`. The Undo button is disabled via a `canUndo` derived store.

**Rejected:** Throwing an error on invalid undo, or popping to an empty history and transitioning to setup phase.

**Why:** The old behavior (popping to empty history → setup phase) was confusing because Undo doubled as "exit game." With Reset now handling the exit-to-setup transition, Undo should only undo moves. A silent no-op is better than an error because the disabled button already communicates "nothing to undo" — an error would be redundant and disruptive.

The `canUndo` derived store and the `undoMove` guard use the same threshold (`history.length > 1` / `<= 1`), providing defense-in-depth: even if the button somehow fires while disabled, the store guard prevents invalid state.

---

## Reset: Spread-and-Override Pattern

**Decision:** `resetGame()` uses `...s` (spread) and explicitly overrides only the fields that need clearing: `phase`, `opponentHand`, `history`, `selectedCard`, `unknownCardIds`.

**Rejected:** Reconstructing the full `AppState` object from scratch.

**Why:** The spread approach means new fields added to `AppState` in the future are preserved by default. Since new fields are more likely to be "settings" (preserved) than "transient game state" (cleared), this is the safer default. Clearing `opponentHand` to `[null, null, null, null, null]` is correct because the next game may have different opponent cards (common in Triple Triad where you face different opponents).

---

## Reset: Preserving Player Hand

**Decision:** `resetGame()` preserves `playerHand` as-is from the game state. The preserved Card objects still carry IDs from the active game, but this is safe because `startGame()` calls `resetCardIds()` and re-creates all cards with fresh IDs.

**Why:** In Triple Triad, players typically use the same deck across multiple games. Preserving the hand eliminates redundant re-entry of 20 stat values. The opponent hand is cleared because opponents change between games.

---

## Server URL: 127.0.0.1 vs localhost

**Decision:** Default server URL is `http://127.0.0.1:8080`, not `http://localhost:8080`.

**Why:** On macOS, `localhost` may resolve to `::1` (IPv6) depending on system configuration. The Rust server binds to `127.0.0.1` (IPv4). Using the IP address directly avoids DNS resolution mismatches. This is a common gotcha with local development servers.

---

## Health Check: lastCheckedUrl Caching

**Decision:** The health check stores `lastCheckedUrl` and skips re-checking if the URL hasn't changed since the last check.

**Tradeoff:** If a health check fails, the user must edit the URL (even trivially, like adding/removing a trailing slash) before re-checking. This was accepted because:
1. The common case is checking a new URL, not retrying the same one
2. Avoiding unnecessary network requests on repeated blur events is valuable
3. Adding a manual "retry" button was out of scope for this QoL pass

---

## Health Check: Non-Blocking

**Decision:** The health check indicator is purely informational. It does not gate `startGame()` or prevent the user from proceeding with an unreachable server.

**Why:** The user may start a game in WASM mode and switch to server mode later, or the server may start after the URL is entered. Blocking would create a chicken-and-egg problem. The inline indicator provides sufficient feedback.

---

## Card Display: Shared Module Extraction

**Decision:** `typeAbbrev`, `typeColor`, `boardTypeCount`, and `cardModifier` live in `src/app/card-display.ts`. SolverPanel, BoardCell, HandPanel, and Board all import from this single source.

**Rejected:** Keeping local copies in each component (the pre-existing pattern in SolverPanel).

**Why:** The same maps are needed in 4 components. Duplication invites drift (e.g., changing an abbreviation in one place but not another). The shared module also houses `cardModifier`, which was initially implemented as separate functions in HandPanel (`getModifier`) and Board (`getCellModifier`) — these were consolidated during code review to eliminate duplication per CLAUDE.md rules.

---

## Card Modifier: Display vs. Capture Semantics

**Decision:** The modifier overlay shows the *current* board state count (changes every turn), while the capture logic in `board.ts` uses a pre-placement snapshot.

**Why:** These serve different purposes. The display modifier answers "what would this card's modifier be right now?" — useful for the player to see at a glance. The capture logic uses a snapshot to ensure correct game mechanics (the placing card shouldn't count itself in the tally). The display semantics were chosen to match the player's mental model: "I see +2 on my Primal card because there are 2 Primals on the board."

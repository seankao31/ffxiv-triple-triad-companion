# PIMC Redundant Recomputation

**Status:** Documented — not yet acted on

## Observation

In Three Open mode, a full PIMC batch (50 simulations × ~5.5s each) is triggered on
**every move**, even when no new information is revealed (i.e., `unknownCardIds` doesn't
change). This happens because `currentState` is derived from `history`, `playCard` pushes
a new state, and the `currentState.subscribe` callback calls `triggerSolve`
unconditionally.

## Current behavior

| Scenario                            | Solver path            | TT reuse? |
|-------------------------------------|------------------------|-----------|
| All Open (no unknowns)              | `persistentSolver`     | Yes — TT persists across turns (200× turn-2 speedup) |
| Three Open, card revealed this turn | PIMC `wasm_simulate`   | No — fresh TT per simulation |
| Three Open, no reveal this turn     | PIMC `wasm_simulate`   | No — full PIMC re-runs from scratch |

The third row is the redundancy: the candidate pool, unknown set, and sampling logic are
identical to the previous turn's PIMC — only the game tree is smaller (one fewer move).

## Why TT reuse doesn't apply to PIMC

Each of the 50 simulations solves a **different game** (randomly sampled unknown cards),
so TT entries from one sampled world are invalid for another. Cross-simulation reuse is
unsound.

Cross-turn reuse within the same simulation is also impractical: each turn re-samples the
unknowns, producing a different game tree than the previous turn's simulation.

## Potential optimization

When no cards are revealed between turns, one could skip re-running PIMC and instead
reuse or adapt the previous turn's aggregated results. The previous results were computed
over the same unknown distribution, just from a larger game tree — so the top-move
recommendation may still be valid (or at least a strong prior).

Options to explore:

1. **Skip PIMC entirely** when `unknownCardIds` is unchanged between turns — reuse
   previous `rankedMoves`. Simplest but gives up the benefit of a shallower search tree.

2. **Run a reduced PIMC batch** (e.g., 10 sims instead of 50) as a "confirmation" pass,
   blending with the prior results.

3. **Cache per-simulation TTs** within a turn and seed the next turn's sims with them.
   Complex and memory-heavy (50 × 64MB = 3.2GB), likely not viable in WASM.

## Why we're not acting on this yet

The total solve time for later turns may already be fast enough (the game tree shrinks
quickly) that the recomputation is acceptable. Premature optimization here adds complexity
to the store's solve-triggering logic without a confirmed user-facing problem. Revisit if
PIMC latency on mid-game turns proves to be a bottleneck.

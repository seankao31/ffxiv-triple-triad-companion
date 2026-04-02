// ABOUTME: Public API for the Triple Triad Rust engine.
// ABOUTME: Re-exports core types and functions for WASM and native targets.

pub mod types;
pub mod board;
pub mod solver;
#[cfg(feature = "server")]
pub mod pimc;

use wasm_bindgen::prelude::*;
use solver::Solver;

/// WASM entry point: accepts a JSON-serialized GameState, returns JSON-serialized Vec<RankedMove>.
#[wasm_bindgen]
pub fn wasm_solve(state_json: &str) -> String {
    let state: types::GameState = serde_json::from_str(state_json)
        .expect("wasm_solve: invalid state JSON");
    let moves = solver::find_best_move(&state);
    serde_json::to_string(&moves).expect("wasm_solve: serialization failed")
}

/// WASM persistent solver: holds a transposition table across calls for the same game.
/// Call reset() when starting a new game so the TT does not carry stale entries.
/// For PIMC simulations (parallel, independent) use wasm_simulate instead.
#[derive(Default)]
#[wasm_bindgen]
pub struct WasmSolver {
    inner: Solver,
}

#[wasm_bindgen]
impl WasmSolver {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmSolver {
        WasmSolver::default()
    }
}

#[wasm_bindgen]
impl WasmSolver {

    /// Clears the transposition table. Call at the start of each new game.
    pub fn reset(&mut self) {
        self.inner.reset();
    }

    /// Returns the number of occupied TT slots (for testing persistence).
    pub fn tt_size(&self) -> usize {
        self.inner.tt_size()
    }

    /// Solves the state and returns JSON-serialized Vec<RankedMove>.
    pub fn solve(&mut self, state_json: &str) -> String {
        let state: types::GameState = serde_json::from_str(state_json)
            .expect("WasmSolver.solve: invalid state JSON");
        let moves = self.inner.solve(&state);
        serde_json::to_string(&moves).expect("WasmSolver.solve: serialization failed")
    }
}

/// WASM PIMC entry point: accepts a JSON-serialized fully-resolved GameState,
/// runs one negamax simulation with a fresh TT, returns the top RankedMove as JSON (or "null").
#[wasm_bindgen]
pub fn wasm_simulate(state_json: &str) -> String {
    let state: types::GameState = serde_json::from_str(state_json)
        .expect("wasm_simulate: invalid state JSON");
    let moves = solver::find_best_move(&state);  // fresh TT per call
    let top = moves.into_iter().next();
    serde_json::to_string(&top).expect("wasm_simulate: serialization failed")
}

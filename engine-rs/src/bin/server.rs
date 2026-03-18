// ABOUTME: Native Axum HTTP server binary for high-performance solver access.
// ABOUTME: Exposes POST /api/solve — handles both All Open (minimax) and Three Open (PIMC).

use axum::{routing::post, Json, Router};
use engine_rs::pimc::{run_pimc, PIMCCard};
use engine_rs::types::{GameState, RankedMove};
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};

/// Request body for POST /api/solve.
/// If `unknown_card_ids` is empty, runs a single minimax solve (All Open).
/// If non-empty, runs PIMC with `sim_count` parallel simulations (Three Open).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SolveRequest {
    state: GameState,
    #[serde(default)]
    unknown_card_ids: Vec<u8>,
    /// Pre-filtered candidate card pool; sent by the TypeScript client from cards.json.
    #[serde(default)]
    card_pool: Vec<PIMCCard>,
    /// Remaining five-star budget for unknown slots (computed by TypeScript client).
    #[serde(default = "default_max_five")]
    max_five_stars: u8,
    /// Remaining four-star budget for unknown slots (computed by TypeScript client).
    #[serde(default = "default_max_four")]
    max_four_stars: u8,
    /// Number of PIMC simulations to run. Defaults to 50.
    #[serde(default = "default_sim_count")]
    sim_count: usize,
}

fn default_max_five() -> u8 { 1 }
fn default_max_four() -> u8 { 2 }
fn default_sim_count() -> usize { 50 }

#[derive(Serialize)]
struct SolveResponse {
    moves: Vec<RankedMove>,
}

async fn solve(Json(req): Json<SolveRequest>) -> Json<SolveResponse> {
    let moves = if req.unknown_card_ids.is_empty() {
        engine_rs::solver::find_best_move(&req.state)
    } else {
        run_pimc(
            &req.state,
            &req.unknown_card_ids,
            &req.card_pool,
            req.max_five_stars,
            req.max_four_stars,
            req.sim_count,
        )
    };
    Json(SolveResponse { moves })
}

#[tokio::main]
async fn main() {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new().route("/api/solve", post(solve)).layer(cors);

    let addr = "127.0.0.1:8080";
    let listener = tokio::net::TcpListener::bind(addr).await.expect("failed to bind");
    println!("Triple Triad solver server listening on http://{addr}");
    axum::serve(listener, app).await.expect("server error");
}

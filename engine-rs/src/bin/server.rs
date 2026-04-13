// ABOUTME: Native Axum HTTP server binary for high-performance solver access.
// ABOUTME: Exposes POST /api/solve — handles both All Open (negamax) and Three Open (PIMC).

use axum::{routing::{get, post}, Json, Router};
use clap::Parser;
use engine_rs::pimc::{run_pimc, PIMCCard};
use engine_rs::types::{Card, CardType, GameState, Owner, RankedMove, RuleSet};
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

#[derive(Parser)]
#[command(about = "Triple Triad solver server")]
struct Cli {
    /// Port to listen on
    #[arg(short, long, default_value_t = 8080)]
    port: u16,
}

/// GameState variant used for deserialization where opponent cards may be unknown (null).
/// Mirrors GameState but accepts null entries in opponent_hand for Three Open mode.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NullableGameState {
    board: engine_rs::types::Board,
    player_hand: Vec<Card>,
    opponent_hand: Vec<Option<Card>>,
    current_turn: Owner,
    rules: RuleSet,
    #[serde(default)]
    forced_card_id: Option<u8>,
}

/// Request body for POST /api/solve.
/// If `unknown_card_ids` is empty, runs a single negamax solve (All Open).
/// If non-empty, runs PIMC with `sim_count` parallel simulations (Three Open).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SolveRequest {
    state: NullableGameState,
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

/// Converts a NullableGameState to a GameState, replacing null opponent cards with placeholders.
/// Returns the resolved GameState and the IDs of placeholder (unknown) cards.
///
/// If `explicit_ids` is non-empty, uses those as the unknown_card_ids without deriving from nulls.
/// Otherwise, assigns fresh IDs (from the lowest available, < 15) to each null slot.
fn resolve_nulls(state: NullableGameState, explicit_ids: Vec<u8>) -> (GameState, Vec<u8>) {
    // Collect IDs already in use to avoid collisions when assigning placeholder IDs.
    let mut used_ids: std::collections::HashSet<u8> = std::collections::HashSet::new();
    for card in &state.player_hand {
        used_ids.insert(card.id);
    }
    for card in state.opponent_hand.iter().flatten() {
        used_ids.insert(card.id);
    }
    for placed in state.board.iter().flatten() {
        used_ids.insert(placed.card.id);
    }

    let use_explicit = !explicit_ids.is_empty();
    let mut explicit_iter = explicit_ids.iter().copied();
    let mut derived_ids: Vec<u8> = Vec::new();
    let mut next_id: u8 = 0;

    let opponent_hand: Vec<Card> = state
        .opponent_hand
        .into_iter()
        .map(|opt| match opt {
            Some(card) => card,
            None => {
                let id = if use_explicit {
                    explicit_iter.next().expect("not enough explicit_ids for null slots")
                } else {
                    // Advance to next unused ID within solver encoding limit.
                    while next_id < 15 && used_ids.contains(&next_id) {
                        next_id += 1;
                    }
                    assert!(next_id < 15, "ran out of available card IDs for placeholder (all 0–14 in use)");
                    let id = next_id;
                    used_ids.insert(id);
                    next_id += 1;
                    id
                };
                derived_ids.push(id);
                Card { id, top: 0, right: 0, bottom: 0, left: 0, card_type: CardType::None }
            }
        })
        .collect();

    let unknown_card_ids = if use_explicit { explicit_ids } else { derived_ids };

    let game_state = GameState {
        board: state.board,
        player_hand: state.player_hand,
        opponent_hand,
        current_turn: state.current_turn,
        rules: state.rules,
        forced_card_id: state.forced_card_id,
    };

    (game_state, unknown_card_ids)
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn solve(Json(req): Json<SolveRequest>) -> Json<SolveResponse> {
    let sim_count = req.sim_count;
    let (state, unknown_card_ids) = resolve_nulls(req.state, req.unknown_card_ids);
    let start = Instant::now();
    let moves = if unknown_card_ids.is_empty() {
        let result = engine_rs::solver::find_best_move(&state);
        let duration_ms = start.elapsed().as_millis();
        info!(mode = "all_open", duration_ms, moves = result.len(), "solve complete");
        result
    } else {
        let unknown_cards = unknown_card_ids.len();
        let pool_size = req.card_pool.len();
        let result = run_pimc(
            &state,
            &unknown_card_ids,
            &req.card_pool,
            req.max_five_stars,
            req.max_four_stars,
            sim_count,
        );
        let duration_ms = start.elapsed().as_millis();
        info!(
            mode = "pimc",
            sim_count,
            unknown_cards,
            pool_size,
            duration_ms,
            moves = result.len(),
            "solve complete"
        );
        result
    };
    Json(SolveResponse { moves })
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "server=info".parse().unwrap()),
        )
        .init();

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
    info!(port = cli.port, "Triple Triad solver server listening on http://{addr}");
    axum::serve(listener, app).await.expect("server error");
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_rs::types::CardType;

    fn make_card(id: u8) -> Card {
        Card { id, top: 5, right: 5, bottom: 5, left: 5, card_type: CardType::None }
    }

    fn make_nullable_state(
        player_hand: Vec<Card>,
        opponent_hand: Vec<Option<Card>>,
    ) -> NullableGameState {
        NullableGameState {
            board: [None; 9],
            player_hand,
            opponent_hand,
            current_turn: Owner::Player,
            rules: RuleSet::default(),
            forced_card_id: None,
        }
    }

    #[test]
    fn resolve_nulls_derives_unknown_ids_from_null_positions() {
        // When opponentHand has nulls and no explicit unknownCardIds,
        // null positions become placeholder cards and their IDs are inferred.
        let state = make_nullable_state(
            vec![make_card(0)],
            vec![None, None],
        );
        let (resolved_state, ids) = resolve_nulls(state, vec![]);
        assert_eq!(ids.len(), 2);
        assert_eq!(resolved_state.opponent_hand.len(), 2);
        // Each derived ID should correspond to a card in the resolved hand.
        for id in &ids {
            assert!(
                resolved_state.opponent_hand.iter().any(|c| c.id == *id),
                "placeholder card with id {} not found in resolved hand",
                id
            );
        }
        // Derived IDs must not collide with player card IDs.
        let player_ids: Vec<u8> = resolved_state.player_hand.iter().map(|c| c.id).collect();
        for id in &ids {
            assert!(!player_ids.contains(id), "placeholder id {} collides with player card", id);
        }
    }

    #[test]
    fn resolve_nulls_preserves_explicit_ids_when_no_nulls() {
        // When no nulls, explicit unknownCardIds are passed through unchanged.
        let card = make_card(5);
        let state = make_nullable_state(vec![make_card(0)], vec![Some(card)]);
        let (resolved_state, ids) = resolve_nulls(state, vec![5]);
        assert_eq!(ids, vec![5]);
        assert_eq!(resolved_state.opponent_hand[0].id, 5);
    }

    #[test]
    fn resolve_nulls_full_null_hand_assigns_non_colliding_ids() {
        // Five null opponent cards — player holds IDs 0–4, placeholders must use 5–9.
        let player_hand: Vec<Card> = (0..5).map(make_card).collect();
        let state = make_nullable_state(
            player_hand,
            vec![None, None, None, None, None],
        );
        let (resolved_state, ids) = resolve_nulls(state, vec![]);
        assert_eq!(ids.len(), 5);
        // All placeholder IDs must be < 15 and distinct from player IDs 0-4.
        for id in &ids {
            assert!(*id < 15, "placeholder id {} exceeds solver encoding limit", id);
            assert!(*id >= 5, "placeholder id {} collides with player hand range 0-4", id);
        }
        // All placeholder IDs must be distinct.
        let unique: std::collections::HashSet<u8> = ids.iter().copied().collect();
        assert_eq!(unique.len(), 5);
        // Each placeholder ID matches a card in the resolved hand.
        for id in &ids {
            assert!(resolved_state.opponent_hand.iter().any(|c| c.id == *id));
        }
    }

    #[test]
    fn resolve_nulls_explicit_ids_are_used_as_placeholder_card_ids() {
        // When explicit_ids is provided with null slots, the placeholder cards
        // must carry those exact IDs so PIMC can locate them.
        let state = make_nullable_state(
            vec![make_card(0)],
            vec![None, None],
        );
        let (resolved, ids) = resolve_nulls(state, vec![7, 8]);
        assert_eq!(ids, vec![7, 8]);
        assert_eq!(resolved.opponent_hand[0].id, 7);
        assert_eq!(resolved.opponent_hand[1].id, 8);
    }

    #[test]
    fn resolve_nulls_mixed_known_and_null_opponent_cards() {
        // Some opponent cards are known, some are null — only nulls become placeholders.
        let state = make_nullable_state(
            vec![make_card(0)],
            vec![Some(make_card(1)), None, Some(make_card(3))],
        );
        let (resolved_state, ids) = resolve_nulls(state, vec![]);
        assert_eq!(ids.len(), 1, "only one null, so one unknown id");
        assert_eq!(resolved_state.opponent_hand.len(), 3);
        assert_eq!(resolved_state.opponent_hand[0].id, 1, "known card preserved");
        assert_eq!(resolved_state.opponent_hand[2].id, 3, "known card preserved");
        // The placeholder must not collide with IDs 0, 1, or 3.
        assert!(!ids.contains(&0));
        assert!(!ids.contains(&1));
        assert!(!ids.contains(&3));
    }

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

    /// Helper: POST JSON to /api/solve via tower oneshot, return (status, body).
    async fn post_solve(body: serde_json::Value) -> (axum::http::StatusCode, Vec<u8>) {
        use tower::ServiceExt;
        use http_body_util::BodyExt;

        let app = Router::new().route("/api/solve", axum::routing::post(solve));
        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/api/solve")
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(serde_json::to_vec(&body).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes().to_vec();
        (status, body)
    }

    /// Helper: build a minimal All Open solve request (1 card each, fast solve).
    fn make_all_open_request() -> serde_json::Value {
        serde_json::json!({
            "state": {
                "board": [null, null, null, null, null, null, null, null, null],
                "playerHand": [
                    {"id": 0, "top": 9, "right": 9, "bottom": 9, "left": 9, "type": "none"}
                ],
                "opponentHand": [
                    {"id": 1, "top": 1, "right": 1, "bottom": 1, "left": 1, "type": "none"}
                ],
                "currentTurn": "player",
                "rules": { "same": false, "plus": false, "fallenAce": false, "reverse": false, "ascension": false, "descension": false, "order": false, "chaos": false }
            }
        })
    }

    #[tokio::test]
    #[tracing_test::traced_test]
    async fn solve_all_open_logs_mode_and_duration() {
        let (status, _body) = post_solve(make_all_open_request()).await;
        assert_eq!(status, axum::http::StatusCode::OK);
        assert!(logs_contain("mode=\"all_open\""));
        assert!(logs_contain("duration_ms"));
    }

    #[tokio::test]
    #[tracing_test::traced_test]
    async fn solve_pimc_logs_mode_and_params() {
        let req = serde_json::json!({
            "state": {
                "board": [null, null, null, null, null, null, null, null, null],
                "playerHand": [
                    {"id": 0, "top": 9, "right": 9, "bottom": 9, "left": 9, "type": "none"}
                ],
                "opponentHand": [null],
                "currentTurn": "player",
                "rules": { "same": false, "plus": false, "fallenAce": false, "reverse": false, "ascension": false, "descension": false, "order": false, "chaos": false }
            },
            "cardPool": [
                {"id": 1, "top": 1, "right": 1, "bottom": 1, "left": 1, "type": "none", "stars": 1, "owned": 1.0}
            ],
            "simCount": 5
        });
        let (status, _body) = post_solve(req).await;
        assert_eq!(status, axum::http::StatusCode::OK);
        assert!(logs_contain("mode=\"pimc\""));
        assert!(logs_contain("sim_count=5"));
        assert!(logs_contain("unknown_cards=1"));
        assert!(logs_contain("duration_ms"));
    }

    #[tokio::test]
    #[tracing_test::traced_test]
    async fn solve_logs_move_count() {
        let (status, _body) = post_solve(make_all_open_request()).await;
        assert_eq!(status, axum::http::StatusCode::OK);
        assert!(logs_contain("moves="));
    }
}

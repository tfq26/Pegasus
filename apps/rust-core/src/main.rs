mod ai;
mod db;
mod handlers;
mod models;
mod services;
mod utils;

use axum::{routing::get, routing::post, Router};
use reqwest::Client;
use std::{collections::HashMap, env, net::SocketAddr, sync::Arc};
use tower_http::cors::{Any, CorsLayer, AllowOrigin};
use tower_http::trace::TraceLayer;
use tracing::info;

use models::{RegisteredSource, SemanticCacheItem};

/// Shared application state available to all route handlers.
#[derive(Clone)]
pub struct AppState {
    pub py_base_url: String,
    pub http: Client,
    pub source_registry: Arc<std::sync::RwLock<HashMap<String, RegisteredSource>>>,
    pub semantic_cache: Arc<std::sync::RwLock<Vec<SemanticCacheItem>>>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            env::var("RUST_LOG").unwrap_or_else(|_| "rust_core=debug,tower_http=info".to_string()),
        )
        .init();

    let py_base_url = env::var("PY_INTELLIGENCE_URL").unwrap_or_else(|_| "http://127.0.0.1:8090".to_string());
    let source_registry = Arc::new(std::sync::RwLock::new(services::load_source_registry()));
    let semantic_cache = Arc::new(std::sync::RwLock::new(Vec::new()));
    let state = Arc::new(AppState {
        py_base_url,
        http: Client::new(),
        source_registry,
        semantic_cache,
    });

    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/v1/answers", post(handlers::answer))
        .route("/v1/semantic/similarity", post(handlers::compute_similarity))
        .route("/v1/table/clean", post(handlers::compute_table_clean))
        .route("/v1/table/profile", post(handlers::compute_table_profile))
        .route("/v1/analytics/stats", post(handlers::compute_analytics_stats))
        .route("/v1/intent/compile", post(handlers::compute_intent_compile))
        .route("/v1/query/heal", post(handlers::heal_query))
        .route("/v1/schema/relations", post(handlers::analyze_schema_relations))
        .route("/v1/table/pivot", post(handlers::compute_table_pivot))
        .route("/v1/connector/fetch", post(handlers::fetch_source))
        .route("/v1/cache/clear", post(handlers::clear_cache))
.layer(
        CorsLayer::new()
            .allow_origin(AllowOrigin::mirror_request())
            .allow_methods(Any)
            .allow_headers(Any)
            .allow_credentials(true)
    )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let bind_port = env::var("RUST_PORT").unwrap_or_else(|_| "8787".to_string());
    let bind_addr = format!("127.0.0.1:{}", bind_port);
    let addr: SocketAddr = bind_addr.parse().expect("invalid bind address");
    info!("rust-core listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind rust-core listener");
    axum::serve(listener, app).await.unwrap();
}

use std::sync::Arc;
use axum::{extract::State, Json};
use tracing::{error, info};

use crate::AppState;
use crate::models::{
    AnswerRequest, AnswerResponse, SemanticCacheItem,
    SimilarityRequest, SimilarityResponse,
    TableCleanRequest, TableCleanResponse,
    TableProfileRequest, TableProfileResponse,
    AnalyticsStatsRequest, AnalyticsStatsResponse,
    IntentCompileRequest, IntentCompileResponse,
    QueryHealRequest, QueryHealResponse,
    SchemaRelationRequest, SchemaRelationResponse,
    TablePivotRequest, TablePivotResponse,
    FetchSourcePayload, FetchSourceResponse,
    PythonRankRequest, RegisteredSource,
};
use crate::services;
use crate::utils::jaccard_similarity;
use crate::ai;

// ── Health ───────────────────────────────────────────────────────

pub async fn health() -> Json<serde_json::Value> {
    serde_json::json!({ "ok": true, "service": "rust-core" }).into()
}

// ── Answer (RAG) ─────────────────────────────────────────────────

#[axum::debug_handler]
pub async fn answer(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AnswerRequest>,
) -> Result<Json<AnswerResponse>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    if let Err(error_payload) = services::validate_request(&req) {
        return Err((axum::http::StatusCode::BAD_REQUEST, Json(error_payload)));
    }

    let (effective_prompt, effective_sources, reply_to_id) = if let Some(envelope) = req.envelope {
        (envelope.prompt, envelope.selected_sources, envelope.reply_to.map(|r| r.message_id))
    } else {
        (req.prompt.unwrap_or_default(), req.selected_sources.unwrap_or_default(), None)
    };

    // Semantic cache check
    {
        let cache = state.semantic_cache.read().unwrap();
        for item in cache.iter() {
            if jaccard_similarity(&item.prompt, &effective_prompt) >= 0.88 {
                info!("Semantic Cache HIT for prompt: {}", effective_prompt);
                return Ok(Json(AnswerResponse {
                    answer: item.answer.clone(),
                    chosen_source_ids: item.chosen_source_ids.clone(),
                    evidence: item.evidence.clone(),
                    assumptions: item.assumptions.clone(),
                    confidence: item.confidence,
                    grounded: true,
                }));
            }
        }
    }

    if effective_sources.is_empty() {
        return Ok(Json(AnswerResponse {
            answer: "Please select a source with the source picker so I can ground the answer.".to_string(),
            chosen_source_ids: vec![],
            evidence: vec![],
            assumptions: vec!["No selected source object was provided.".to_string()],
            confidence: 0.0,
            grounded: false,
        }));
    }

    // Rank sources via Python
    let py_req = PythonRankRequest {
        question: effective_prompt.clone(),
        selected_sources: effective_sources.clone(),
        reply_to_message_id: reply_to_id.clone(),
    };

    let ranked = match ai::rank_evidence(&state.py_base_url, py_req).await {
        Ok(parsed) => parsed,
        Err(err) => {
            error!("python rank error: {}", err);
            services::fallback_rank(&effective_sources)
        }
    };

    let chosen = if ranked.selected_source_ids.is_empty() {
        vec![effective_sources[0].id.clone()]
    } else {
        ranked.selected_source_ids.clone()
    };

    let reply_note = reply_to_id
        .map(|id| format!(" Inline reply context: {}.", id))
        .unwrap_or_default();

    let chosen_sources = {
        let registry_guard = state.source_registry.read().unwrap();
        chosen.iter()
            .filter_map(|id| registry_guard.get(id).cloned())
            .collect::<Vec<RegisteredSource>>()
    };

    // Synthesize via Python
    let execution = ai::synthesize_sources(&state.http, &state.py_base_url, &chosen_sources, &effective_prompt).await;

    let response = AnswerResponse {
        answer: format!("{}{}", execution.answer, reply_note),
        chosen_source_ids: chosen.clone(),
        evidence: execution.evidence.clone(),
        assumptions: ranked.assumptions.clone(),
        confidence: ranked.confidence,
        grounded: true,
    };

    // Save to semantic cache
    {
        let mut cache = state.semantic_cache.write().unwrap();
        cache.push(SemanticCacheItem {
            prompt: effective_prompt.clone(),
            answer: response.answer.clone(),
            chosen_source_ids: response.chosen_source_ids.clone(),
            evidence: response.evidence.clone(),
            assumptions: response.assumptions.clone(),
            confidence: response.confidence,
        });
    }

    Ok(Json(response))
}

// ── Similarity ───────────────────────────────────────────────────

pub async fn compute_similarity(
    Json(req): Json<SimilarityRequest>,
) -> Json<SimilarityResponse> {
    Json(services::compute_similarity_scores(&req))
}

// ── Table Clean ──────────────────────────────────────────────────

pub async fn compute_table_clean(
    Json(req): Json<TableCleanRequest>,
) -> Json<TableCleanResponse> {
    Json(services::clean_table(&req))
}

// ── Table Profile ────────────────────────────────────────────────

pub async fn compute_table_profile(
    Json(req): Json<TableProfileRequest>,
) -> Json<TableProfileResponse> {
    Json(services::profile_table(&req))
}

// ── Analytics Stats ──────────────────────────────────────────────

pub async fn compute_analytics_stats(
    Json(req): Json<AnalyticsStatsRequest>,
) -> Json<AnalyticsStatsResponse> {
    Json(services::compute_stats(&req))
}

// ── Intent Compile ───────────────────────────────────────────────

pub async fn compute_intent_compile(
    Json(req): Json<IntentCompileRequest>,
) -> Json<IntentCompileResponse> {
    Json(services::compile_intent(&req))
}

// ── Query Heal ───────────────────────────────────────────────────

pub async fn heal_query(
    Json(req): Json<QueryHealRequest>,
) -> Json<QueryHealResponse> {
    Json(services::heal_query(&req))
}

// ── Schema Relations ─────────────────────────────────────────────

pub async fn analyze_schema_relations(
    Json(req): Json<SchemaRelationRequest>,
) -> Json<SchemaRelationResponse> {
    Json(services::analyze_schema_relations(&req))
}

// ── Table Pivot ──────────────────────────────────────────────────

pub async fn compute_table_pivot(
    Json(req): Json<TablePivotRequest>,
) -> Json<TablePivotResponse> {
    Json(services::pivot_table(&req))
}

// ── Fetch Source ─────────────────────────────────────────────────

pub async fn fetch_source(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<FetchSourcePayload>,
) -> Result<Json<FetchSourceResponse>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    info!("Fetching source: id={}, url={}, label={}", payload.id, payload.url, payload.label);

    let resp = match state.http.get(&payload.url).send().await {
        Ok(r) => r,
        Err(err) => {
            return Err((axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({
                "error": "network_error",
                "message": format!("failed to fetch URL: {}", err)
            }))));
        }
    };

    let bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(err) => {
            return Err((axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({
                "error": "body_error",
                "message": format!("failed to download file body: {}", err)
            }))));
        }
    };

    let text_content = String::from_utf8_lossy(&bytes).into_owned();
    let mut row_count = None;
    let mut char_count = None;

    let source = if payload.kind == "table" {
        let mut rows = Vec::new();
        let mut lines = text_content.lines();
        let headers: Vec<String> = if let Some(header_line) = lines.next() {
            header_line.split(',')
                .map(|s| s.trim().trim_matches('"').to_string())
                .collect()
        } else {
            return Err((axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({
                "error": "csv_error",
                "message": "empty CSV contents"
            }))));
        };

        for line in lines {
            let line = line.trim();
            if line.is_empty() { continue; }

            let mut fields = Vec::new();
            let mut in_quotes = false;
            let mut current = String::new();

            for c in line.chars() {
                if c == '"' { in_quotes = !in_quotes; }
                else if c == ',' && !in_quotes {
                    fields.push(current.trim().to_string());
                    current = String::new();
                } else { current.push(c); }
            }
            fields.push(current.trim().to_string());

            let mut row = std::collections::HashMap::new();
            for (i, header) in headers.iter().enumerate() {
                let value_str = fields.get(i).map(|s| s.trim_matches('"').trim()).unwrap_or("");
                let value = if let Ok(val) = value_str.parse::<f64>() {
                    serde_json::Value::from(val)
                } else if value_str.to_lowercase() == "true" { serde_json::Value::Bool(true) }
                else if value_str.to_lowercase() == "false" { serde_json::Value::Bool(false) }
                else { serde_json::Value::String(value_str.to_string()) };
                row.insert(header.clone(), value);
            }
            rows.push(row);
        }

        row_count = Some(rows.len());
        RegisteredSource {
            id: payload.id.clone(),
            kind: payload.kind.clone(),
            label: payload.label.clone(),
            trust_mode: Some("high".to_string()),
            table_data: Some(rows),
            document_text: None,
        }
    } else {
        char_count = Some(text_content.len());
        RegisteredSource {
            id: payload.id.clone(),
            kind: payload.kind.clone(),
            label: payload.label.clone(),
            trust_mode: Some("high".to_string()),
            table_data: None,
            document_text: Some(text_content),
        }
    };

    {
        let mut registry = state.source_registry.write().unwrap();
        registry.insert(payload.id.clone(), source.clone());
    }

    if let Err(err) = services::save_source_registry_to_file(&state.source_registry) {
        error!("failed to flush source registry to disk: {}", err);
    }

    Ok(Json(FetchSourceResponse {
        success: true,
        message: format!("Successfully fetched, parsed, and registered source: {}", payload.id),
        row_count,
        char_count,
    }))
}

// ── Clear Cache ──────────────────────────────────────────────────

pub async fn clear_cache(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let mut cache = state.semantic_cache.write().unwrap();
    cache.clear();
    Json(serde_json::json!({
        "success": true,
        "message": "Semantic cache successfully cleared"
    }))
}

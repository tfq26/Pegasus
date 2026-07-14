use std::collections::{HashMap, HashSet};
use std::{env, fs};

use tracing::error;

use crate::models::{
    ExecutionOutput, IntentCompileRequest, IntentCompileResponse,
    PythonRankResponse, QueryHealRequest, QueryHealResponse,
    SchemaRelationRequest, SchemaRelationResponse, SchemaMappingContext,
    NormalizedSchemaOut, MappingsOut,
    SingleIntent, IntentPayload, CompoundSqlResult,
    RegisteredSource, SourceRef, SourceRegistryFile,
    AnswerRequest, SimilarityRequest, SimilarityResponse, TableCleanRequest, TableCleanResponse,
    TableProfileRequest, TableProfileResponse, AnalyticsStatsRequest, AnalyticsStatsResponse,
    TablePivotRequest, TablePivotResponse,
    CleanedTable, CleanedTableMeta, CleanedStats, CleanedMeta,
    ColumnProfile, NumericRange, ProfileMeta, ColumnStats,
    SimilarityScore,
};

use crate::utils::{normalize_text, non_empty_entries, is_empty_row, looks_like_total_row,
    detect_repeated_header_row, first_meaningful_column, cosine_similarity, summarize_numeric_columns};

// ── Validation ──────────────────────────────────────────────────

pub fn validate_request(req: &AnswerRequest) -> Result<(), serde_json::Value> {
    if let Some(envelope) = &req.envelope {
        if envelope.version.trim().is_empty() {
            return Err(validation_error("envelope.version", "must be a non-empty string"));
        }
        if envelope.mode.trim().is_empty() {
            return Err(validation_error("envelope.mode", "must be a non-empty string"));
        }
        if envelope.prompt.trim().is_empty() {
            return Err(validation_error("envelope.prompt", "must be a non-empty string"));
        }
        if envelope.selected_sources.is_empty() {
            return Err(validation_error("envelope.selected_sources", "must include at least one source object"));
        }
        for (idx, source) in envelope.selected_sources.iter().enumerate() {
            if source.id.trim().is_empty() {
                return Err(validation_error(&format!("envelope.selected_sources[{}].id", idx), "must be a non-empty string"));
            }
            if source.kind.trim().is_empty() {
                return Err(validation_error(&format!("envelope.selected_sources[{}].type", idx), "must be a non-empty string"));
            }
            if source.label.trim().is_empty() {
                return Err(validation_error(&format!("envelope.selected_sources[{}].label", idx), "must be a non-empty string"));
            }
        }
        if let Some(context) = &envelope.context {
            if let Some(policy) = &context.source_selection_policy {
                if policy != "explicit_first" && policy != "hybrid_rank" {
                    return Err(validation_error(
                        "envelope.context.source_selection_policy",
                        "must be one of: explicit_first, hybrid_rank",
                    ));
                }
            }
        }
        return Ok(());
    }

    let prompt_ok = req.prompt.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false);
    if !prompt_ok {
        return Err(validation_error("prompt", "missing prompt; send envelope.prompt or legacy prompt"));
    }
    let sources = req.selected_sources.as_ref().cloned().unwrap_or_default();
    if sources.is_empty() {
        return Err(validation_error("selected_sources", "missing selected sources; send envelope.selected_sources or legacy selected_sources"));
    }
    Ok(())
}

pub fn validation_error(field: &str, message: &str) -> serde_json::Value {
    serde_json::json!({
        "error": "validation_error",
        "field": field,
        "message": message
    })
}

pub fn fallback_rank(selected_sources: &[SourceRef]) -> PythonRankResponse {
    PythonRankResponse {
        selected_source_ids: selected_sources.iter().take(1).map(|s| s.id.clone()).collect(),
        assumptions: vec!["Python intelligence unavailable, defaulted to first selected source.".to_string()],
        confidence: 0.65,
    }
}

// ── Source Registry (file-based, legacy) ────────────────────────

pub fn load_source_registry() -> HashMap<String, RegisteredSource> {
    let mut registry = HashMap::new();
    let path = env::var("SOURCE_REGISTRY_PATH")
        .unwrap_or_else(|_| "data/source_registry.json".to_string());
    match fs::read_to_string(&path) {
        Ok(content) => {
            if let Ok(parsed) = serde_json::from_str::<SourceRegistryFile>(&content) {
                for source in parsed.sources {
                    registry.insert(source.id.clone(), source);
                }
            }
        }
        Err(err) => {
            error!("failed to load source registry from {}: {}", path, err);
        }
    }
    registry
}

pub fn save_source_registry_to_file(registry_lock: &std::sync::RwLock<HashMap<String, RegisteredSource>>) -> std::io::Result<()> {
    let path = env::var("SOURCE_REGISTRY_PATH")
        .unwrap_or_else(|_| "data/source_registry.json".to_string());
    let registry = registry_lock.read().unwrap();
    let sources: Vec<RegisteredSource> = registry.values().cloned().collect();
    let file_payload = SourceRegistryFile { sources };
    let data = serde_json::to_string_pretty(&file_payload)?;
    fs::write(path, data)
}

// ── Source execution (fallback — no Python synthesis) ──────────

pub fn execute_sources(sources: &[RegisteredSource], prompt: &str) -> ExecutionOutput {
    let mut evidence = Vec::new();
    let mut parts = Vec::new();

    for source in sources {
        if let Some(rows) = &source.table_data {
            let row_count = rows.len();
            let columns = rows
                .first()
                .map(|row| row.keys().cloned().collect::<Vec<_>>().join(", "))
                .unwrap_or_else(|| "unknown columns".to_string());
            let numeric_sums = summarize_numeric_columns(rows);
            let numeric_line = if numeric_sums.is_empty() {
                "No numeric aggregations available.".to_string()
            } else {
                numeric_sums.iter()
                    .map(|(k, v)| format!("{} sum={:.2}", k, v))
                    .collect::<Vec<_>>()
                    .join("; ")
            };
            parts.push(format!(
                "From {}: {} rows across columns [{}]. {}",
                source.label, row_count, columns, numeric_line
            ));
            if let Some(sample) = rows.first() {
                evidence.push(format!("{} sample row: {}", source.label, serde_json::to_string(sample).unwrap_or_default()));
            }
        } else if let Some(text) = &source.document_text {
            let snippet = text.split('.').take(2).collect::<Vec<_>>().join(".").trim().to_string();
            parts.push(format!("From {}: {}", source.label, snippet));
            evidence.push(format!("{} excerpt: {}", source.label, snippet));
        }
    }

    if parts.is_empty() {
        return ExecutionOutput {
            answer: "I could not resolve executable content for the selected source IDs.".to_string(),
            evidence,
        };
    }

    let prompt_hint = if prompt.to_lowercase().contains("summary") || prompt.to_lowercase().contains("summarize") {
        "Summary:"
    } else {
        "Grounded response:"
    };

    ExecutionOutput {
        answer: format!("{} {}", prompt_hint, parts.join(" ")),
        evidence,
    }
}

// ── Similarity ──────────────────────────────────────────────────

pub fn compute_similarity_scores(req: &SimilarityRequest) -> SimilarityResponse {
    let query = &req.query_vector;
    let mut scores: Vec<SimilarityScore> = req.candidates.iter().map(|c| {
        let score = cosine_similarity(query, &c.embedding);
        SimilarityScore { id: c.id.clone(), score }
    }).collect();
    scores.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    SimilarityResponse { scores }
}

// ── Table Clean ─────────────────────────────────────────────────

pub fn clean_table(req: &TableCleanRequest) -> TableCleanResponse {
    let input_rows = &req.rows;
    let table_name = &req.table_name;
    if input_rows.is_empty() {
        return TableCleanResponse {
            tables: vec![],
            metadata: CleanedMeta {
                strategy: "none".to_string(),
                warnings: vec!["No rows to clean".to_string()],
            },
        };
    }

    let headers: Vec<String> = input_rows[0].keys().cloned().collect();

    let flat_score = {
        let singleton_rows = input_rows.iter().filter(|r| non_empty_entries(r).len() <= 1).count();
        let repeated_headers = input_rows.iter().filter(|r| detect_repeated_header_row(r, &headers)).count();
        let sum_density: usize = input_rows.iter().map(|r| non_empty_entries(r).len()).sum();
        let average_density = sum_density as f32 / input_rows.len() as f32;

        let mut score = 0.6;
        if headers.len() >= 2 { score += 0.1; }
        let density_threshold = 2.0f32.max(headers.len() as f32 / 3.0);
        if average_density >= density_threshold { score += 0.15; }
        score -= 0.2f32.min(singleton_rows as f32 / input_rows.len() as f32);
        score -= 0.15f32.min(repeated_headers as f32 / input_rows.len() as f32);
        score.max(0.0).min(1.0)
    };

    let primary_column = first_meaningful_column(&headers, input_rows);
    let report_score = {
        let singleton_rows = input_rows.iter().filter(|r| {
            let entries = non_empty_entries(r);
            entries.len() == 1 && entries[0].0 == &primary_column
        }).count();
        let total_rows = input_rows.iter().filter(|r| looks_like_total_row(r)).count();
        let repeated_headers = input_rows.iter().filter(|r| detect_repeated_header_row(r, &headers)).count();

        let signal = (singleton_rows + total_rows + repeated_headers) as f32 / input_rows.len() as f32;
        (0.35 + signal * 2.2).max(0.0).min(1.0)
    };

    let use_structured = report_score > flat_score;
    let strategy_name = if use_structured { "structured_report" } else { "flat_table" };

    let mut cleaned_rows = Vec::new();
    let mut warnings = Vec::new();
    let mut dropped_empty = 0;
    let mut dropped_headers = 0;
    let mut dropped_totals = 0;
    let mut extracted_context = 0;

    if use_structured {
        let mut active_context = serde_json::Map::new();
        let mut label_depth = 0;
        let mut saw_data_rows = false;

        for row in input_rows.iter() {
            if is_empty_row(row) { dropped_empty += 1; continue; }
            if detect_repeated_header_row(row, &headers) { dropped_headers += 1; continue; }
            if looks_like_total_row(row) { dropped_totals += 1; continue; }

            let entries = non_empty_entries(row);
            let first_val = row.get(&primary_column).map(normalize_text).unwrap_or_default();
            let is_singleton = entries.len() == 1 && entries[0].0 == &primary_column;

            if is_singleton {
                extracted_context += 1;
                if first_val.parse::<i64>().is_ok() {
                    active_context.insert("context_entity_id".to_string(), serde_json::Value::Number(first_val.parse().unwrap()));
                    label_depth = 0;
                    saw_data_rows = false;
                    active_context.remove("context_label_1");
                    active_context.remove("context_label_2");
                    active_context.remove("context_label_3");
                } else {
                    let key = if active_context.get("context_label_1").is_none() {
                        label_depth = 1; "context_label_1"
                    } else if active_context.get("context_label_2").is_none() || saw_data_rows {
                        label_depth = 2; "context_label_2"
                    } else {
                        label_depth = (label_depth + 1).min(3);
                        match label_depth { 1 => "context_label_1", 2 => "context_label_2", _ => "context_label_3" }
                    };
                    active_context.insert(key.to_string(), serde_json::Value::String(first_val));
                    for i in (label_depth + 1)..=3 { active_context.remove(&format!("context_label_{}", i)); }
                    saw_data_rows = false;
                }
                continue;
            }

            let threshold = 2.max((headers.len() as f32 * 0.25).ceil() as usize);
            if entries.len() < threshold { continue; }

            let mut new_row = row.clone();
            for (k, v) in active_context.iter() { new_row.insert(k.clone(), v.clone()); }
            cleaned_rows.push(new_row);
            saw_data_rows = true;
        }
    } else {
        for row in input_rows.iter() {
            if is_empty_row(row) { dropped_empty += 1; continue; }
            if detect_repeated_header_row(row, &headers) { dropped_headers += 1; continue; }

            let mut new_row = serde_json::Map::new();
            for (k, v) in row.iter() {
                new_row.insert(k.clone(), serde_json::Value::String(normalize_text(v)));
            }
            cleaned_rows.push(new_row);
        }
    }

    if dropped_empty > 0 { warnings.push(format!("Removed {} empty rows", dropped_empty)); }
    if dropped_headers > 0 { warnings.push(format!("Removed {} repeated header rows", dropped_headers)); }
    if dropped_totals > 0 { warnings.push(format!("Removed {} total/subtotal rows", dropped_totals)); }
    if extracted_context > 0 { warnings.push(format!("Extracted {} context rows into context columns", extracted_context)); }

    let output_columns = cleaned_rows.first().map(|r| r.len()).unwrap_or(headers.len());

    TableCleanResponse {
        tables: vec![CleanedTable {
            name: table_name.clone(),
            rows: cleaned_rows.clone(),
            metadata: CleanedTableMeta {
                strategy: strategy_name.to_string(),
                warnings: warnings.clone(),
                stats: CleanedStats {
                    input_rows: input_rows.len(),
                    output_rows: cleaned_rows.len(),
                    columns: output_columns,
                },
            },
        }],
        metadata: CleanedMeta {
            strategy: strategy_name.to_string(),
            warnings,
        },
    }
}

// ── Table Profile ───────────────────────────────────────────────

pub fn profile_table(req: &TableProfileRequest) -> TableProfileResponse {
    let rows = &req.rows;
    let total_rows = rows.len();
    let mut profile = HashMap::new();
    if rows.is_empty() {
        return TableProfileResponse {
            profile,
            meta: ProfileMeta { total_rows: 0, profiled_at: "".to_string(), column_count: 0 },
        };
    }

    let headers: Vec<String> = rows[0].keys().cloned().collect();
    for col in headers.iter() {
        let mut null_count = 0;
        let mut min_val = f64::MAX;
        let mut max_val = f64::MIN;
        let mut unique_vals = HashMap::new();
        let mut has_numerics = false;
        let mut numeric_count = 0;
        let mut text_count = 0;

        for row in rows.iter() {
            if let Some(val) = row.get(col) {
                let text = normalize_text(val);
                if text.is_empty() { null_count += 1; continue; }
                *unique_vals.entry(text.clone()).or_insert(0) += 1;
                if let Ok(num) = text.parse::<f64>() {
                    has_numerics = true; numeric_count += 1;
                    if num < min_val { min_val = num; }
                    if num > max_val { max_val = num; }
                } else { text_count += 1; }
            } else { null_count += 1; }
        }

        let is_numeric = has_numerics && numeric_count > text_count;
        let cardinality = unique_vals.len();
        let null_ratio = null_count as f32 / total_rows as f32;
        let cardinality_ratio = cardinality as f32 / total_rows as f32;
        let is_high_cardinality = cardinality > 50;
        let is_likely_category = cardinality <= 20 && cardinality > 1;
        let is_likely_id = cardinality == total_rows && cardinality > 10;
        let is_likely_boolean = cardinality <= 3;

        let is_time_column = {
            let name_lower = col.to_lowercase();
            name_lower.contains("date") || name_lower.contains("time") || name_lower.contains("timestamp")
                || name_lower.contains("created") || name_lower.contains("updated")
                || name_lower.contains("year") || name_lower.contains("month")
        };

        let chart_role = if is_likely_id { "id" } else if is_time_column { "x-axis-time" }
            else if cardinality <= 15 && !is_numeric { "x-axis-category" }
            else if is_numeric { "y-axis-metric" }
            else if cardinality > 50 { "label-only" } else { "unknown" };

        let sample_values = if !is_numeric && cardinality <= 30 {
            unique_vals.keys().cloned().take(10).collect()
        } else { vec![] };

        let range = if is_numeric && numeric_count > 0 {
            Some(NumericRange { min: min_val, max: max_val })
        } else { None };

        profile.insert(col.clone(), ColumnProfile {
            col_type: if is_numeric { "numeric".to_string() } else { "text".to_string() },
            cardinality, total_rows, cardinality_ratio, null_ratio,
            is_high_cardinality, is_likely_category, is_likely_id, is_likely_boolean,
            is_time_column, is_numeric, range, sample_values,
            chart_role: chart_role.to_string(),
        });
    }

    TableProfileResponse {
        profile,
        meta: ProfileMeta { total_rows, profiled_at: "".to_string(), column_count: headers.len() },
    }
}

// ── Analytics Stats ─────────────────────────────────────────────

pub fn compute_stats(req: &AnalyticsStatsRequest) -> AnalyticsStatsResponse {
    let mut stats = HashMap::new();
    let mut correlations = HashMap::new();

    for (col_name, values) in req.columns.iter() {
        if values.is_empty() { continue; }
        let count = values.len() as f64;
        let sum: f64 = values.iter().sum();
        let mean = sum / count;
        let var_sum: f64 = values.iter().map(|v| (v - mean) * (v - mean)).sum();
        let variance = if count > 1.0 { var_sum / (count - 1.0) } else { 0.0 };
        let std_dev = variance.sqrt();
        let mut sorted = values.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let min = sorted[0];
        let max = sorted[sorted.len() - 1];
        let median = if sorted.len() % 2 == 0 {
            let mid = sorted.len() / 2;
            (sorted[mid - 1] + sorted[mid]) / 2.0
        } else { sorted[sorted.len() / 2] };

        stats.insert(col_name.clone(), ColumnStats { mean, variance, std_dev, min, max, median });
    }

    let col_names: Vec<String> = req.columns.keys().cloned().collect();
    for i in 0..col_names.len() {
        let col_a = &col_names[i];
        let mut row_corr = HashMap::new();
        for j in 0..col_names.len() {
            let col_b = &col_names[j];
            if i == j { row_corr.insert(col_b.clone(), 1.0); continue; }
            let vals_a = &req.columns[col_a];
            let vals_b = &req.columns[col_b];
            if vals_a.len() != vals_b.len() || vals_a.is_empty() {
                row_corr.insert(col_b.clone(), 0.0); continue;
            }
            let mean_a = stats[col_a].mean;
            let mean_b = stats[col_b].mean;
            let std_a = stats[col_a].std_dev;
            let std_b = stats[col_b].std_dev;
            if std_a == 0.0 || std_b == 0.0 { row_corr.insert(col_b.clone(), 0.0); continue; }
            let mut cov_sum = 0.0;
            for k in 0..vals_a.len() {
                cov_sum += (vals_a[k] - mean_a) * (vals_b[k] - mean_b);
            }
            let cov = cov_sum / (vals_a.len() as f64 - 1.0);
            row_corr.insert(col_b.clone(), cov / (std_a * std_b));
        }
        correlations.insert(col_a.clone(), row_corr);
    }

    AnalyticsStatsResponse { stats, correlations }
}

// ── Intent Compiler ─────────────────────────────────────────────

pub fn compile_intent(req: &IntentCompileRequest) -> IntentCompileResponse {
    let dialect = req.dialect.clone().unwrap_or_else(|| "postgres".to_string());
    match &req.intent {
        IntentPayload::Single(single) => {
            let sql = compile_single(single, &req.schema, &dialect);
            IntentCompileResponse { sql: Some(sql), results: None }
        }
        IntentPayload::Compound(compounds) => {
            let results: Vec<CompoundSqlResult> = compounds.iter().map(|intent| {
                let query = compile_single(intent, &req.schema, &dialect);
                CompoundSqlResult { query, intent: intent.clone() }
            }).collect();
            IntentCompileResponse { sql: None, results: Some(results) }
        }
    }
}

pub fn compile_single(intent: &SingleIntent, schema_ctx: &Option<SchemaMappingContext>, _dialect: &str) -> String {
    if let Some(ref raw_query) = intent.query {
        let mut q = raw_query.trim().to_string();
        if q.ends_with(';') { q.pop(); }
        return q;
    }

    let resource = intent.resource.as_deref().unwrap_or("");
    let resolved_resource = resolve_identifier(resource, schema_ctx, "table");
    let mut select_parts = Vec::new();

    if let Some(ref group_by) = intent.group_by {
        for g in group_by {
            let res_col = resolve_identifier(g, schema_ctx, "column");
            select_parts.push(quote_identifier(&res_col));
        }
    }

    if let Some(ref aggregations) = intent.aggregations {
        for agg in aggregations {
            let col = if agg.field == "*" { "*".to_string() } else {
                quote_identifier(&resolve_identifier(&agg.field, schema_ctx, "column"))
            };
            let alias = agg.alias.as_ref().map(|a| format!(" AS {}", quote_identifier(a))).unwrap_or_default();
            select_parts.push(format!("{}({}){}", agg.op.to_uppercase(), col, alias));
        }
    }

    if select_parts.is_empty() { select_parts.push("*".to_string()); }

    let select_sql = format!("SELECT {}", select_parts.join(", "));
    let from_sql = format!("FROM {}", quote_identifier(&resolved_resource));

    let mut where_sql = String::new();
    if let Some(ref filters) = intent.filters {
        if !filters.is_empty() {
            let conditions: Vec<String> = filters.iter().map(|f| {
                let col = quote_identifier(&resolve_identifier(&f.field, schema_ctx, "column"));
                let val = format_value(&f.value);
                match f.op.to_lowercase().as_str() {
                    "eq" => format!("{} = {}", col, val),
                    "neq" => format!("{} != {}", col, val),
                    "gt" => format!("{} > {}", col, val),
                    "lt" => format!("{} < {}", col, val),
                    "gte" => format!("{} >= {}", col, val),
                    "lte" => format!("{} <= {}", col, val),
                    "contains" | "like" => {
                        let clean_val = f.value.as_str().unwrap_or("").replace("'", "''");
                        format!("{} LIKE '%{}%'", col, clean_val)
                    }
                    "in" => {
                        let in_vals = if let Some(arr) = f.value.as_array() {
                            arr.iter().map(format_value).collect::<Vec<_>>().join(", ")
                        } else { format_value(&f.value) };
                        format!("{} IN ({})", col, in_vals)
                    }
                    _ => format!("{} = {}", col, val),
                }
            }).collect();
            where_sql = format!("WHERE {}", conditions.join(" AND "));
        }
    }

    let mut group_by_sql = String::new();
    if let Some(ref group_by) = intent.group_by {
        if !group_by.is_empty() {
            let parts = group_by.iter()
                .map(|g| quote_identifier(&resolve_identifier(g, schema_ctx, "column")))
                .collect::<Vec<_>>()
                .join(", ");
            group_by_sql = format!("GROUP BY {}", parts);
        }
    }

    let mut order_by_sql = String::new();
    if let Some(ref order_by) = intent.order_by {
        if !order_by.is_empty() {
            let parts = order_by.iter()
                .map(|o| {
                    let dir = o.direction.as_deref().unwrap_or("asc").to_uppercase();
                    format!("{} {}",
                        quote_identifier(&resolve_identifier(&o.field, schema_ctx, "column")), dir)
                })
                .collect::<Vec<_>>()
                .join(", ");
            order_by_sql = format!("ORDER BY {}", parts);
        }
    }

    let limit_sql = intent.limit.map(|l| format!("LIMIT {}", l)).unwrap_or_default();
    let parts = vec![select_sql, from_sql, where_sql, group_by_sql, order_by_sql, limit_sql];
    parts.into_iter().filter(|p| !p.is_empty()).collect::<Vec<_>>().join(" ")
}

pub fn quote_identifier(id: &str) -> String {
    if id == "*" { return "*".to_string(); }
    if id.contains('(') && id.contains(')') { return id.to_string(); }
    format!("\"{}\"", id.replace("\"", "\"\""))
}

pub fn resolve_identifier(id: &str, schema_ctx: &Option<SchemaMappingContext>, kind: &str) -> String {
    if id.is_empty() { return id.to_string(); }
    if id.contains('(') && id.contains(')') { return id.to_string(); }

    if let Some(ref ctx) = schema_ctx {
        if let Some(ref mappings) = ctx.mappings {
            let map = if kind == "table" { &mappings.tables } else { &mappings.columns };
            if let Some(ref m) = map {
                if let Some(val) = m.get(id) { return val.clone(); }
                let low_id = id.to_lowercase();
                for (k, v) in m.iter() {
                    if k.to_lowercase() == low_id { return v.clone(); }
                }
                let clean = |s: &str| -> String {
                    s.to_lowercase().chars().filter(|c| c.is_alphanumeric())
                        .collect::<String>().replace("pct", "").replace("usd", "").replace("eur", "")
                };
                let target_slug = clean(id);
                for (k, v) in m.iter() {
                    let k_slug = clean(k); let v_slug = clean(v);
                    if k_slug == target_slug || v_slug == target_slug { return v.clone(); }
                    if target_slug.contains(&k_slug) && k_slug.len() > 5 { return v.clone(); }
                    if k_slug.contains(&target_slug) && target_slug.len() > 5 { return v.clone(); }
                }
            }
        }
    }
    id.to_string()
}

pub fn format_value(val: &serde_json::Value) -> String {
    match val {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        other => {
            let s = other.as_str().unwrap_or("").replace("'", "''");
            format!("'{}'", s)
        }
    }
}

// ── Query Heal ──────────────────────────────────────────────────

pub fn heal_query(req: &QueryHealRequest) -> QueryHealResponse {
    let failed_sql = req.failed_sql.trim().to_string();
    let dialect = req.dialect.to_lowercase();
    let err_lower = req.error_message.to_lowercase();

    if err_lower.contains("column") && err_lower.contains("not found") {
        let mut bad_col = String::new();
        for word in err_lower.split(|c: char| !c.is_alphanumeric() && c != '_' && c != '"') {
            if !word.is_empty() && word != "column" && word != "not" && word != "found" {
                bad_col = word.to_string();
            }
        }
        if !bad_col.is_empty() {
            if let Some(schema) = &req.schema {
                if let Some(detailed) = schema.get("detailedSchema").and_then(|d| d.as_object()) {
                    for (_table, cols) in detailed.iter() {
                        if let Some(col_arr) = cols.as_array() {
                            for col in col_arr {
                                let col_name = if let Some(obj) = col.as_object() {
                                    obj.get("name").and_then(|n| n.as_str()).unwrap_or("")
                                } else { col.as_str().unwrap_or("") };
                                if col_name.to_lowercase() == bad_col.to_lowercase() && col_name != bad_col {
                                    let healed = failed_sql.replace(&bad_col, &format!("\"{}\"", col_name));
                                    return QueryHealResponse {
                                        fixed: true, healed_sql: healed,
                                        explanation: format!("Fixed column casing: {} -> \"{}\"", bad_col, col_name),
                                        confidence: 95,
                                    };
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if dialect == "cosmosdb" && err_lower.contains("order by") {
        if failed_sql.to_lowercase().contains("group by") && failed_sql.to_lowercase().contains("order by") {
            if let Some(idx) = failed_sql.to_lowercase().rfind("order by") {
                let healed = failed_sql[..idx].trim().to_string();
                return QueryHealResponse {
                    fixed: true, healed_sql: healed,
                    explanation: "Removed ORDER BY (not supported with GROUP BY expressions in Cosmos DB)".to_string(),
                    confidence: 90,
                };
            }
        }
    }

    if err_lower.contains("must appear in") && err_lower.contains("group by") {
        if let Some(sel_idx) = failed_sql.to_lowercase().find("select") {
            if let Some(from_idx) = failed_sql.to_lowercase().find("from") {
                let select_part = &failed_sql[sel_idx + 6..from_idx].trim();
                let columns: Vec<&str> = select_part.split(',').map(|c| c.trim()).collect();
                let mut non_agg_cols = Vec::new();
                for col in columns {
                    let col_lower = col.to_lowercase();
                    if !col_lower.contains("sum(") && !col_lower.contains("avg(")
                        && !col_lower.contains("count(") && !col_lower.contains("max(")
                        && !col_lower.contains("min(") && !col_lower.contains(" as ")
                    { non_agg_cols.push(col.to_string()); }
                }
                if !non_agg_cols.is_empty() {
                    let group_by_clause = format!(" GROUP BY {}", non_agg_cols.join(", "));
                    let healed = if failed_sql.to_lowercase().contains("group by") {
                        if let Some(grp_idx) = failed_sql.to_lowercase().find("group by") {
                            let (before, after) = failed_sql.split_at(grp_idx + 8);
                            format!("{}{}, {}", before, non_agg_cols.join(", "), after)
                        } else { failed_sql.clone() }
                    } else if failed_sql.to_lowercase().contains("order by") {
                        if let Some(ord_idx) = failed_sql.to_lowercase().find("order by") {
                            let (before, after) = failed_sql.split_at(ord_idx);
                            format!("{}{}{}", before.trim(), group_by_clause, after)
                        } else { failed_sql.clone() }
                    } else { format!("{}{}", failed_sql, group_by_clause) };

                    return QueryHealResponse {
                        fixed: true, healed_sql: healed,
                        explanation: format!("Added missing columns to GROUP BY: {}", non_agg_cols.join(", ")),
                        confidence: 85,
                    };
                }
            }
        }
    }

    QueryHealResponse {
        fixed: false, healed_sql: failed_sql,
        explanation: "Could not auto-repair with local patterns".to_string(),
        confidence: 0,
    }
}

// ── Schema Relations ────────────────────────────────────────────

pub fn analyze_schema_relations(req: &SchemaRelationRequest) -> SchemaRelationResponse {
    let provider = req.provider.to_lowercase();
    let raw_tables = &req.tables;
    let detailed_schema = req.detailed_schema.clone().unwrap_or_default();
    let user_message = req.user_message.clone().unwrap_or_default();
    let user_tokens: Vec<String> = user_message
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| t.len() > 2)
        .map(|t| t.to_string())
        .collect();

    let mut tables = Vec::new();
    let mut table_mapping = HashMap::new();
    let mut column_mapping = HashMap::new();

    let clean_uuid = |real_name: &str| -> String {
        if provider == "duckdb" || provider == "sqlite" {
            let parts: Vec<&str> = real_name.split(|c: char| c == '-' || c == '_').collect();
            let mut cleaned_parts = Vec::new();
            for part in parts {
                let is_hex = part.len() == 8 || part.len() == 4 || part.len() == 12 || part.len() == 32;
                let all_hex = part.chars().all(|c| c.is_ascii_hexdigit());
                if is_hex && all_hex { continue; }
                cleaned_parts.push(part);
            }
            let friendly = cleaned_parts.join("_");
            if friendly.is_empty() { real_name.to_string() } else { friendly }
        } else { real_name.to_string() }
    };

    let normalize_identifier = |s: &str| -> String {
        s.replace(" ", "_").replace("-", "_")
            .chars().filter(|c| c.is_alphanumeric() || *c == '_')
            .collect::<String>().trim_matches('_').to_string()
    };

    for real_name in raw_tables.iter() {
        let cleaned = clean_uuid(real_name);
        let normalized = normalize_identifier(&cleaned);
        tables.push(normalized.clone());
        table_mapping.insert(normalized, real_name.clone());
    }

    let mut output_detailed = HashMap::new();
    let sample_values = HashMap::new();
    for (normalized_table, col_defs) in detailed_schema.iter() {
        let mut normalized_cols = Vec::new();
        for col in col_defs {
            let original_col = &col.name;
            let normalized_col = normalize_identifier(original_col);
            column_mapping.insert(normalized_col.clone(), original_col.clone());
            normalized_cols.push(serde_json::json!({
                "name": normalized_col,
                "type": col.col_type,
                "originalName": original_col,
                "pk": col.pk
            }));
        }
        if normalized_cols.len() > 50 {
            let mut scored = Vec::new();
            for (idx, col) in normalized_cols.iter().enumerate() {
                let mut score = 0;
                let name = col.get("name").and_then(|n| n.as_str()).unwrap_or("").to_lowercase();
                let original_name = col.get("originalName").and_then(|n| n.as_str()).unwrap_or("").to_lowercase();
                let lower_prompt = user_message.to_lowercase();
                if lower_prompt.contains(&name) || lower_prompt.contains(&original_name) { score += 20; }
                if user_tokens.iter().any(|t| name == *t || original_name == *t) { score += 10; }
                else if user_tokens.iter().any(|t| name.contains(t) || original_name.contains(t)) { score += 5; }
                if col.get("pk").and_then(|p| p.as_bool()).unwrap_or(false) { score += 8; }
                let idx_penalty = idx as f64 / 1000.0;
                scored.push((col, score as f64 - idx_penalty, idx));
            }
            scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
            let mut pruned: Vec<serde_json::Value> = scored.iter().take(50).map(|s| s.0.clone()).collect();
            pruned.sort_by_key(|c| {
                let name = c.get("name").unwrap().as_str().unwrap();
                normalized_cols.iter().position(|col| col.get("name").unwrap().as_str().unwrap() == name).unwrap()
            });
            normalized_cols = pruned;
        }
        output_detailed.insert(normalized_table.clone(), normalized_cols);
    }

    SchemaRelationResponse {
        normalized_schema: NormalizedSchemaOut {
            tables,
            detailed_schema: output_detailed,
            sample_values,
            mappings: MappingsOut { tables: table_mapping, columns: column_mapping },
            context_metadata: [
                ("provider".to_string(), provider),
                ("analyzedAt".to_string(), "".to_string()),
            ].into_iter().collect(),
        },
    }
}

// ── Table Pivot ─────────────────────────────────────────────────

pub fn pivot_table(req: &TablePivotRequest) -> TablePivotResponse {
    let rows = &req.rows;
    let row_key = &req.row_key;
    let pivot_column = &req.pivot_column;
    let value_column = &req.value_column;
    let aggregation = req.aggregation.to_lowercase();

    let mut pivot_values = HashSet::new();
    for row in rows {
        if let Some(val) = row.get(pivot_column) {
            let s = normalize_text(val);
            if !s.is_empty() { pivot_values.insert(s); }
        }
    }
    let mut sorted_pivot_values: Vec<String> = pivot_values.into_iter().collect();
    sorted_pivot_values.sort();

    let mut groups: HashMap<String, HashMap<String, Vec<f64>>> = HashMap::new();
    for row in rows {
        let key_val = row.get(row_key).map(normalize_text).unwrap_or_default();
        let pivot_val = row.get(pivot_column).map(normalize_text).unwrap_or_default();
        let num_val = if let Some(val) = row.get(value_column) {
            if let Some(f) = val.as_f64() { f }
            else if let Some(i) = val.as_i64() { i as f64 }
            else if let Some(s) = val.as_str() { s.parse::<f64>().unwrap_or(0.0) }
            else { 0.0 }
        } else { 0.0 };
        if !key_val.is_empty() && !pivot_val.is_empty() {
            groups.entry(key_val).or_default()
                .entry(pivot_val).or_default()
                .push(num_val);
        }
    }

    let mut pivoted_rows = Vec::new();
    for (row_val, pivot_map) in groups {
        let mut new_row = serde_json::Map::new();
        new_row.insert(row_key.clone(), serde_json::Value::String(row_val));
        for pivot_val in &sorted_pivot_values {
            let mut cell_value = serde_json::Value::Null;
            if let Some(vals) = pivot_map.get(pivot_val) {
                if !vals.is_empty() {
                    let result = match aggregation.as_str() {
                        "sum" => vals.iter().sum::<f64>(),
                        "count" => vals.len() as f64,
                        "avg" => vals.iter().sum::<f64>() / vals.len() as f64,
                        "min" => vals.iter().copied().fold(f64::NAN, f64::min),
                        "max" => vals.iter().copied().fold(f64::NAN, f64::max),
                        _ => vals.iter().sum::<f64>(),
                    };
                    if !result.is_nan() {
                        cell_value = serde_json::Value::Number(serde_json::Number::from_f64(result).unwrap());
                    }
                }
            }
            new_row.insert(pivot_val.clone(), cell_value);
        }
        pivoted_rows.push(new_row);
    }

    let mut headers = vec![row_key.clone()];
    headers.extend(sorted_pivot_values);
    TablePivotResponse { rows: pivoted_rows, headers }
}

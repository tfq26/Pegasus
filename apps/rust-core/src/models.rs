use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Semantic Cache ──────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SemanticCacheItem {
    pub prompt: String,
    pub answer: String,
    pub chosen_source_ids: Vec<String>,
    pub evidence: Vec<String>,
    pub assumptions: Vec<String>,
    pub confidence: f32,
}

// ── Answer / RAG ────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SourceRef {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub label: String,
    pub value: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnswerRequest {
    pub envelope: Option<AnswerEnvelope>,
    pub prompt: Option<String>,
    pub space_id: Option<String>,
    pub selected_sources: Option<Vec<SourceRef>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnswerEnvelope {
    pub version: String,
    pub mode: String,
    pub prompt: String,
    pub selected_sources: Vec<SourceRef>,
    pub reply_to: Option<ReplyToRef>,
    pub conversation: Option<ConversationRef>,
    pub context: Option<ContextRef>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReplyToRef {
    pub message_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConversationRef {
    pub last_user_message_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContextRef {
    pub source_selection_policy: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PythonRankRequest {
    pub question: String,
    pub selected_sources: Vec<SourceRef>,
    pub reply_to_message_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PythonRankResponse {
    pub selected_source_ids: Vec<String>,
    pub assumptions: Vec<String>,
    pub confidence: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegisteredSource {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub label: String,
    pub trust_mode: Option<String>,
    pub table_data: Option<Vec<HashMap<String, serde_json::Value>>>,
    pub document_text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SourceRegistryFile {
    pub sources: Vec<RegisteredSource>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnswerResponse {
    pub answer: String,
    pub chosen_source_ids: Vec<String>,
    pub evidence: Vec<String>,
    pub assumptions: Vec<String>,
    pub confidence: f32,
    pub grounded: bool,
}

#[derive(Debug)]
pub struct ExecutionOutput {
    pub answer: String,
    pub evidence: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct SynthesisRequest {
    pub prompt: String,
    pub sources: Vec<SynthesisSource>,
}

#[derive(Debug, Serialize)]
pub struct SynthesisSource {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub text: Option<String>,
    pub table_data: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SynthesisResponse {
    pub answer: String,
    pub confidence: f32,
    pub assumptions: Vec<String>,
}

// ── Similarity ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct SimilarityCandidate {
    pub id: String,
    pub embedding: Vec<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SimilarityRequest {
    pub query_vector: Vec<f32>,
    pub candidates: Vec<SimilarityCandidate>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SimilarityResponse {
    pub scores: Vec<SimilarityScore>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SimilarityScore {
    pub id: String,
    pub score: f32,
}

// ── Table Clean ─────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct TableCleanRequest {
    pub table_name: String,
    pub rows: Vec<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableCleanResponse {
    pub tables: Vec<CleanedTable>,
    pub metadata: CleanedMeta,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CleanedTable {
    pub name: String,
    pub rows: Vec<serde_json::Map<String, serde_json::Value>>,
    pub metadata: CleanedTableMeta,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CleanedTableMeta {
    pub strategy: String,
    pub warnings: Vec<String>,
    pub stats: CleanedStats,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CleanedStats {
    pub input_rows: usize,
    pub output_rows: usize,
    pub columns: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CleanedMeta {
    pub strategy: String,
    pub warnings: Vec<String>,
}

// ── Table Profile ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct TableProfileRequest {
    pub table_name: String,
    pub rows: Vec<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableProfileResponse {
    pub profile: HashMap<String, ColumnProfile>,
    pub meta: ProfileMeta,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ColumnProfile {
    #[serde(rename = "type")]
    pub col_type: String,
    pub cardinality: usize,
    pub total_rows: usize,
    pub cardinality_ratio: f32,
    pub null_ratio: f32,
    pub is_high_cardinality: bool,
    pub is_likely_category: bool,
    pub is_likely_id: bool,
    pub is_likely_boolean: bool,
    pub is_time_column: bool,
    pub is_numeric: bool,
    pub range: Option<NumericRange>,
    pub sample_values: Vec<String>,
    pub chart_role: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NumericRange {
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProfileMeta {
    pub total_rows: usize,
    pub profiled_at: String,
    pub column_count: usize,
}

// ── Analytics Stats ─────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalyticsStatsRequest {
    pub columns: HashMap<String, Vec<f64>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalyticsStatsResponse {
    pub stats: HashMap<String, ColumnStats>,
    pub correlations: HashMap<String, HashMap<String, f64>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ColumnStats {
    pub mean: f64,
    pub variance: f64,
    pub std_dev: f64,
    pub min: f64,
    pub max: f64,
    pub median: f64,
}

// ── Intent Compile ──────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FilterItem {
    pub field: String,
    pub op: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AggregationItem {
    pub op: String,
    pub field: String,
    pub alias: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OrderByItem {
    pub field: String,
    pub direction: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SingleIntent {
    pub resource: Option<String>,
    pub filters: Option<Vec<FilterItem>>,
    #[serde(rename = "groupBy")]
    pub group_by: Option<Vec<String>>,
    pub aggregations: Option<Vec<AggregationItem>>,
    pub limit: Option<u64>,
    #[serde(rename = "orderBy")]
    pub order_by: Option<Vec<OrderByItem>>,
    pub query: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum IntentPayload {
    Single(SingleIntent),
    Compound(Vec<SingleIntent>),
}

#[derive(Debug, Deserialize)]
pub struct IntentCompileRequest {
    pub intent: IntentPayload,
    pub schema: Option<SchemaMappingContext>,
    pub dialect: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct IntentCompileResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sql: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub results: Option<Vec<CompoundSqlResult>>,
}

#[derive(Debug, Serialize)]
pub struct CompoundSqlResult {
    pub query: String,
    pub intent: SingleIntent,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SchemaMappingContext {
    pub mappings: Option<MappingsContainer>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MappingsContainer {
    pub tables: Option<HashMap<String, String>>,
    pub columns: Option<HashMap<String, String>>,
}

// ── Query Heal ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct QueryHealRequest {
    pub failed_sql: String,
    pub dialect: String,
    pub error_message: String,
    pub schema: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct QueryHealResponse {
    pub fixed: bool,
    #[serde(rename = "healedSql")]
    pub healed_sql: String,
    pub explanation: String,
    pub confidence: u32,
}

// ── Schema Relations ────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SchemaRelationRequest {
    pub provider: String,
    pub tables: Vec<String>,
    pub detailed_schema: Option<HashMap<String, Vec<ColumnDef>>>,
    pub active_table: Option<String>,
    pub user_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnDef {
    pub name: String,
    #[serde(rename = "type")]
    pub col_type: String,
    pub pk: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct SchemaRelationResponse {
    #[serde(rename = "normalizedSchema")]
    pub normalized_schema: NormalizedSchemaOut,
}

#[derive(Debug, Serialize)]
pub struct NormalizedSchemaOut {
    pub tables: Vec<String>,
    #[serde(rename = "detailedSchema")]
    pub detailed_schema: HashMap<String, Vec<serde_json::Value>>,
    #[serde(rename = "sampleValues")]
    pub sample_values: HashMap<String, HashMap<String, Vec<serde_json::Value>>>,
    pub mappings: MappingsOut,
    #[serde(rename = "contextMetadata")]
    pub context_metadata: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct MappingsOut {
    pub tables: HashMap<String, String>,
    pub columns: HashMap<String, String>,
}

// ── Table Pivot ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct TablePivotRequest {
    pub rows: Vec<serde_json::Map<String, serde_json::Value>>,
    pub row_key: String,
    pub pivot_column: String,
    pub value_column: String,
    pub aggregation: String,
}

#[derive(Debug, Serialize)]
pub struct TablePivotResponse {
    pub rows: Vec<serde_json::Map<String, serde_json::Value>>,
    pub headers: Vec<String>,
}

// ── Fetch Source ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct FetchSourcePayload {
    pub id: String,
    pub url: String,
    pub label: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Serialize)]
pub struct FetchSourceResponse {
    pub success: bool,
    pub message: String,
    pub row_count: Option<usize>,
    pub char_count: Option<usize>,
}

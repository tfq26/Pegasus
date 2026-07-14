use anyhow::{Context, Result};
use reqwest::Client;
use tracing::error;

use crate::models::{AnswerRequest, AnswerResponse, ExecutionOutput, PythonRankRequest, PythonRankResponse, SourceRef, SynthesisRequest, SynthesisResponse, SynthesisSource, RegisteredSource};

/// Query the Python AI service for an answer.
pub async fn query_ai(py_base_url: &str, request: AnswerRequest) -> Result<AnswerResponse> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/ai/query", py_base_url))
        .json(&request)
        .send()
        .await
        .context("Failed to send AI query to Python service")?;
    let answer: AnswerResponse = resp
        .json()
        .await
        .context("Failed to parse AI response from Python service")?;
    Ok(answer)
}

/// Request evidence ranking from Python.
pub async fn rank_evidence(py_base_url: &str, request: PythonRankRequest) -> Result<PythonRankResponse> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/rank_evidence", py_base_url))
        .json(&request)
        .send()
        .await
        .context("Failed to send ranking request to Python service")?;
    let ranked: PythonRankResponse = resp
        .json()
        .await
        .context("Failed to parse ranking response from Python service")?;
    Ok(ranked)
}

/// Request intelligence synthesis from Python.
pub async fn synthesize(py_base_url: &str, request: SynthesisRequest) -> Result<SynthesisResponse> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/v1/intelligence/synthesize", py_base_url))
        .json(&request)
        .send()
        .await
        .context("Failed to send synthesis request")?;
    let result: SynthesisResponse = resp
        .json()
        .await
        .context("Failed to parse synthesis response")?;
    Ok(result)
}

/// Execute all selected sources and fuse their content into a single answer.
pub async fn execute_sources_with_fusion(
    sources: &[SourceRef],
    source_registry: &[RegisteredSource],
) -> (String, Vec<String>) {
    let mut evidence = Vec::new();
    let mut parts = Vec::new();

    for source in sources {
        if let Some(registered) = source_registry.iter().find(|r| r.id == source.id) {
            match registered.kind.as_str() {
                "table" | "csv" | "excel" => {
                    if let Some(rows) = &registered.table_data {
                        let count = rows.len();
                        let sample = rows.iter().take(5).map(|r| {
                            r.iter()
                                .map(|(k, v)| format!("{}: {}", k, crate::utils::normalize_text(v)))
                                .collect::<Vec<_>>()
                                .join(", ")
                        }).collect::<Vec<_>>().join("\n");
                        parts.push(format!(
                            "## Table: {} ({})\nSample rows:\n{}",
                            registered.label, count, sample
                        ));
                        evidence.push(format!("table:{} ({})", registered.id, count));
                    }
                }
                "document" | "pdf" | "web" => {
                    if let Some(text) = &registered.document_text {
                        let snippet = if text.len() > 2000 {
                            format!("{}...", &text[..2000])
                        } else {
                            text.clone()
                        };
                        parts.push(format!(
                            "## Document: {}\n{}",
                            registered.label, snippet
                        ));
                        evidence.push(format!("doc:{} ({} chars)", registered.id, text.len()));
                    }
                }
                _ => {}
            }
        }
    }

    let fused = parts.join("\n\n---\n\n");
    (fused, evidence)
}

/// Execute sources with LLM synthesis via Python intelligence service.
pub async fn synthesize_sources(
    http: &Client,
    py_base_url: &str,
    sources: &[RegisteredSource],
    prompt: &str,
) -> ExecutionOutput {
    let mut sources_payload = Vec::new();
    for src in sources {
        let text = src.document_text.clone();
        let mut table_data = None;
        if let Some(ref rows) = src.table_data {
            let sample_rows: Vec<String> = rows.iter().take(5).map(|r| {
                serde_json::to_string(r).unwrap_or_default()
            }).collect();
            table_data = Some(sample_rows.join("\n"));
        }
        sources_payload.push(SynthesisSource {
            id: src.id.clone(),
            label: src.label.clone(),
            kind: src.kind.clone(),
            text,
            table_data,
        });
    }

    let synth_url = format!("{}/v1/intelligence/synthesize", py_base_url);
    let req_payload = SynthesisRequest {
        prompt: prompt.to_string(),
        sources: sources_payload,
    };

    match http.post(synth_url).json(&req_payload).send().await {
        Ok(resp) => match resp.json::<SynthesisResponse>().await {
            Ok(parsed) => ExecutionOutput {
                answer: parsed.answer,
                evidence: parsed.assumptions,
            },
            Err(err) => {
                error!("failed to parse synthesis response: {}", err);
                let fallback = crate::services::execute_sources(sources, prompt);
                ExecutionOutput { answer: fallback.answer, evidence: fallback.evidence }
            }
        },
        Err(err) => {
            error!("failed to send synthesis request: {}", err);
            let fallback = crate::services::execute_sources(sources, prompt);
            ExecutionOutput { answer: fallback.answer, evidence: fallback.evidence }
        }
    }
}

/// Execute sources returning raw text (without fusion).
pub async fn execute_sources(sources: &[SourceRef]) -> Vec<String> {
    sources.iter().map(|s| s.label.clone()).collect()
}

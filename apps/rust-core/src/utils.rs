use std::collections::{HashMap, HashSet};

/// Normalize a JSON value to a clean string representation.
pub fn normalize_text(val: &serde_json::Value) -> String {
    match val {
        serde_json::Value::String(s) => {
            let s = s.replace("&amp;", "&");
            let s = s.split_whitespace().collect::<Vec<&str>>().join(" ");
            s.trim().to_string()
        }
        serde_json::Value::Null => "".to_string(),
        other => {
            let s = other.to_string();
            if s.starts_with('"') && s.ends_with('"') {
                s[1..s.len() - 1].to_string()
            } else {
                s
            }
        }
    }
}

/// Cosine similarity between two f32 vectors.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let mut dot_product = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;
    let len = a.len().max(b.len());
    for i in 0..len {
        let val_a = a.get(i).cloned().unwrap_or(0.0);
        let val_b = b.get(i).cloned().unwrap_or(0.0);
        dot_product += val_a * val_b;
        norm_a += val_a * val_a;
        norm_b += val_b * val_b;
    }
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot_product / (norm_a.sqrt() * norm_b.sqrt())
}

/// Jaccard similarity between two strings (word-level).
pub fn jaccard_similarity(s1: &str, s2: &str) -> f32 {
    let clean = |s: &str| -> HashSet<String> {
        s.split_whitespace()
            .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()).to_string())
            .filter(|w| !w.is_empty())
            .collect()
    };
    let w1 = clean(s1);
    let w2 = clean(s2);
    if w1.is_empty() && w2.is_empty() {
        return 1.0;
    }
    let intersection = w1.intersection(&w2).count();
    let union = w1.union(&w2).count();
    intersection as f32 / union as f32
}

pub fn non_empty_entries(row: &serde_json::Map<String, serde_json::Value>) -> Vec<(&String, &serde_json::Value)> {
    row.iter()
        .filter(|(_, val)| !normalize_text(val).is_empty())
        .collect()
}

pub fn is_empty_row(row: &serde_json::Map<String, serde_json::Value>) -> bool {
    non_empty_entries(row).is_empty()
}

pub fn looks_like_total_row(row: &serde_json::Map<String, serde_json::Value>) -> bool {
    row.values().any(|val| {
        let text = normalize_text(val).to_lowercase();
        text.starts_with("total")
            || text.contains("grand total")
            || text.contains("subtotal")
            || text.contains("member total")
            || text.contains("group total")
    })
}

pub fn detect_repeated_header_row(
    row: &serde_json::Map<String, serde_json::Value>,
    headers: &[String],
) -> bool {
    let row_values: Vec<String> = row
        .values()
        .map(|v| normalize_text(v).to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();
    let header_values: Vec<String> = headers
        .iter()
        .map(|h| h.to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();
    if row_values.is_empty() || header_values.is_empty() {
        return false;
    }
    let overlap = row_values.iter().filter(|v| header_values.contains(v)).count();
    let required = (header_values.len() as f32 * 0.6).ceil() as usize;
    overlap >= 2.max(required)
}

pub fn first_meaningful_column(
    headers: &[String],
    rows: &[serde_json::Map<String, serde_json::Value>],
) -> String {
    let mut best_header = headers.first().cloned().unwrap_or_default();
    let mut best_score = -1.0;

    for header in headers {
        let mut score = 0.0;
        for row in rows {
            if let Some(val) = row.get(header) {
                let text = normalize_text(val);
                if text.is_empty() {
                    continue;
                }
                if text.parse::<f64>().is_ok() {
                    score += 0.25;
                } else {
                    score += 1.0;
                }
            }
        }
        if score > best_score {
            best_score = score;
            best_header = header.clone();
        }
    }
    best_header
}

pub fn summarize_numeric_columns(rows: &[HashMap<String, serde_json::Value>]) -> HashMap<String, f64> {
    let mut sums = HashMap::new();
    for row in rows {
        for (key, value) in row {
            if let Some(v) = value.as_f64() {
                *sums.entry(key.clone()).or_insert(0.0) += v;
            } else if let Some(v) = value.as_i64() {
                *sums.entry(key.clone()).or_insert(0.0) += v as f64;
            } else if let Some(v) = value.as_u64() {
                *sums.entry(key.clone()).or_insert(0.0) += v as f64;
            }
        }
    }
    sums
}

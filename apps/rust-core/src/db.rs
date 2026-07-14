use anyhow::Result;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

use crate::models::RegisteredSource;

/// Initialize a connection pool to Postgres.
pub async fn init_pool(database_url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;
    Ok(pool)
}

/// Load the source registry from the database.
pub async fn load_source_registry_from_db(pool: &PgPool, space_id: &str) -> Result<Vec<RegisteredSource>> {
    let rows: Vec<(String, String, String, Option<String>, Option<serde_json::Value>)> = sqlx::query_as(
        "SELECT id, type, label, trust_mode, content FROM sources WHERE space_id = $1",
    )
    .bind(space_id)
    .fetch_all(pool)
    .await?;

    let sources = rows
        .into_iter()
        .map(|(id, kind, label, trust_mode, content)| {
            let (table_data, document_text) = match content {
                Some(serde_json::Value::Array(arr)) => {
                    let objects: Vec<std::collections::HashMap<String, serde_json::Value>> = arr
                        .into_iter()
                        .filter_map(|v| v.as_object()
                            .map(|m| m.clone().into_iter().collect::<std::collections::HashMap<String, serde_json::Value>>()))
                        .collect();
                    (Some(objects), None)
                }
                Some(serde_json::Value::String(s)) => (None, Some(s)),
                _ => (None, None),
            };
            RegisteredSource {
                id,
                kind,
                label,
                trust_mode,
                table_data,
                document_text,
            }
        })
        .collect();

    Ok(sources)
}

/// Save the source registry.
pub async fn save_source_registry(
    pool: &PgPool,
    space_id: &str,
    sources: &[RegisteredSource],
) -> Result<()> {
    // Delete existing sources for this space, then re-insert
    sqlx::query("DELETE FROM sources WHERE space_id = $1")
        .bind(space_id)
        .execute(pool)
        .await?;

    for source in sources {
        let content = match (&source.table_data, &source.document_text) {
            (Some(tables), _) => Some(serde_json::to_value(tables)?),
            (_, Some(text)) => Some(serde_json::Value::String(text.clone())),
            _ => None,
        };
        sqlx::query(
            "INSERT INTO sources (id, space_id, type, label, trust_mode, content) VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(&source.id)
        .bind(space_id)
        .bind(&source.kind)
        .bind(&source.label)
        .bind(&source.trust_mode)
        .bind(&content)
        .execute(pool)
        .await?;
    }
    Ok(())
}

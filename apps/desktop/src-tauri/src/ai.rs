use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub is_running: bool,
    pub version: Option<String>,
    pub models: Vec<String>,
}

#[tauri::command]
pub async fn check_ollama_status() -> Result<OllamaStatus, String> {
    // Attempt to hit the Ollama API
    let client = reqwest::Client::new();
    match client.get("http://localhost:11434/api/tags").send().await {
        Ok(response) => {
            if response.status().is_success() {
                // Parse models to verify it's really Ollama
                let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
                let models: Vec<String> = data["models"]
                    .as_array()
                    .unwrap_or(&vec![])
                    .iter()
                    .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                    .collect();

                return Ok(OllamaStatus {
                    is_running: true,
                    version: Some("Latest".to_string()), // Simplified
                    models,
                });
            }
        }
        Err(_) => {}
    }

    Ok(OllamaStatus {
        is_running: false,
        version: None,
        models: vec![],
    })
}

#[tauri::command]
pub async fn start_ollama_sidecar(app: AppHandle) -> Result<String, String> {
    // Check if already running first
    if let Ok(status) = check_ollama_status().await {
        if status.is_running {
            return Ok("Ollama is already running".to_string());
        }
    }

    let sidecar_command = app.shell().sidecar("ollama").map_err(|e| e.to_string())?;
    
    // Start Ollama with 'serve' command
    let (mut _rx, _child) = sidecar_command
        .args(["serve"])
        .spawn()
        .map_err(|e| format!("Failed to spawn Ollama: {}", e))?;

    // Use async sleep instead of blocking std::thread::sleep
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    Ok("Ollama started".to_string())
}


use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub struct WatcherState {
    pub watchers: Mutex<Vec<(PathBuf, RecommendedWatcher)>>,
}

#[derive(Clone, serde::Serialize)]
struct FileEventPayload {
    kind: String, // "create", "modify", "remove"
    paths: Vec<PathBuf>,
}

#[tauri::command]
pub async fn watch_folder(app: AppHandle, path: String) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("Path does not exist".to_string());
    }

    // Check if already watching this path
    {
        let state = app.state::<WatcherState>();
        let watchers = state.watchers.lock().unwrap();
        if watchers.iter().any(|(p, _)| p == &path_buf) {
            return Ok(format!("Already watching {}", path));
        }
    }

    let app_handle = app.clone();
    let (tx, rx) = std::sync::mpsc::channel();

    let mut watcher = RecommendedWatcher::new(tx, Config::default())
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(&path_buf, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch path: {}", e))?;

    // A separate thread to handle events from the channel
    std::thread::spawn(move || {
        for res in rx {
            match res {
                Ok(event) => {
                    let kind = format!("{:?}", event.kind);
                    let payload = FileEventPayload {
                        kind,
                        paths: event.paths,
                    };
                    let _ = app_handle.emit("fs://file-event", payload);
                }
                Err(e) => println!("watch error: {:?}", e),
            }
        }
    });
    
    // Store watcher with its path for later cleanup
    let state = app.state::<WatcherState>();
    state.watchers.lock().unwrap().push((path_buf.clone(), watcher));

    Ok(format!("Watching started for {}", path))
}

#[tauri::command]
pub async fn stop_watch_folder(app: AppHandle, path: String) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);
    let state = app.state::<WatcherState>();
    let mut watchers = state.watchers.lock().unwrap();
    
    let initial_len = watchers.len();
    watchers.retain(|(p, _)| p != &path_buf);
    
    if watchers.len() < initial_len {
        Ok(format!("Stopped watching {}", path))
    } else {
        Err(format!("Was not watching {}", path))
    }
}

#[tauri::command]
pub async fn stop_all_watchers(app: AppHandle) -> Result<String, String> {
    let state = app.state::<WatcherState>();
    let mut watchers = state.watchers.lock().unwrap();
    let count = watchers.len();
    watchers.clear();
    Ok(format!("Stopped {} watchers", count))
}


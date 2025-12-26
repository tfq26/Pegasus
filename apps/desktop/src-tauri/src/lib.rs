// Pegasus Desktop - AI-Powered Database Management
// Tauri Rust Backend

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use tauri_plugin_store::StoreExt;

// Local user stored in encrypted store
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalUser {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub password_hash: String,
    pub created_at: String,
    pub cloud_user_id: Option<String>, // WorkOS user ID when linked
    pub last_sync: Option<String>,
}

// Response for frontend
#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub success: bool,
    pub message: String,
    pub user: Option<LocalUserPublic>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalUserPublic {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub is_cloud_linked: bool,
}

// Create local account (offline registration)
#[tauri::command]
async fn create_local_account(
    app: tauri::AppHandle,
    username: String,
    password: String,
    email: Option<String>,
) -> Result<AuthResponse, String> {
    let store = app.store("local_auth.json").map_err(|e| e.to_string())?;

    // Check if username already exists
    if let Some(existing) = store.get(&username) {
        if existing.is_object() {
            return Ok(AuthResponse {
                success: false,
                message: "Username already exists".to_string(),
                user: None,
            });
        }
    }

    // Hash password with Argon2
    let salt = SaltString::generate(&mut rand::rngs::OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Failed to hash password: {}", e))?
        .to_string();

    // Create user
    let user = LocalUser {
        id: uuid::Uuid::new_v4().to_string(),
        username: username.clone(),
        email: email.clone(),
        password_hash,
        created_at: chrono::Utc::now().to_rfc3339(),
        cloud_user_id: None,
        last_sync: None,
    };

    // Store user
    store.set(
        &username,
        serde_json::to_value(&user).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    // Also store as "current_user" for session
    store.set("current_user", serde_json::json!(&username));
    store.save().map_err(|e| e.to_string())?;

    Ok(AuthResponse {
        success: true,
        message: "Account created successfully".to_string(),
        user: Some(LocalUserPublic {
            id: user.id,
            username: user.username,
            email: user.email,
            is_cloud_linked: false,
        }),
    })
}

// Login with local account
#[tauri::command]
async fn local_login(
    app: tauri::AppHandle,
    username: String,
    password: String,
) -> Result<AuthResponse, String> {
    let store = app.store("local_auth.json").map_err(|e| e.to_string())?;

    // Get user
    let user_value = store.get(&username).ok_or("User not found")?;
    let user: LocalUser = serde_json::from_value(user_value.clone())
        .map_err(|_| "Invalid user data")?;

    // Verify password
    let parsed_hash = PasswordHash::new(&user.password_hash)
        .map_err(|e| format!("Invalid password hash: {}", e))?;

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| "Invalid password")?;

    // Set current session
    store.set("current_user", serde_json::json!(&username));
    store.save().map_err(|e| e.to_string())?;

    Ok(AuthResponse {
        success: true,
        message: "Login successful".to_string(),
        user: Some(LocalUserPublic {
            id: user.id,
            username: user.username,
            email: user.email,
            is_cloud_linked: user.cloud_user_id.is_some(),
        }),
    })
}

// Get current logged in user
#[tauri::command]
async fn get_local_user(app: tauri::AppHandle) -> Result<Option<LocalUserPublic>, String> {
    let store = app.store("local_auth.json").map_err(|e| e.to_string())?;

    // Get current session
    let current_username = match store.get("current_user") {
        Some(v) => v.as_str().map(|s| s.to_string()),
        None => return Ok(None),
    };

    if let Some(username) = current_username {
        if let Some(user_value) = store.get(&username) {
            if let Ok(user) = serde_json::from_value::<LocalUser>(user_value.clone()) {
                return Ok(Some(LocalUserPublic {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    is_cloud_linked: user.cloud_user_id.is_some(),
                }));
            }
        }
    }

    Ok(None)
}

// Logout locally
#[tauri::command]
async fn local_logout(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store("local_auth.json").map_err(|e| e.to_string())?;
    store.delete("current_user");
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// Link local account to cloud (WorkOS)
#[tauri::command]
async fn link_to_cloud(
    app: tauri::AppHandle,
    cloud_user_id: String,
    cloud_email: String,
) -> Result<AuthResponse, String> {
    let store = app.store("local_auth.json").map_err(|e| e.to_string())?;

    // Get current user
    let current_username = store
        .get("current_user")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .ok_or("No user logged in")?;

    let user_value = store.get(&current_username).ok_or("User not found")?;
    let mut user: LocalUser = serde_json::from_value(user_value.clone())
        .map_err(|_| "Invalid user data")?;

    // Link to cloud
    user.cloud_user_id = Some(cloud_user_id);
    user.email = Some(cloud_email);
    user.last_sync = Some(chrono::Utc::now().to_rfc3339());

    // Save updated user
    store.set(
        &current_username,
        serde_json::to_value(&user).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;

    Ok(AuthResponse {
        success: true,
        message: "Account linked to cloud successfully".to_string(),
        user: Some(LocalUserPublic {
            id: user.id,
            username: user.username,
            email: user.email,
            is_cloud_linked: true,
        }),
    })
}

// Platform info command
#[tauri::command]
fn get_platform_info() -> serde_json::Value {
    serde_json::json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "version": env!("CARGO_PKG_VERSION")
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            create_local_account,
            local_login,
            get_local_user,
            local_logout,
            link_to_cloud
        ])
        .setup(|app| {
            // Handle deep links
            #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().on_open_url(move |event| {
                    println!("Deep link received: {:?}", event.urls());
                    let app_handle = app.handle();
                    for url in event.urls() {
                        let _ = app_handle.emit("deep-link://new-url", url.to_string());
                    }
                });
            }

            // Set up native menu bar
            use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem};

            let app_handle = app.handle();

            // File menu
            let file_menu = SubmenuBuilder::new(app_handle, "File")
                .item(&MenuItemBuilder::with_id("new_query", "New Query").accelerator("CmdOrCtrl+N").build(app_handle)?)
                .item(&MenuItemBuilder::with_id("open_connection", "Open Connection...").accelerator("CmdOrCtrl+O").build(app_handle)?)
                .separator()
                .item(&MenuItemBuilder::with_id("save", "Save").accelerator("CmdOrCtrl+S").build(app_handle)?)
                .item(&MenuItemBuilder::with_id("export", "Export...").accelerator("CmdOrCtrl+Shift+E").build(app_handle)?)
                .separator()
                .item(&PredefinedMenuItem::close_window(app_handle, Some("Close Window"))?)
                .build()?;

            // Edit menu
            let edit_menu = SubmenuBuilder::new(app_handle, "Edit")
                .item(&PredefinedMenuItem::undo(app_handle, Some("Undo"))?)
                .item(&PredefinedMenuItem::redo(app_handle, Some("Redo"))?)
                .separator()
                .item(&PredefinedMenuItem::cut(app_handle, Some("Cut"))?)
                .item(&PredefinedMenuItem::copy(app_handle, Some("Copy"))?)
                .item(&PredefinedMenuItem::paste(app_handle, Some("Paste"))?)
                .item(&PredefinedMenuItem::select_all(app_handle, Some("Select All"))?)
                .build()?;

            // View menu
            let view_menu = SubmenuBuilder::new(app_handle, "View")
                .item(&MenuItemBuilder::with_id("view_query", "Query").accelerator("CmdOrCtrl+1").build(app_handle)?)
                .item(&MenuItemBuilder::with_id("view_dashboard", "Dashboard").accelerator("CmdOrCtrl+2").build(app_handle)?)
                .separator()
                .item(&MenuItemBuilder::with_id("toggle_sidebar", "Toggle Sidebar").accelerator("CmdOrCtrl+\\").build(app_handle)?)
                .separator()
                .item(&PredefinedMenuItem::fullscreen(app_handle, Some("Toggle Full Screen"))?)
                .build()?;

            // Help menu
            let help_menu = SubmenuBuilder::new(app_handle, "Help")
                .item(&MenuItemBuilder::with_id("docs", "Documentation").build(app_handle)?)
                .item(&MenuItemBuilder::with_id("report_issue", "Report Issue...").build(app_handle)?)
                .separator()
                .item(&MenuItemBuilder::with_id("check_updates", "Check for Updates").build(app_handle)?)
                .build()?;

            // Build the main menu
            let menu = MenuBuilder::new(app_handle)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&help_menu)
                .build()?;

            // Set as the app menu
            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app_handle, event| {
                let window = app_handle.get_webview_window("main").unwrap();
                match event.id().as_ref() {
                    "new_query" => {
                        let _ = window.emit("menu:new-query", ());
                    }
                    "open_connection" => {
                        let _ = window.emit("menu:open-connection", ());
                    }
                    "save" => {
                        let _ = window.emit("menu:save", ());
                    }
                    "export" => {
                        let _ = window.emit("menu:export", ());
                    }
                    "view_query" => {
                        let _ = window.emit("menu:navigate", "/query");
                    }
                    "view_dashboard" => {
                        let _ = window.emit("menu:navigate", "/dashboard");
                    }
                    "toggle_sidebar" => {
                        let _ = window.emit("menu:toggle-sidebar", ());
                    }
                    "docs" => {
                        let _ = window.emit("menu:navigate", "/docs");
                    }
                    "report_issue" => {
                        let _ = tauri_plugin_opener::OpenerExt::opener(app_handle)
                            .open_url("https://github.com/taufeeq26/pegasus/issues", None::<&str>);
                    }
                    "check_updates" => {
                        let _ = window.emit("menu:check-updates", ());
                    }
                    _ => {}
                }
            });

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Pegasus");
}

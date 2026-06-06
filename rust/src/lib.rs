use std::sync::Mutex;

mod audio;
mod core_proof;
mod discovery;
mod domain;
mod session;
mod signaling;
mod webrtc_core;

use domain::{JoinMethod, JoinRequest, RoomSession, StartStreamResult};
use session::SessionStore;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn start_stream(store: tauri::State<'_, Mutex<SessionStore>>) -> Result<StartStreamResult, String> {
    store.lock().map_err(|error| error.to_string())?.start_stream()
}

#[tauri::command]
fn stop_stream(store: tauri::State<'_, Mutex<SessionStore>>) -> Result<RoomSession, String> {
    Ok(store.lock().map_err(|error| error.to_string())?.stop_stream())
}

#[tauri::command]
fn get_room_session(store: tauri::State<'_, Mutex<SessionStore>>) -> Result<RoomSession, String> {
    Ok(store.lock().map_err(|error| error.to_string())?.snapshot())
}

#[tauri::command]
fn set_lan_discovery(
    store: tauri::State<'_, Mutex<SessionStore>>,
    enabled: bool,
) -> Result<RoomSession, String> {
    store
        .lock()
        .map_err(|error| error.to_string())?
        .set_lan_discovery(enabled)
}

#[tauri::command]
fn submit_join_request(
    store: tauri::State<'_, Mutex<SessionStore>>,
    request: JoinRequest,
) -> Result<RoomSession, String> {
    store
        .lock()
        .map_err(|error| error.to_string())?
        .submit_join_request(request)
}

#[tauri::command]
fn add_dev_join_request(
    store: tauri::State<'_, Mutex<SessionStore>>,
    device_name: String,
    method: JoinMethod,
) -> Result<RoomSession, String> {
    store
        .lock()
        .map_err(|error| error.to_string())?
        .add_dev_join_request(device_name, method)
}

#[tauri::command]
fn allow_device(
    store: tauri::State<'_, Mutex<SessionStore>>,
    device_id: String,
) -> Result<RoomSession, String> {
    Ok(store
        .lock()
        .map_err(|error| error.to_string())?
        .allow_device(device_id))
}

#[tauri::command]
fn deny_device(
    store: tauri::State<'_, Mutex<SessionStore>>,
    device_id: String,
) -> Result<RoomSession, String> {
    Ok(store
        .lock()
        .map_err(|error| error.to_string())?
        .deny_device(device_id))
}

#[tauri::command]
fn unblock_device(
    store: tauri::State<'_, Mutex<SessionStore>>,
    device_id: String,
) -> Result<RoomSession, String> {
    Ok(store
        .lock()
        .map_err(|error| error.to_string())?
        .unblock_device(device_id))
}

#[tauri::command]
fn disconnect_device(
    store: tauri::State<'_, Mutex<SessionStore>>,
    device_id: String,
) -> Result<RoomSession, String> {
    Ok(store
        .lock()
        .map_err(|error| error.to_string())?
        .disconnect_device(device_id))
}

#[tauri::command]
fn set_device_sharing(
    store: tauri::State<'_, Mutex<SessionStore>>,
    device_id: String,
    enabled: bool,
) -> Result<RoomSession, String> {
    Ok(store
        .lock()
        .map_err(|error| error.to_string())?
        .set_device_sharing(device_id, enabled))
}

#[tauri::command]
fn get_core_proof_status() -> core_proof::CoreProofStatus {
    core_proof::proof_status()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(Mutex::new(SessionStore::default()))
        .invoke_handler(tauri::generate_handler![
            greet,
            start_stream,
            stop_stream,
            get_room_session,
            set_lan_discovery,
            submit_join_request,
            add_dev_join_request,
            allow_device,
            deny_device,
            unblock_device,
            disconnect_device,
            set_device_sharing,
            get_core_proof_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use std::sync::{Arc, Mutex};

mod audio;
mod core_proof;
mod discovery;
mod domain;
mod session;
mod signaling;
mod webrtc_core;

use discovery::{DiscoveredHost, DiscoveryAdvertiser};
use domain::{
    IceCandidateMessage, JoinMethod, JoinRequest, RoomSession, SessionDescriptionMessage,
    SignalClientMessage, SignalServerMessage, StartStreamResult,
};
use session::SessionStore;
use signaling::{SharedSession, SignalingServer};
use specta_typescript::Typescript;
use tauri_specta::{collect_commands, Builder, ErrorHandlingMode};
use webrtc_core::media_hub::{MediaHub, SharedMediaHub};

struct AppState {
    session: SharedSession,
    media: Mutex<Option<SharedMediaHub>>,
    signaling: Mutex<Option<SignalingServer>>,
    discovery: Mutex<Option<DiscoveryAdvertiser>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            session: Arc::new(Mutex::new(SessionStore::default())),
            media: Mutex::new(None),
            signaling: Mutex::new(None),
            discovery: Mutex::new(None),
        }
    }
}

#[tauri::command]
#[specta::specta]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
#[specta::specta]
fn start_stream(state: tauri::State<'_, AppState>) -> Result<StartStreamResult, String> {
    stop_discovery(&state)?;
    stop_signaling(&state)?;
    stop_media(&state)?;

    let media = MediaHub::start()?;
    let server = SignalingServer::start(Arc::clone(&state.session), Arc::clone(&media))?;
    let port = server.port();
    let host = local_ip_address::local_ip()
        .map(|ip_address| ip_address.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    let result = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .start_stream(host, port)?;

    *state.signaling.lock().map_err(|error| error.to_string())? = Some(server);
    *state.media.lock().map_err(|error| error.to_string())? = Some(media);

    Ok(result)
}

#[tauri::command]
#[specta::specta]
fn stop_stream(state: tauri::State<'_, AppState>) -> Result<RoomSession, String> {
    stop_discovery(&state)?;
    stop_signaling(&state)?;
    stop_media(&state)?;
    Ok(state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .stop_stream())
}

#[tauri::command]
#[specta::specta]
fn get_room_session(state: tauri::State<'_, AppState>) -> Result<RoomSession, String> {
    Ok(state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .snapshot())
}

#[tauri::command]
#[specta::specta]
fn set_lan_discovery(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<RoomSession, String> {
    stop_discovery(&state)?;

    let payload = if enabled {
        Some(
            state
                .session
                .lock()
                .map_err(|error| error.to_string())?
                .active_pairing_payload()?,
        )
    } else {
        None
    };

    let session = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .set_lan_discovery(enabled)?;

    if let Some(payload) = payload {
        *state.discovery.lock().map_err(|error| error.to_string())? =
            Some(DiscoveryAdvertiser::start(&payload)?);
    }

    Ok(session)
}

#[tauri::command]
#[specta::specta]
fn submit_join_request(
    state: tauri::State<'_, AppState>,
    request: JoinRequest,
) -> Result<RoomSession, String> {
    state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .submit_join_request(request)
}

#[tauri::command]
#[specta::specta]
fn add_dev_join_request(
    state: tauri::State<'_, AppState>,
    device_name: String,
    method: JoinMethod,
) -> Result<RoomSession, String> {
    state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .add_dev_join_request(device_name, method)
}

#[tauri::command]
#[specta::specta]
fn allow_device(
    state: tauri::State<'_, AppState>,
    device_id: String,
) -> Result<RoomSession, String> {
    Ok(state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .allow_device(device_id))
}

#[tauri::command]
#[specta::specta]
fn deny_device(
    state: tauri::State<'_, AppState>,
    device_id: String,
) -> Result<RoomSession, String> {
    Ok(state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .deny_device(device_id))
}

#[tauri::command]
#[specta::specta]
fn unblock_device(
    state: tauri::State<'_, AppState>,
    device_id: String,
) -> Result<RoomSession, String> {
    Ok(state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .unblock_device(device_id))
}

#[tauri::command]
#[specta::specta]
fn disconnect_device(
    state: tauri::State<'_, AppState>,
    device_id: String,
) -> Result<RoomSession, String> {
    Ok(state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .disconnect_device(device_id))
}

#[tauri::command]
#[specta::specta]
fn set_device_sharing(
    state: tauri::State<'_, AppState>,
    device_id: String,
    enabled: bool,
) -> Result<RoomSession, String> {
    Ok(state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .set_device_sharing(device_id, enabled))
}

#[tauri::command]
#[specta::specta]
fn get_core_proof_status() -> core_proof::CoreProofStatus {
    core_proof::proof_status()
}

#[tauri::command]
#[specta::specta]
fn find_nearby_hosts() -> Result<Vec<DiscoveredHost>, String> {
    discovery::browse_hosts(1_500)
}

fn stop_signaling(state: &tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(mut server) = state
        .signaling
        .lock()
        .map_err(|error| error.to_string())?
        .take()
    {
        server.stop();
    }

    Ok(())
}

fn stop_media(state: &tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(media) = state.media.lock().map_err(|error| error.to_string())?.take() {
        tauri::async_runtime::block_on(media.stop());
    }

    Ok(())
}

fn stop_discovery(state: &tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(advertiser) = state
        .discovery
        .lock()
        .map_err(|error| error.to_string())?
        .take()
    {
        advertiser.stop();
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = command_builder();

    #[cfg(debug_assertions)]
    export_bindings(&builder);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState::default())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn command_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .error_handling(ErrorHandlingMode::Throw)
        .typ::<IceCandidateMessage>()
        .typ::<SessionDescriptionMessage>()
        .typ::<SignalClientMessage>()
        .typ::<SignalServerMessage>()
        .commands(collect_commands![
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
            get_core_proof_status,
            find_nearby_hosts
        ])
}

#[cfg(debug_assertions)]
fn export_bindings(builder: &Builder<tauri::Wry>) {
    builder
        .export(
            Typescript::default(),
            "../frontend/shared/bindings/tauri.ts",
        )
        .expect("failed to export Tauri bindings");
}

#[cfg(test)]
mod tests {
    use super::{command_builder, export_bindings};

    #[test]
    fn export_typescript_bindings() {
        let builder = command_builder();
        export_bindings(&builder);
    }
}

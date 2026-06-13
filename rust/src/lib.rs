use std::sync::{Arc, Mutex};

mod audio;
mod core_proof;
mod discovery;
mod domain;
mod eko_media;
pub mod linux_wayland;
mod media;
mod mobile_receiver;
mod network_host;
mod profiler;
mod session;
mod signaling;
mod web_client;
mod webrtc_core;

use discovery::{DiscoveredHost, DiscoveryAdvertiser};
use domain::{
    IceCandidateMessage, JoinMethod, JoinRequest, NativeReceiverEvent, QrPairingPayload,
    RoomSession, SessionDescriptionMessage, SignalClientMessage, SignalServerMessage,
    StartStreamResult, StreamProfilerSample,
};
use mobile_receiver::NativeReceiverManager;
use session::SessionStore;
use signaling::{emit_room_session, SharedSession, SignalingServer};
#[cfg(any(test, all(debug_assertions, not(mobile))))]
use specta_typescript::Typescript;
use tauri_plugin_log::fern::colors::{Color, ColoredLevelConfig};
use tauri_plugin_log::{Target, TargetKind};
use tauri_specta::{collect_commands, Builder, ErrorHandlingMode};
use webrtc_core::media_hub::{MediaHub, SharedMediaHub};

struct AppState {
    session: SharedSession,
    media: Mutex<Option<SharedMediaHub>>,
    receiver: NativeReceiverManager,
    signaling: Mutex<Option<SignalingServer>>,
    discovery: Mutex<Option<DiscoveryAdvertiser>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            session: Arc::new(Mutex::new(SessionStore::default())),
            media: Mutex::new(None),
            receiver: NativeReceiverManager::default(),
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
fn start_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<StartStreamResult, String> {
    stop_discovery(&state)?;
    stop_signaling(&state)?;
    stop_media(&state)?;

    let media = MediaHub::start(Some(Arc::clone(&state.session)), Some(app.clone()))?;
    let server =
        SignalingServer::start(Arc::clone(&state.session), Arc::clone(&media), app.clone())?;
    let port = server.port();
    log::info!("Signaling server started on port {port}");
    let host = network_host::pairing_host()?;
    let mut result = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .start_stream(host, port)?;
    let advertiser = DiscoveryAdvertiser::start(&result.qr_payload)?;
    result.session = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .set_lan_discovery(true)?;

    *state.signaling.lock().map_err(|error| error.to_string())? = Some(server);
    *state.media.lock().map_err(|error| error.to_string())? = Some(media);
    *state.discovery.lock().map_err(|error| error.to_string())? = Some(advertiser);

    emit_room_session(&app, result.session.clone());
    Ok(result)
}

#[tauri::command]
#[specta::specta]
fn stop_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<RoomSession, String> {
    stop_discovery(&state)?;
    stop_signaling(&state)?;
    stop_media(&state)?;
    let session = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .stop_stream();
    emit_room_session(&app, session.clone());
    Ok(session)
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
    app: tauri::AppHandle,
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

    emit_room_session(&app, session.clone());
    Ok(session)
}

#[tauri::command]
#[specta::specta]
fn submit_join_request(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: JoinRequest,
) -> Result<RoomSession, String> {
    let session = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .submit_join_request(request)?;
    emit_room_session(&app, session.clone());
    Ok(session)
}

#[tauri::command]
#[specta::specta]
fn add_dev_join_request(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    device_name: String,
    method: JoinMethod,
) -> Result<RoomSession, String> {
    let session = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .add_dev_join_request(device_name, method)?;
    emit_room_session(&app, session.clone());
    Ok(session)
}

#[tauri::command]
#[specta::specta]
fn allow_device(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    device_id: String,
) -> Result<RoomSession, String> {
    let session = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .allow_device(device_id);
    emit_room_session(&app, session.clone());
    Ok(session)
}

#[tauri::command]
#[specta::specta]
fn deny_device(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    device_id: String,
) -> Result<RoomSession, String> {
    let session = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .deny_device(device_id);
    emit_room_session(&app, session.clone());
    Ok(session)
}

#[tauri::command]
#[specta::specta]
fn unblock_device(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    device_id: String,
) -> Result<RoomSession, String> {
    let session = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .unblock_device(device_id);
    emit_room_session(&app, session.clone());
    Ok(session)
}

#[tauri::command]
#[specta::specta]
fn disconnect_device(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    device_id: String,
) -> Result<RoomSession, String> {
    let session = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .disconnect_device(device_id);
    emit_room_session(&app, session.clone());
    Ok(session)
}

#[tauri::command]
#[specta::specta]
fn set_device_sharing(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    device_id: String,
    enabled: bool,
) -> Result<RoomSession, String> {
    let session = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .set_device_sharing(device_id, enabled);
    emit_room_session(&app, session.clone());
    Ok(session)
}

#[tauri::command]
#[specta::specta]
fn clear_session_events(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<RoomSession, String> {
    let session = state
        .session
        .lock()
        .map_err(|error| error.to_string())?
        .clear_events();
    emit_room_session(&app, session.clone());
    Ok(session)
}

#[tauri::command]
#[specta::specta]
fn get_core_proof_status() -> core_proof::CoreProofStatus {
    core_proof::proof_status()
}

#[tauri::command]
#[specta::specta]
fn get_audio_capture_status() -> audio::AudioProofStatus {
    audio::proof_status()
}

#[tauri::command]
#[specta::specta]
fn find_nearby_hosts() -> Result<Vec<DiscoveredHost>, String> {
    discovery::browse_hosts(1_500)
}

#[tauri::command]
#[specta::specta]
fn start_native_receiver(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    payload: QrPairingPayload,
    request: JoinRequest,
) -> Result<(), String> {
    state.receiver.start(app, payload, request)
}

#[tauri::command]
#[specta::specta]
fn stop_native_receiver(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.receiver.stop();
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn start_android_media_session(app: tauri::AppHandle) -> Result<(), String> {
    eko_media::start_session(&app)
}

#[tauri::command]
#[specta::specta]
fn stop_android_media_session(app: tauri::AppHandle) -> Result<(), String> {
    eko_media::stop_session(&app)
}

#[tauri::command]
#[specta::specta]
fn media_play() -> Result<(), String> {
    media::play()
}

#[tauri::command]
#[specta::specta]
fn media_pause() -> Result<(), String> {
    media::pause()
}

#[tauri::command]
#[specta::specta]
fn media_toggle() -> Result<(), String> {
    media::toggle()
}

#[tauri::command]
#[specta::specta]
fn media_next() -> Result<(), String> {
    media::next()
}

#[tauri::command]
#[specta::specta]
fn media_previous() -> Result<(), String> {
    media::previous()
}

#[tauri::command]
#[specta::specta]
fn media_get_state() -> Result<Option<media::MediaState>, String> {
    media::get_state()
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
    if let Some(media) = state
        .media
        .lock()
        .map_err(|error| error.to_string())?
        .take()
    {
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
    install_panic_logger();
    let builder = command_builder();

    #[cfg(all(debug_assertions, not(mobile)))]
    export_bindings(&builder);

    tauri::Builder::default()
        .plugin({
            let colors = ColoredLevelConfig::new()
                .info(Color::Green)
                .warn(Color::Yellow)
                .error(Color::Red)
                .debug(Color::Blue)
                .trace(Color::Magenta);

            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .level_for("dtls", log::LevelFilter::Error)
                .level_for("webrtc_ice", log::LevelFilter::Warn)
                .level_for("mdns_sd", log::LevelFilter::Warn)
                .format(move |out, message, _record| {
                    out.finish(format_args!("{} {}", colors.color(_record.level()), message))
                })
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("eko.log".to_string()),
                    }),
                    Target::new(TargetKind::Webview),
                ])
                .build()
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(eko_media::init())
        .manage(AppState::default())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            media::start_monitoring(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            log::error!("Tauri runtime failed: {error}");
            eprintln!("Tauri runtime failed: {error}");
        });
}

fn install_panic_logger() {
    std::panic::set_hook(Box::new(|panic_info| {
        let location = panic_info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown location".to_string());
        let message = panic_info
            .payload()
            .downcast_ref::<&str>()
            .map(|message| (*message).to_string())
            .or_else(|| {
                panic_info
                    .payload()
                    .downcast_ref::<String>()
                    .map(ToString::to_string)
            })
            .unwrap_or_else(|| "unknown panic".to_string());

        log::error!("Unexpected panic at {location}: {message}");
        eprintln!("Unexpected panic at {location}: {message}");
    }));
}

fn command_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .error_handling(ErrorHandlingMode::Throw)
        .typ::<IceCandidateMessage>()
        .typ::<SessionDescriptionMessage>()
        .typ::<SignalClientMessage>()
        .typ::<SignalServerMessage>()
        .typ::<NativeReceiverEvent>()
        .typ::<StreamProfilerSample>()
        .typ::<media::MediaState>()
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
            clear_session_events,
            get_core_proof_status,
            get_audio_capture_status,
            find_nearby_hosts,
            start_native_receiver,
            stop_native_receiver,
            start_android_media_session,
            stop_android_media_session,
            media_play,
            media_pause,
            media_toggle,
            media_next,
            media_previous,
            media_get_state
        ])
}

#[cfg(any(test, all(debug_assertions, not(mobile))))]
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

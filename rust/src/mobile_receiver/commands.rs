use crate::{domain::{JoinRequest, QrPairingPayload}, eko_media, AppState};

#[tauri::command]
#[specta::specta]
pub(crate) fn start_native_receiver(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    payload: QrPairingPayload,
    request: JoinRequest,
) -> Result<(), String> {
    state.receiver.start(app, payload, request)
}

#[tauri::command]
#[specta::specta]
pub(crate) fn stop_native_receiver(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.receiver.stop();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) fn start_android_media_session(app: tauri::AppHandle) -> Result<(), String> {
    eko_media::start_session(&app)
}

#[tauri::command]
#[specta::specta]
pub(crate) fn stop_android_media_session(app: tauri::AppHandle) -> Result<(), String> {
    eko_media::stop_session(&app)
}

#[tauri::command]
#[specta::specta]
pub(crate) fn rename_native_receiver(state: tauri::State<'_, AppState>, name: String) -> Result<(), String> {
    state.receiver.rename(name)
}

#[tauri::command]
#[specta::specta]
pub(crate) fn set_android_playback_paused(app: tauri::AppHandle, paused: bool) -> Result<(), String> {
    use tauri::Manager;
    app.state::<eko_media::EkoMedia<tauri::Wry>>().set_paused(paused)
}

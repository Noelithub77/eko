use crate::media::platform::ControlCommand;
use crate::media::MediaState;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

static APP: OnceLock<AppHandle> = OnceLock::new();
static COMMAND_TX: OnceLock<Mutex<Option<mpsc::Sender<smtc_suite::MediaCommand>>>> =
    OnceLock::new();
static LAST_STATE: OnceLock<Mutex<MediaState>> = OnceLock::new();

pub fn start_monitoring(app: AppHandle) {
    let _ = APP.set(app.clone());
    let _ = LAST_STATE.get_or_init(|| {
        Mutex::new(MediaState {
            title: None,
            artist: None,
            album: None,
            is_playing: false,
            position_ms: None,
            duration_ms: None,
            app_name: None,
        })
    });

    tauri::async_runtime::spawn(async move {
        let (controller, mut update_rx) = match smtc_suite::MediaManager::start() {
            Ok((c, rx)) => (c, rx),
            Err(e) => {
                log::error!("Failed to start SMTC media monitor: {}", e);
                return;
            }
        };

        log::info!("SMTC media monitoring started");

        // Store the command sender for control commands
        let _ = COMMAND_TX.get_or_init(|| Mutex::new(Some(controller.command_tx)));

        while let Some(update) = update_rx.recv().await {
            match update {
                smtc_suite::MediaUpdate::TrackChanged(info) => {
                    let state = MediaState {
                        title: info.title.clone(),
                        artist: info.artist.clone(),
                        album: info.album_title.clone(),
                        is_playing: info
                            .playback_status
                            .as_ref()
                            .map(|s| *s == smtc_suite::PlaybackStatus::Playing)
                            .unwrap_or(false),
                        position_ms: info.position_ms.map(|v| v as f64),
                        duration_ms: info.duration_ms.map(|v| v as f64),
                        app_name: None,
                    };
                    emit_and_store(&app, state);
                }
                smtc_suite::MediaUpdate::SessionsChanged(_) => {
                    // Session list changed, keep last known state
                }
                smtc_suite::MediaUpdate::Error(e) => {
                    log::error!("SMTC media error: {}", e);
                }
                _ => {}
            }
        }

        log::info!("SMTC media monitoring stopped");
    });
}

pub fn control(cmd: ControlCommand) -> Result<(), String> {
    let guard = COMMAND_TX
        .get()
        .and_then(|m| m.lock().ok())
        .ok_or_else(|| "Media controller not initialized".to_string())?;

    let tx = guard
        .as_ref()
        .ok_or_else(|| "Media controller not available")?;

    let control = match cmd {
        ControlCommand::Play => smtc_suite::SmtcControlCommand::Play,
        ControlCommand::Pause => smtc_suite::SmtcControlCommand::Pause,
        ControlCommand::Next => smtc_suite::SmtcControlCommand::SkipNext,
        ControlCommand::Previous => smtc_suite::SmtcControlCommand::SkipPrevious,
        ControlCommand::Toggle => {
            if get_state()?.map(|state| state.is_playing).unwrap_or(false) {
                smtc_suite::SmtcControlCommand::Pause
            } else {
                smtc_suite::SmtcControlCommand::Play
            }
        }
    };
    let command = smtc_suite::MediaCommand::Control(control);

    tx.try_send(command)
        .map_err(|e| format!("Failed to send command: {}", e))
}

fn emit_and_store(app: &AppHandle, state: MediaState) {
    if let Some(mut last) = LAST_STATE.get().and_then(|m| m.lock().ok()) {
        *last = state.clone();
    }
    if let Err(e) = app.emit("media-changed", state) {
        log::error!("Failed to emit media-changed event: {}", e);
    }
}

pub fn get_state() -> Result<Option<MediaState>, String> {
    let guard = LAST_STATE
        .get()
        .and_then(|m| m.lock().ok())
        .ok_or_else(|| "Media state not initialized".to_string())?;
    let last = guard.clone();
    if last.title.is_none() && last.artist.is_none() {
        return Ok(None);
    }
    Ok(Some(last))
}

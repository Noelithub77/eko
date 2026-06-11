use crate::media::MediaState;
use tauri::{AppHandle, Emitter};

pub fn start_monitoring(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let (controller, mut update_rx) = match smtc_suite::MediaManager::start() {
            Ok((c, rx)) => (c, rx),
            Err(e) => {
                log::error!("Failed to start SMTC media monitor: {}", e);
                return;
            }
        };

        log::info!("SMTC media monitoring started");

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
                        position_ms: info.position_ms,
                        duration_ms: info.duration_ms,
                        app_name: None,
                    };

                    if let Err(e) = app.emit("media-changed", state) {
                        log::error!("Failed to emit media-changed event: {}", e);
                    }
                }
                smtc_suite::MediaUpdate::Error(e) => {
                    log::error!("SMTC media error: {}", e);
                }
                _ => {}
            }
        }

        log::info!("SMTC media monitoring stopped");
        let _ = controller;
    });
}

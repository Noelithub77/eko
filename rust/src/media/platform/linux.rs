use crate::media::MediaState;
use tauri::{AppHandle, Emitter};

pub fn start_monitoring(app: AppHandle) {
    std::thread::spawn(move || {
        let finder = match mpris::PlayerFinder::new() {
            Ok(f) => f,
            Err(e) => {
                log::error!("Failed to connect to D-Bus for media monitoring: {}", e);
                return;
            }
        };

        let player = match finder.find_active() {
            Ok(p) => p,
            Err(_) => {
                log::info!("No active MPRIS media player found");
                return;
            }
        };

        log::info!("Monitoring media player: {}", player.identity());

        // Send initial state
        emit_state(&app, &player);

        // Start event loop
        let events = match player.events() {
            Ok(e) => e,
            Err(e) => {
                log::error!("Failed to start MPRIS event stream: {}", e);
                return;
            }
        };

        for event in events {
            match event {
                Ok(_) => {
                    emit_state(&app, &player);
                }
                Err(e) => {
                    log::error!("MPRIS event error: {}", e);
                    break;
                }
            }
        }
    });
}

fn emit_state(app: &AppHandle, player: &mpris::Player) {
    let metadata = player.get_metadata().ok();
    let playback_status = player.get_playback_status().ok();
    let position = player.get_position().ok();
    let duration = metadata.as_ref().and_then(|m| m.length());

    let state = MediaState {
        title: metadata.as_ref().and_then(|m| m.title().map(|s| s.to_string())),
        artist: metadata.as_ref().and_then(|m| m.artists().map(|v| v.join(", "))),
        album: metadata.as_ref().and_then(|m| m.album_name().map(|s| s.to_string())),
        is_playing: playback_status == Some(mpris::PlaybackStatus::Playing),
        position_ms: position.map(|d| d.as_millis() as u64),
        duration_ms: duration.map(|d| d.as_millis() as u64),
        app_name: Some(player.identity().to_string()),
    };

    if let Err(e) = app.emit("media-changed", state) {
        log::error!("Failed to emit media-changed event: {}", e);
    }
}

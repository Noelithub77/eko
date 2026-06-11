use crate::media::MediaState;
use crate::media::platform::ControlCommand;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn start_monitoring(app: AppHandle) {
    let _ = APP.set(app.clone());

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

        emit_state(&app, &player);

        let events = match player.events() {
            Ok(e) => e,
            Err(e) => {
                log::error!("Failed to start MPRIS event stream: {}", e);
                return;
            }
        };

        for event in events {
            if event.is_ok() {
                emit_state(&app, &player);
            } else if let Err(e) = event {
                log::error!("MPRIS event error: {}", e);
                break;
            }
        }
    });
}

pub fn control(cmd: ControlCommand) -> Result<(), String> {
    let finder = mpris::PlayerFinder::new().map_err(|e| e.to_string())?;
    let player = finder.find_active().map_err(|e| e.to_string())?;

    match cmd {
        ControlCommand::Play => player.play().map_err(|e| e.to_string())?,
        ControlCommand::Pause => player.pause().map_err(|e| e.to_string())?,
        ControlCommand::Next => player.next().map_err(|e| e.to_string())?,
        ControlCommand::Previous => player.previous().map_err(|e| e.to_string())?,
        ControlCommand::Toggle => {
            if player.get_playback_status().map_err(|e| e.to_string())?
                == mpris::PlaybackStatus::Playing
            {
                player.pause().map_err(|e| e.to_string())?;
            } else {
                player.play().map_err(|e| e.to_string())?;
            }
        }
    }

    // The mpris crate's Event enum has no StatusChanged variant,
    // so PlaybackStatus property changes are dropped. Emit state directly.
    if let Some(app) = APP.get() {
        emit_state(app, &player);
    }

    Ok(())
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
        position_ms: position.map(|d| d.as_millis() as f64),
        duration_ms: duration.map(|d| d.as_millis() as f64),
        app_name: Some(player.identity().to_string()),
    };

    if let Err(e) = app.emit("media-changed", state) {
        log::error!("Failed to emit media-changed event: {}", e);
    }
}

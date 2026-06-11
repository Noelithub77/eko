use crate::media::platform::ControlCommand;
use crate::media::MediaState;
use std::sync::OnceLock;
use std::time::Duration;
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

        // Outer loop: handles player disconnects and re-connects.
        // If no active player is found, poll every 2s until one appears.
        loop {
            let player = match finder.find_active() {
                Ok(p) => p,
                Err(_) => {
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            };

            log::info!("Monitoring media player: {}", player.identity());
            emit_state(&app, &player);

            let events = match player.events() {
                Ok(e) => e,
                Err(e) => {
                    log::error!("Failed to start MPRIS event stream: {}", e);
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            };

            // Inner loop: process events from the current player.
            // Breaks when the player disconnects or events error out.
            // The outer loop then tries to find another player.
            for event in events {
                match event {
                    Ok(_) => emit_state(&app, &player),
                    Err(e) => {
                        log::info!("MPRIS event stream ended ({}), looking for new player", e);
                        break;
                    }
                }
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

    // Emit state for play/pause/toggle — the mpris crate's Event enum has no
    // StatusChanged variant, so PlaybackStatus changes are dropped by the event loop.
    // Skip next/previous — the event loop catches TrackChanged with complete metadata,
    // and the player may not have finished populating metadata yet (race condition).
    let emit_needed = matches!(
        cmd,
        ControlCommand::Play | ControlCommand::Pause | ControlCommand::Toggle
    );
    if emit_needed {
        if let Some(app) = APP.get() {
            emit_state(app, &player);
        }
    }

    Ok(())
}

fn build_state(player: &mpris::Player) -> MediaState {
    let metadata = player.get_metadata().ok();
    let playback_status = player.get_playback_status().ok();
    let position = player.get_position().ok();
    let duration = metadata.as_ref().and_then(|m| m.length());

    MediaState {
        title: metadata
            .as_ref()
            .and_then(|m| m.title().map(|s| s.to_string())),
        artist: metadata
            .as_ref()
            .and_then(|m| m.artists().map(|v| v.join(", "))),
        album: metadata
            .as_ref()
            .and_then(|m| m.album_name().map(|s| s.to_string())),
        is_playing: playback_status == Some(mpris::PlaybackStatus::Playing),
        position_ms: position.map(|d| d.as_millis() as f64),
        duration_ms: duration.map(|d| d.as_millis() as f64),
        app_name: Some(player.identity().to_string()),
    }
}

fn emit_state(app: &AppHandle, player: &mpris::Player) {
    let state = build_state(player);
    if let Err(e) = app.emit("media-changed", state) {
        log::error!("Failed to emit media-changed event: {}", e);
    }
}

pub fn get_state() -> Result<Option<MediaState>, String> {
    let finder = mpris::PlayerFinder::new().map_err(|e| e.to_string())?;
    match finder.find_active() {
        Ok(player) => Ok(Some(build_state(&player))),
        Err(_) => Ok(None),
    }
}

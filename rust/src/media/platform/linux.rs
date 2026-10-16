use crate::media::platform::ControlCommand;
use crate::media::MediaState;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL: Duration = Duration::from_secs(1);
// Re-emit when the reported position drifts this far from the local clock (a seek).
const SEEK_THRESHOLD_MS: f64 = 1500.0;

static APP: OnceLock<AppHandle> = OnceLock::new();
// Bus name of the player we last followed, so a paused player stays selected.
static CURRENT: Mutex<Option<String>> = Mutex::new(None);

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

        // Poll instead of following one player's event stream: players come and go,
        // and the one the user is listening to can change at any time.
        let mut last: Option<Emitted> = None;
        loop {
            let state = select_player(&finder).map(|player| build_state(&player));
            if should_emit(last.as_ref(), state.as_ref()) {
                if let Err(e) = app.emit("media-changed", state.clone()) {
                    log::error!("Failed to emit media-changed event: {}", e);
                }
                last = Some(Emitted { state, at: Instant::now() });
            }
            std::thread::sleep(POLL_INTERVAL);
        }
    });
}

pub fn control(cmd: ControlCommand) -> Result<(), String> {
    let finder = mpris::PlayerFinder::new().map_err(|e| e.to_string())?;
    let player = select_player(&finder).ok_or("No media player found")?;

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

    // Emit play/pause right away instead of waiting for the next poll.
    // Next/previous wait for the poll so the player can finish loading metadata.
    let emit_needed = matches!(
        cmd,
        ControlCommand::Play | ControlCommand::Pause | ControlCommand::Toggle
    );
    if emit_needed {
        if let Some(app) = APP.get() {
            if let Err(e) = app.emit("media-changed", Some(build_state(&player))) {
                log::error!("Failed to emit media-changed event: {}", e);
            }
        }
    }

    Ok(())
}

pub fn get_state() -> Result<Option<MediaState>, String> {
    let finder = mpris::PlayerFinder::new().map_err(|e| e.to_string())?;
    Ok(select_player(&finder).map(|player| build_state(&player)))
}

/// Picks the player the user is most likely listening to: a playing player,
/// else the one we already follow, else the one with the fullest track info.
/// Ambient mixers expose a title with no artist, so they lose to music players.
fn select_player(finder: &mpris::PlayerFinder) -> Option<mpris::Player> {
    let players = match finder.find_all() {
        Ok(players) => players,
        Err(e) => {
            log::warn!("Failed to list media players: {}", e);
            return None;
        }
    };
    let mut current = current_bus();

    let playing = |p: &mpris::Player| p.get_playback_status().ok() == Some(mpris::PlaybackStatus::Playing);
    let current_index = current
        .as_deref()
        .and_then(|bus| players.iter().position(|p| p.bus_name() == bus));

    let index = match current_index {
        Some(i) if playing(&players[i]) => Some(i),
        _ => players
            .iter()
            .position(playing)
            .or(current_index)
            .or_else(|| richest_track(&players)),
    };

    *current = index.map(|i| players[i].bus_name().to_string());
    drop(current);
    index.and_then(|i| players.into_iter().nth(i))
}

fn richest_track(players: &[mpris::Player]) -> Option<usize> {
    let score = |p: &mpris::Player| {
        p.get_metadata().map_or(0, |m| {
            usize::from(m.title().is_some_and(|t| !t.is_empty()))
                + usize::from(m.artists().is_some_and(|a| a.iter().any(|n| !n.is_empty())))
                + usize::from(m.length().is_some())
        })
    };
    // max_by_key keeps the last maximum; reverse so ties go to the first player.
    (0..players.len()).rev().max_by_key(|&i| score(&players[i]))
}

fn current_bus() -> MutexGuard<'static, Option<String>> {
    CURRENT.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

struct Emitted {
    state: Option<MediaState>,
    at: Instant,
}

fn should_emit(last: Option<&Emitted>, next: Option<&MediaState>) -> bool {
    let Some(last) = last else { return true };
    match (last.state.as_ref(), next) {
        (None, None) => false,
        (Some(a), Some(b)) => {
            let same_track = a.title == b.title
                && a.artist == b.artist
                && a.album == b.album
                && a.app_name == b.app_name
                && a.duration_ms == b.duration_ms
                && a.is_playing == b.is_playing;
            !same_track || has_seeked(a, b, last.at)
        }
        _ => true,
    }
}

fn has_seeked(previous: &MediaState, next: &MediaState, emitted_at: Instant) -> bool {
    let (Some(before), Some(now)) = (previous.position_ms, next.position_ms) else {
        return false;
    };
    let elapsed = if previous.is_playing {
        emitted_at.elapsed().as_millis() as f64
    } else {
        0.0
    };
    (now - (before + elapsed)).abs() > SEEK_THRESHOLD_MS
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

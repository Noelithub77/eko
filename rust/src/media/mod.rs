use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

pub mod platform;

#[derive(Clone, Debug, Default, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub is_playing: bool,
    pub position_ms: Option<f64>,
    pub duration_ms: Option<f64>,
    pub app_name: Option<String>,
}

pub fn start_monitoring(app: AppHandle) {
    platform::start_monitoring(app);
}

pub fn play() -> Result<(), String> {
    platform::control(platform::ControlCommand::Play)
}

pub fn pause() -> Result<(), String> {
    platform::control(platform::ControlCommand::Pause)
}

pub fn next() -> Result<(), String> {
    platform::control(platform::ControlCommand::Next)
}

pub fn previous() -> Result<(), String> {
    platform::control(platform::ControlCommand::Previous)
}

pub fn toggle() -> Result<(), String> {
    platform::control(platform::ControlCommand::Toggle)
}

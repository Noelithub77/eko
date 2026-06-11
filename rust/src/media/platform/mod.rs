#[cfg(target_os = "linux")]
mod linux;

#[cfg(target_os = "windows")]
mod windows;

use tauri::AppHandle;

pub enum ControlCommand {
    Play,
    Pause,
    Next,
    Previous,
    Toggle,
}

pub fn start_monitoring(app: AppHandle) {
    #[cfg(target_os = "linux")]
    linux::start_monitoring(app);

    #[cfg(target_os = "windows")]
    windows::start_monitoring(app);

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = app;
        log::info!("Media monitoring not available on this platform");
    }
}

pub fn control(cmd: ControlCommand) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    return linux::control(cmd);

    #[cfg(target_os = "windows")]
    return windows::control(cmd);

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = cmd;
        Err("Media control not available on this platform".into())
    }
}

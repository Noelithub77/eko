#[cfg(target_os = "linux")]
mod linux;

#[cfg(target_os = "windows")]
mod windows;

use tauri::AppHandle;

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

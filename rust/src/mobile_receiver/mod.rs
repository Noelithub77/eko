use std::sync::Mutex;

use crate::domain::{JoinRequest, QrPairingPayload};

pub(crate) mod commands;

#[derive(Default)]
pub struct NativeReceiverManager {
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    name_updates: Mutex<Option<tokio::sync::mpsc::UnboundedSender<String>>>,
}

impl NativeReceiverManager {
    pub fn start(
        &self,
        app: tauri::AppHandle,
        payload: QrPairingPayload,
        request: JoinRequest,
    ) -> Result<(), String> {
        self.stop();

        #[cfg(target_os = "android")]
        {
            let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();
            *self.name_updates.lock().map_err(|error| error.to_string())? = Some(sender);
            let task = tauri::async_runtime::spawn(android::run_receiver(app, payload, request, receiver));
            *self.task.lock().map_err(|error| error.to_string())? = Some(task);
            Ok(())
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = (app, payload, request);
            Err("Native receiver only runs on Android.".to_string())
        }
    }

    pub fn stop(&self) {
        if let Ok(mut updates) = self.name_updates.lock() { *updates = None; }
        if let Ok(mut task) = self.task.lock() {
            if let Some(task) = task.take() {
                task.abort();
            }
        }
    }

    pub fn rename(&self, name: String) -> Result<(), String> {
        let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
        if name.is_empty() || name.chars().count() > 40 {
            return Err("Receiver name must contain 1 to 40 characters.".into());
        }
        self.name_updates.lock().map_err(|error| error.to_string())?
            .as_ref().ok_or("No active native receiver.")?
            .send(name).map_err(|_| "Native receiver disconnected.".to_string())
    }
}

#[cfg(target_os = "android")]
mod android;

#[cfg(any(target_os = "android", test))]
mod local_candidate_queue;
#[cfg(target_os = "android")]
mod playback;
#[cfg(any(target_os = "android", test))]
#[cfg_attr(test, allow(dead_code))]
mod signaling_transport;
#[cfg(any(target_os = "android", test))]
mod sample_buffer;
#[cfg(any(target_os = "android", test))]
mod quality;
#[cfg(any(target_os = "android", test))]
mod waveform;

use serde::Serialize;
use specta::Type;

pub mod frame;
pub mod opus_codec;
pub mod silence;
pub mod windows_capture;

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioProofStatus {
    pub backend: String,
    pub default_output_device: Option<String>,
    pub capture_ready: bool,
    pub note: String,
}

pub fn proof_status() -> AudioProofStatus {
    let default_output_device =
        cpal::traits::HostTrait::default_output_device(&cpal::default_host()).and_then(|device| {
            cpal::traits::DeviceTrait::description(&device)
                .map(|description| description.name().to_string())
                .ok()
        });

    AudioProofStatus {
        backend: backend_name().to_string(),
        default_output_device,
        capture_ready: cfg!(windows),
        note: proof_note().to_string(),
    }
}

#[cfg(windows)]
fn backend_name() -> &'static str {
    "wasapi + cpal"
}

#[cfg(target_os = "android")]
fn backend_name() -> &'static str {
    "oboe"
}

#[cfg(not(any(windows, target_os = "android")))]
fn backend_name() -> &'static str {
    "cpal"
}

#[cfg(windows)]
fn proof_note() -> &'static str {
    "Windows system-audio capture should use WASAPI loopback; CPAL stays available for device checks."
}

#[cfg(target_os = "android")]
fn proof_note() -> &'static str {
    "Android playback should use Oboe for low-latency native output."
}

#[cfg(not(any(windows, target_os = "android")))]
fn proof_note() -> &'static str {
    "This target is not part of v1 audio capture."
}

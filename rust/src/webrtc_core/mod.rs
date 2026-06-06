use serde::Serialize;
use specta::Type;

pub mod media_hub;

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WebRtcProofStatus {
    pub media_transport: String,
    pub codec: String,
    pub library_ready: bool,
    pub note: String,
}

pub fn proof_status() -> WebRtcProofStatus {
    WebRtcProofStatus {
        media_transport: "WebRTC".to_string(),
        codec: "Opus".to_string(),
        library_ready: true,
        note: "webrtc-rs and opus compile on the desktop target.".to_string(),
    }
}

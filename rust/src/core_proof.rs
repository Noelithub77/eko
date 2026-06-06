use serde::Serialize;

use crate::audio::AudioProofStatus;
use crate::discovery::DiscoveryProofStatus;
use crate::signaling::SignalingProofStatus;
use crate::webrtc_core::WebRtcProofStatus;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreProofStatus {
    pub audio: AudioProofStatus,
    pub discovery: DiscoveryProofStatus,
    pub signaling: SignalingProofStatus,
    pub web_rtc: WebRtcProofStatus,
}

pub fn proof_status() -> CoreProofStatus {
    CoreProofStatus {
        audio: crate::audio::proof_status(),
        discovery: crate::discovery::proof_status(),
        signaling: crate::signaling::proof_status(),
        web_rtc: crate::webrtc_core::proof_status(),
    }
}

use serde::{Deserialize, Serialize};
use specta::Type;

use super::{DeviceConnectionState, JoinRequest, RoomSession, SharingState};

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IceCandidateMessage {
    pub device_id: String,
    pub candidate: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionDescriptionMessage {
    pub device_id: String,
    pub sdp: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StreamProfilerSample {
    pub version: u8,
    pub source: String,
    pub kind: String,
    pub created_at_ms: f64,
    pub connection_id: String,
    pub device_id: String,
    pub room_id: String,
    pub sample_index: u32,
    pub latency_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub buffer_ms: Option<f64>,
    pub packet_loss_percent: Option<f64>,
    pub packets_received: Option<u32>,
    pub packets_lost: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SignalClientMessage {
    JoinRequest {
        request: JoinRequest,
    },
    ReceiverReady {
        device_id: String,
    },
    Offer {
        description: SessionDescriptionMessage,
    },
    Answer {
        description: SessionDescriptionMessage,
    },
    IceCandidate {
        candidate: IceCandidateMessage,
    },
    ClockSyncRequest {
        request_id: String,
        client_sent_at_ms: f64,
    },
    ProfilerSample {
        sample: StreamProfilerSample,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SignalServerMessage {
    ApprovalWaiting {
        device_id: String,
        session: RoomSession,
    },
    JoinRejected {
        reason: String,
    },
    PermissionChanged {
        device_id: String,
        state: DeviceConnectionState,
        sharing: SharingState,
        session: RoomSession,
    },
    WebRtcReady {
        device_id: String,
    },
    HostOffer {
        description: SessionDescriptionMessage,
    },
    HostIceCandidate {
        candidate: IceCandidateMessage,
    },
    AudioReady {
        device_id: String,
    },
    HostState {
        session: RoomSession,
    },
    ClockSyncResponse {
        request_id: String,
        client_sent_at_ms: f64,
        server_received_at_ms: f64,
        server_sent_at_ms: f64,
    },
    PlaybackSchedule {
        play_at_server_ms: f64,
        jitter_buffer_target_ms: u16,
    },
    SignalAck {
        message: String,
    },
    Error {
        message: String,
    },
}

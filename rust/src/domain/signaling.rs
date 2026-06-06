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
    AudioReady {
        device_id: String,
    },
    HostState {
        session: RoomSession,
    },
    SignalAck {
        message: String,
    },
    Error {
        message: String,
    },
}

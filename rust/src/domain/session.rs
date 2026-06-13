use serde::{Deserialize, Serialize};
use specta::Type;

use super::Device;

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum StreamStatus {
    Idle,
    Starting,
    Running,
    Stopping,
    Failed,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QrPairingPayload {
    pub host: String,
    pub port: u16,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DevMetric {
    pub id: String,
    pub label: String,
    pub value: u32,
    pub unit: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DevEvent {
    pub id: String,
    pub level: String,
    pub message: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RoomSession {
    pub status: StreamStatus,
    pub room_id: Option<String>,
    pub token: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub lan_discovery_enabled: bool,
    pub devices: Vec<Device>,
    pub metrics: Vec<DevMetric>,
    pub events: Vec<DevEvent>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StartStreamResult {
    pub session: RoomSession,
    pub qr_payload: QrPairingPayload,
}

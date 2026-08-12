use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum JoinMethod {
    Qr,
    Discovery,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Type)]
#[serde(rename_all = "camelCase")]
pub enum DeviceConnectionState {
    Pending,
    Connecting,
    Connected,
    Disconnected,
    Failed,
    Denied,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub device_id: String,
    pub device_name: String,
    pub label: Option<String>,
    pub state: DeviceConnectionState,
    pub join_method: JoinMethod,
    pub connected_at: Option<String>,
    pub web_rtc_state: String,
    pub ice_state: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinRequest {
    pub device_id: String,
    pub device_name: String,
    pub method: JoinMethod,
}

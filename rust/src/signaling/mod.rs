use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalingProofStatus {
    pub transport: String,
    pub library_ready: bool,
    pub note: String,
}

pub fn proof_status() -> SignalingProofStatus {
    SignalingProofStatus {
        transport: "WebSocket".to_string(),
        library_ready: true,
        note: "tokio-tungstenite is installed for typed local signaling.".to_string(),
    }
}

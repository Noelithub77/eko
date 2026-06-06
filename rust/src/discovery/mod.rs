use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryProofStatus {
    pub service_type: String,
    pub library_ready: bool,
    pub note: String,
}

pub fn proof_status() -> DiscoveryProofStatus {
    DiscoveryProofStatus {
        service_type: "_eko-audio._tcp.local.".to_string(),
        library_ready: true,
        note: "mdns-sd is installed for LAN host advertisement and browsing.".to_string(),
    }
}

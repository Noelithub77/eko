use webrtc::peer_connection::RTCPeerConnection;
use webrtc::stats::StatsReportType;

use crate::domain::ConnectionPath;

pub async fn selected_candidate_type(peer: &RTCPeerConnection) -> Option<String> {
    let stats = peer.get_stats().await;
    let local_candidate_id = stats.reports.values().find_map(|report| match report {
        StatsReportType::CandidatePair(pair) if pair.nominated => {
            Some(pair.local_candidate_id.as_str())
        }
        _ => None,
    })?;

    stats.reports.values().find_map(|report| match report {
        StatsReportType::LocalCandidate(candidate) if candidate.id == local_candidate_id => {
            Some(candidate.candidate_type.to_string())
        }
        _ => None,
    })
}

pub async fn log_selected_candidate(peer: &RTCPeerConnection, device_id: &str) -> Option<String> {
    let Some(candidate_type) = selected_candidate_type(peer).await else {
        log::warn!("Could not read the selected ICE candidate for {device_id}");
        return None;
    };
    if candidate_type == "relay" {
        log::warn!("Selected relayed ICE candidate for {device_id}");
    } else {
        log::info!("Selected ICE candidate for {device_id}: {candidate_type}");
    }
    Some(candidate_type)
}

pub fn connection_path_for(candidate_type: &str) -> Option<ConnectionPath> {
    match candidate_type {
        "host" => Some(ConnectionPath::Local),
        "srflx" | "prflx" => Some(ConnectionPath::Direct),
        "relay" => Some(ConnectionPath::Relayed),
        _ => None,
    }
}

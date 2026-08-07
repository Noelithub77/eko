use webrtc::peer_connection::RTCPeerConnection;
use webrtc::stats::StatsReportType;

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

pub async fn log_selected_candidate(peer: &RTCPeerConnection, device_id: &str) {
    let Some(candidate_type) = selected_candidate_type(peer).await else {
        log::warn!("Could not read the selected ICE candidate for {device_id}");
        return;
    };
    if candidate_type == "relay" {
        log::error!("Invalid relay ICE candidate selected for {device_id}; TURN is disabled");
    } else {
        log::info!("Selected ICE candidate for {device_id}: {candidate_type}");
    }
}

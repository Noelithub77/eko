use webrtc::peer_connection::RTCPeerConnection;
use webrtc::stats::StatsReportType;

use crate::domain::ConnectionPath;

#[derive(Clone, Debug)]
pub struct SelectedCandidatePath {
    pub local_candidate_type: String,
    pub local_ip: String,
    pub remote_candidate_type: String,
    pub remote_ip: String,
}

pub async fn selected_candidate_path(peer: &RTCPeerConnection) -> Option<SelectedCandidatePath> {
    let stats = peer.get_stats().await;
    let (local_candidate_id, remote_candidate_id) =
        stats.reports.values().find_map(|report| match report {
            StatsReportType::CandidatePair(pair) if pair.nominated => Some((
                pair.local_candidate_id.as_str(),
                pair.remote_candidate_id.as_str(),
            )),
            _ => None,
        })?;

    let local_candidate = stats.reports.values().find_map(|report| match report {
        StatsReportType::LocalCandidate(candidate) if candidate.id == local_candidate_id => {
            Some((candidate.candidate_type.to_string(), candidate.ip.clone()))
        }
        _ => None,
    })?;
    let remote_candidate = stats.reports.values().find_map(|report| match report {
        StatsReportType::RemoteCandidate(candidate) if candidate.id == remote_candidate_id => {
            Some((candidate.candidate_type.to_string(), candidate.ip.clone()))
        }
        _ => None,
    })?;

    Some(SelectedCandidatePath {
        local_candidate_type: local_candidate.0,
        local_ip: local_candidate.1,
        remote_candidate_type: remote_candidate.0,
        remote_ip: remote_candidate.1,
    })
}

pub async fn log_selected_candidate(
    peer: &RTCPeerConnection,
    device_id: &str,
) -> Option<SelectedCandidatePath> {
    let Some(path) = selected_candidate_path(peer).await else {
        log::warn!("Could not read the selected ICE candidate for {device_id}");
        return None;
    };
    if path.local_candidate_type == "relay" || path.remote_candidate_type == "relay" {
        log::warn!(
            "Selected relayed ICE candidate for {device_id}: local={} remote={}",
            path.local_candidate_type,
            path.remote_candidate_type
        );
    } else {
        log::info!(
            "Selected ICE candidate pair for {device_id}: local={} remote={}",
            path.local_candidate_type,
            path.remote_candidate_type
        );
    }
    Some(path)
}

pub fn connection_path_for(path: &SelectedCandidatePath) -> Option<ConnectionPath> {
    if path.local_candidate_type == "relay" || path.remote_candidate_type == "relay" {
        return Some(ConnectionPath::Relayed);
    }

    if path.local_candidate_type == "host"
        && path.remote_candidate_type == "host"
        && same_private_ipv4_subnet(&path.local_ip, &path.remote_ip)
    {
        return Some(ConnectionPath::Local);
    }

    if ["host", "srflx", "prflx"].contains(&path.local_candidate_type.as_str())
        && ["host", "srflx", "prflx"].contains(&path.remote_candidate_type.as_str())
    {
        return Some(ConnectionPath::Direct);
    }

    None
}

fn same_private_ipv4_subnet(left: &str, right: &str) -> bool {
    let Ok(left) = left.parse::<std::net::Ipv4Addr>() else {
        return false;
    };
    let Ok(right) = right.parse::<std::net::Ipv4Addr>() else {
        return false;
    };
    if !(left.is_private() && right.is_private()) {
        return false;
    }
    let left = left.octets();
    let right = right.octets();
    left[..3] == right[..3]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(
        local_candidate_type: &str,
        local_ip: &str,
        remote_candidate_type: &str,
        remote_ip: &str,
    ) -> SelectedCandidatePath {
        SelectedCandidatePath {
            local_candidate_type: local_candidate_type.to_string(),
            local_ip: local_ip.to_string(),
            remote_candidate_type: remote_candidate_type.to_string(),
            remote_ip: remote_ip.to_string(),
        }
    }

    #[test]
    fn labels_same_private_subnet_as_local_network() {
        assert_eq!(
            connection_path_for(&path("host", "192.168.1.20", "host", "192.168.1.45")),
            Some(ConnectionPath::Local)
        );
    }

    #[test]
    fn does_not_label_overlay_or_public_host_pair_as_local_network() {
        assert_eq!(
            connection_path_for(&path("host", "100.80.118.46", "host", "100.77.7.32")),
            Some(ConnectionPath::Direct)
        );
        assert_eq!(
            connection_path_for(&path("host", "192.168.1.20", "host", "203.0.113.40")),
            Some(ConnectionPath::Direct)
        );
    }

    #[test]
    fn labels_any_relay_pair_as_relayed() {
        assert_eq!(
            connection_path_for(&path("relay", "104.30.151.18", "srflx", "203.0.113.40")),
            Some(ConnectionPath::Relayed)
        );
    }
}

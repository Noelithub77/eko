use std::collections::HashMap;
use std::time::{Duration, Instant};

use mdns_sd::{ResolvedService, ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::domain::QrPairingPayload;

pub const SERVICE_TYPE: &str = "_eko-audio._tcp.local.";

pub struct DiscoveryAdvertiser {
    daemon: ServiceDaemon,
    fullname: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredHost {
    pub host: String,
    pub port: u16,
}

impl DiscoveryAdvertiser {
    pub fn start(payload: &QrPairingPayload) -> Result<Self, String> {
        let daemon = ServiceDaemon::new().map_err(|error| error.to_string())?;
        let instance_name = "eko-desktop";
        let host_name = "eko.local.";
        let service = ServiceInfo::new(
            SERVICE_TYPE,
            instance_name,
            host_name,
            payload.local.host.as_str(),
            payload.local.port,
            [("host", payload.local.host.as_str())].as_slice(),
        )
        .map_err(|error| error.to_string())?
        .enable_addr_auto();
        let fullname = service.get_fullname().to_string();

        daemon
            .register(service)
            .map_err(|error| error.to_string())?;

        Ok(Self { daemon, fullname })
    }

    pub fn stop(&self) {
        let _ = self.daemon.unregister(&self.fullname);
        let _ = self.daemon.shutdown();
    }
}

pub fn browse_hosts(timeout_ms: u64) -> Result<Vec<DiscoveredHost>, String> {
    let daemon = ServiceDaemon::new().map_err(|error| error.to_string())?;
    let receiver = daemon
        .browse(SERVICE_TYPE)
        .map_err(|error| error.to_string())?;
    let mut hosts = HashMap::new();
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);

    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let event = receiver.recv_timeout(remaining.min(Duration::from_millis(200)));
        if let Ok(ServiceEvent::ServiceResolved(info)) = event {
            if let Some(host) = host_from_service(&info) {
                hosts.insert(discovered_host_key(&host), host);
            }
        }
    }

    let _ = daemon.shutdown();
    Ok(hosts.into_values().collect())
}

impl Drop for DiscoveryAdvertiser {
    fn drop(&mut self) {
        self.stop();
    }
}

fn host_from_service(info: &ResolvedService) -> Option<DiscoveredHost> {
    let host = info
        .get_property_val_str("host")
        .map(ToString::to_string)
        .or_else(|| info.get_addresses().iter().next().map(ToString::to_string))?;

    Some(DiscoveredHost {
        host,
        port: info.get_port(),
    })
}

fn discovered_host_key(host: &DiscoveredHost) -> String {
    format!("{}-{}", host.host, host.port)
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryProofStatus {
    pub service_type: String,
    pub library_ready: bool,
    pub note: String,
}

pub fn proof_status() -> DiscoveryProofStatus {
    DiscoveryProofStatus {
        service_type: SERVICE_TYPE.to_string(),
        library_ready: true,
        note: "mdns-sd advertises active desktop rooms for LAN discovery.".to_string(),
    }
}

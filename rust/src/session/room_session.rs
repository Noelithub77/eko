use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::{
    DevEvent, DevMetric, Device, DeviceConnectionState, HostedPairingDetails, JoinMethod,
    JoinRequest, LocalPairingDetails, QrPairingPayload, RoomSession, SharingState,
    StartStreamResult, StreamStatus,
};

const MAX_SESSION_EVENTS: usize = 200;

#[derive(Debug)]
pub struct SessionStore {
    session: RoomSession,
    pairing_payload: Option<QrPairingPayload>,
}

impl Default for SessionStore {
    fn default() -> Self {
        Self {
            session: empty_session(),
            pairing_payload: None,
        }
    }
}

impl SessionStore {
    pub fn snapshot(&self) -> RoomSession {
        self.session.clone()
    }

    pub fn start_stream(
        &mut self,
        host: String,
        port: u16,
        hosted: Option<HostedPairingDetails>,
    ) -> Result<StartStreamResult, String> {
        let room_id = format!("room-{}", uuid::Uuid::new_v4());
        let token = uuid::Uuid::new_v4().to_string();

        self.session = RoomSession {
            status: StreamStatus::Running,
            room_id: Some(room_id.clone()),
            token: Some(token.clone()),
            host: Some(host.clone()),
            port: Some(port),
            lan_discovery_enabled: false,
            devices: Vec::new(),
            metrics: vec![metric("setup", 0, "ms")],
            events: vec![event("info", "Stream started")],
        };

        let qr_payload = QrPairingPayload {
            version: 1,
            local: LocalPairingDetails { host, port },
            hosted,
        };
        self.pairing_payload = Some(qr_payload.clone());

        Ok(StartStreamResult {
            session: self.snapshot(),
            qr_payload,
        })
    }

    pub fn stop_stream(&mut self) -> RoomSession {
        self.session = empty_session();
        self.pairing_payload = None;
        self.snapshot()
    }

    pub fn active_pairing_payload(&self) -> Result<QrPairingPayload, String> {
        self.pairing_payload
            .clone()
            .ok_or_else(|| "Start stream before pairing.".to_string())
    }

    pub fn set_lan_discovery(&mut self, enabled: bool) -> Result<RoomSession, String> {
        if !matches!(self.session.status, StreamStatus::Running) {
            return Err("Start stream before enabling LAN discovery.".to_string());
        }

        self.session.lan_discovery_enabled = enabled;
        self.session.events.push(event(
            "info",
            if enabled {
                "LAN discovery enabled"
            } else {
                "LAN discovery disabled"
            },
        ));

        Ok(self.snapshot())
    }

    pub fn device_state(&self, device_id: &str) -> Option<(DeviceConnectionState, SharingState)> {
        self.session
            .devices
            .iter()
            .find(|device| device.device_id == device_id)
            .map(|device| (device.state.clone(), device.sharing.clone()))
    }

    pub fn submit_join_request(&mut self, request: JoinRequest) -> Result<RoomSession, String> {
        if !self.is_valid_join(&request) {
            return Err("Join request does not match the active stream.".to_string());
        }

        if self.session.devices.iter().any(|device| {
            device.device_id == request.device_id && device.state == DeviceConnectionState::Denied
        }) {
            return Err("Device is blocked until the desktop unblocks it.".to_string());
        }

        if let Some(device) = self
            .session
            .devices
            .iter()
            .find(|device| device.device_id == request.device_id)
        {
            if matches!(
                device.state,
                DeviceConnectionState::Disconnected | DeviceConnectionState::Failed
            ) {
                self.update_device(&request.device_id, |device| {
                    device.device_name = receiver_name(request.device_name);
                    device.join_method = request.method;
                    device.state = DeviceConnectionState::Pending;
                    device.sharing = SharingState::Disabled;
                    device.web_rtc_state = "waiting".to_string();
                    device.ice_state = "waiting".to_string();
                });
                self.session
                    .events
                    .push(event("info", "Join request received"));
                return Ok(self.snapshot());
            }

            return Ok(self.snapshot());
        }

        self.session.devices.push(Device {
            device_id: request.device_id,
            device_name: receiver_name(request.device_name),
            label: None,
            state: DeviceConnectionState::Pending,
            join_method: request.method,
            sharing: SharingState::Disabled,
            connected_at: None,
            web_rtc_state: "waiting".to_string(),
            ice_state: "waiting".to_string(),
        });
        self.session
            .events
            .push(event("info", "Join request received"));

        Ok(self.snapshot())
    }

    pub fn add_dev_join_request(
        &mut self,
        device_name: String,
        method: JoinMethod,
    ) -> Result<RoomSession, String> {
        self.submit_join_request(JoinRequest {
            device_id: format!("dev-{}", now_string()),
            device_name,
            method,
        })
    }

    pub fn allow_device(&mut self, device_id: String) -> RoomSession {
        self.update_device(&device_id, |device| {
            device.state = DeviceConnectionState::Connecting;
            device.sharing = SharingState::Enabled;
            device.connected_at = Some(now_string());
            device.web_rtc_state = "connecting".to_string();
            device.ice_state = "checking".to_string();
        });
        self.session.events.push(event("info", "Device allowed"));
        self.snapshot()
    }

    pub fn deny_device(&mut self, device_id: String) -> RoomSession {
        self.update_device(&device_id, |device| {
            device.state = DeviceConnectionState::Denied;
            device.sharing = SharingState::Disabled;
            device.web_rtc_state = "closed".to_string();
            device.ice_state = "closed".to_string();
        });
        self.session.events.push(event("warn", "Device denied"));
        self.snapshot()
    }

    pub fn mark_device_connected(&mut self, device_id: String) -> RoomSession {
        self.update_device(&device_id, |device| {
            device.state = DeviceConnectionState::Connected;
            device.sharing = SharingState::Enabled;
            device.connected_at = Some(now_string());
            device.web_rtc_state = "connected".to_string();
            device.ice_state = "connected".to_string();
        });
        self.session.events.push(event("info", "Device connected"));
        self.snapshot()
    }

    pub fn unblock_device(&mut self, device_id: String) -> RoomSession {
        self.session
            .devices
            .retain(|device| device.device_id != device_id);
        self.session.events.push(event("info", "Device unblocked"));
        self.snapshot()
    }

    pub fn disconnect_device(&mut self, device_id: String) -> RoomSession {
        self.update_device(&device_id, |device| {
            device.state = DeviceConnectionState::Disconnected;
            device.sharing = SharingState::Disabled;
            device.web_rtc_state = "closed".to_string();
            device.ice_state = "closed".to_string();
        });
        self.session
            .events
            .push(event("info", "Device disconnected"));
        self.snapshot()
    }

    pub fn set_device_sharing(&mut self, device_id: String, enabled: bool) -> RoomSession {
        self.update_device(&device_id, |device| {
            device.sharing = if enabled {
                SharingState::Enabled
            } else {
                SharingState::Disabled
            };
        });
        self.session.events.push(event("info", "Sharing changed"));
        self.snapshot()
    }

    pub fn update_device_name(&mut self, device_id: String, name: String) -> RoomSession {
        let cleaned = receiver_name(name);
        let mut changed = false;
        self.update_device(&device_id, |device| {
            if device.device_name != cleaned {
                device.device_name = cleaned.clone();
                changed = true;
            }
        });
        if changed {
            self.session
                .events
                .push(event("info", "Receiver name updated"));
        }
        self.snapshot()
    }

    pub fn push_event(&mut self, level: &str, message: &str) -> RoomSession {
        self.push_limited_event(level, message);
        self.snapshot()
    }

    pub fn clear_events(&mut self) -> RoomSession {
        self.session.events.clear();
        self.push_limited_event("info", "Monitor logs cleared");
        self.snapshot()
    }

    fn is_valid_join(&self, request: &JoinRequest) -> bool {
        !request.device_id.trim().is_empty()
            && !request.device_name.trim().is_empty()
            && matches!(self.session.status, StreamStatus::Running)
    }

    fn update_device<F>(&mut self, device_id: &str, update: F)
    where
        F: FnOnce(&mut Device),
    {
        if let Some(device) = self
            .session
            .devices
            .iter_mut()
            .find(|device| device.device_id == device_id)
        {
            update(device);
        }
    }

    fn push_limited_event(&mut self, level: &str, message: &str) {
        self.session.events.push(event(level, message));
        if self.session.events.len() > MAX_SESSION_EVENTS {
            let remove_count = self.session.events.len() - MAX_SESSION_EVENTS;
            self.session.events.drain(0..remove_count);
        }
    }
}

fn empty_session() -> RoomSession {
    RoomSession {
        status: StreamStatus::Idle,
        room_id: None,
        token: None,
        host: None,
        port: None,
        lan_discovery_enabled: false,
        devices: Vec::new(),
        metrics: Vec::new(),
        events: Vec::new(),
    }
}

fn now_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn metric(label: &str, value: u32, unit: &str) -> DevMetric {
    DevMetric {
        id: format!("metric-{}", now_string()),
        label: label.to_string(),
        value,
        unit: unit.to_string(),
        created_at: now_string(),
    }
}

fn event(level: &str, message: &str) -> DevEvent {
    DevEvent {
        id: format!("event-{}", now_string()),
        level: level.to_string(),
        message: message.to_string(),
        created_at: now_string(),
    }
}

fn receiver_name(name: String) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return "Unnamed receiver".to_string();
    }

    trimmed.chars().take(40).collect()
}

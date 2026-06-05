use std::net::TcpListener;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::{
    Device, DeviceConnectionState, DevEvent, DevMetric, JoinMethod, JoinRequest, QrPairingPayload,
    RoomSession, SharingState, StartStreamResult, StreamStatus,
};

#[derive(Debug)]
pub struct SessionStore {
    session: RoomSession,
}

impl Default for SessionStore {
    fn default() -> Self {
        Self {
            session: empty_session(),
        }
    }
}

impl SessionStore {
    pub fn snapshot(&self) -> RoomSession {
        self.session.clone()
    }

    pub fn start_stream(&mut self) -> Result<StartStreamResult, String> {
        let host = "127.0.0.1".to_string();
        let port = pick_available_port()?;
        let now = now_string();
        let room_id = format!("room-{now}");
        let token = format!("eko-{now}");

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

        Ok(StartStreamResult {
            session: self.snapshot(),
            qr_payload: QrPairingPayload {
                host,
                port,
                room_id,
                token,
            },
        })
    }

    pub fn stop_stream(&mut self) -> RoomSession {
        self.session = empty_session();
        self.snapshot()
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

    pub fn submit_join_request(&mut self, request: JoinRequest) -> Result<RoomSession, String> {
        if !self.is_valid_join(&request) {
            return Err("Join request does not match the active stream.".to_string());
        }

        if self
            .session
            .devices
            .iter()
            .any(|device| device.device_id == request.device_id && device.state == DeviceConnectionState::Denied)
        {
            return Err("Device is blocked until the desktop unblocks it.".to_string());
        }

        if self
            .session
            .devices
            .iter()
            .any(|device| device.device_id == request.device_id)
        {
            return Ok(self.snapshot());
        }

        self.session.devices.push(Device {
            device_id: request.device_id,
            device_name: request.device_name,
            label: None,
            state: DeviceConnectionState::Pending,
            join_method: request.method,
            sharing: SharingState::Disabled,
            connected_at: None,
            web_rtc_state: "new".to_string(),
            ice_state: "new".to_string(),
        });
        self.session.events.push(event("info", "Join request received"));

        Ok(self.snapshot())
    }

    pub fn add_dev_join_request(&mut self, device_name: String, method: JoinMethod) -> Result<RoomSession, String> {
        let room_id = self
            .session
            .room_id
            .clone()
            .ok_or_else(|| "Start stream before adding a test device.".to_string())?;
        let token = self
            .session
            .token
            .clone()
            .ok_or_else(|| "Start stream before adding a test device.".to_string())?;

        self.submit_join_request(JoinRequest {
            device_id: format!("dev-{}", now_string()),
            device_name,
            room_id,
            method,
            token,
        })
    }

    pub fn allow_device(&mut self, device_id: String) -> RoomSession {
        self.update_device(&device_id, |device| {
            device.state = DeviceConnectionState::Connected;
            device.sharing = SharingState::Enabled;
            device.connected_at = Some(now_string());
            device.web_rtc_state = "connected".to_string();
            device.ice_state = "connected".to_string();
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

    pub fn unblock_device(&mut self, device_id: String) -> RoomSession {
        self.session.devices.retain(|device| device.device_id != device_id);
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
        self.session.events.push(event("info", "Device disconnected"));
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

    fn is_valid_join(&self, request: &JoinRequest) -> bool {
        self.session.room_id.as_ref() == Some(&request.room_id)
            && self.session.token.as_ref() == Some(&request.token)
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

fn pick_available_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| error.to_string())
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

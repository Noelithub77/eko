use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::{DeviceConnectionState, StreamProfilerSample};
use crate::signaling::SharedSession;

const MAX_PROFILER_BYTES: usize = 16 * 1024;
const MAX_SAMPLES: usize = 240;
const WINDOW_MS: f64 = 30_000.0;
static SAMPLES: OnceLock<Mutex<VecDeque<StreamProfilerSample>>> = OnceLock::new();

pub async fn with_native_transport(mut sample: StreamProfilerSample, media: &crate::webrtc_core::media_hub::SharedMediaHub) -> StreamProfilerSample {
    if sample.source == "android" {
        sample.round_trip_ms = media.round_trip_ms(&sample.device_id).await;
        sample.latency_ms = sample.buffer_ms.zip(sample.round_trip_ms).map(|(buffer, rtt)| buffer + rtt / 2.0);
        sample.version = 2;
    }
    sample
}

pub fn append_sample(body: &[u8]) -> Result<(), String> {
    if body.len() > MAX_PROFILER_BYTES { return Err("Profiler sample is too large.".into()); }
    let sample = serde_json::from_slice(body).map_err(|error| error.to_string())?;
    append_typed_sample(sample)
}

// Signaling supplies the authenticated device identity and canonical room.
pub fn record_receiver(mut sample: StreamProfilerSample, device_id: &str, session: &SharedSession) -> Result<(), String> {
    let store = session.lock().map_err(|error| error.to_string())?;
    if sample.device_id != device_id || store.device_state(device_id) != Some(DeviceConnectionState::Connected) {
        return Err("Profiler requires the connected receiver identity.".into());
    }
    sample.room_id = store.snapshot().room_id.ok_or("No active profiler room.")?;
    drop(store);
    append_typed_sample(sample)
}

pub fn append_typed_sample(mut sample: StreamProfilerSample) -> Result<(), String> {
    validate(&sample)?;
    sample.created_at_ms = now_ms();
    let mut samples = samples().lock().map_err(|error| error.to_string())?;
    samples.retain(|old| sample.created_at_ms - old.created_at_ms <= WINDOW_MS);
    // One bounded window per current connection; reconnects cannot reuse old averages.
    samples.retain(|old| old.device_id != sample.device_id || old.connection_id == sample.connection_id);
    samples.push_back(sample);
    while samples.len() > MAX_SAMPLES { let _ = samples.pop_front(); }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_stream_profiler() -> Result<Vec<StreamProfilerSample>, String> {
    let samples = samples().lock().map_err(|error| error.to_string())?;
    let now = now_ms();
    Ok(samples.iter().filter(|sample| now - sample.created_at_ms <= WINDOW_MS).cloned().collect())
}

pub fn snapshot_json() -> Result<String, String> {
    serde_json::to_string(&get_stream_profiler()?).map_err(|error| error.to_string())
}

fn validate(sample: &StreamProfilerSample) -> Result<(), String> {
    if !matches!(sample.version, 1 | 2) || !matches!(sample.source.as_str(), "web" | "android") || sample.kind != "qualitySample" {
        return Err("Unsupported profiler sample.".into());
    }
    for id in [&sample.device_id, &sample.connection_id, &sample.room_id] {
        if id.is_empty() || id.len() > 128 { return Err("Invalid profiler identifier.".into()); }
    }
    for value in [sample.latency_ms, sample.round_trip_ms, sample.buffer_ms, sample.jitter_ms, sample.packet_loss_percent].into_iter().flatten() {
        if !value.is_finite() || value < 0.0 { return Err("Invalid profiler measurement.".into()); }
    }
    if sample.packet_loss_percent.is_some_and(|value| value > 100.0) { return Err("Invalid packet loss.".into()); }
    Ok(())
}

fn now_ms() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|value| value.as_secs_f64() * 1000.0).unwrap_or(0.0)
}
fn samples() -> &'static Mutex<VecDeque<StreamProfilerSample>> {
    SAMPLES.get_or_init(|| Mutex::new(VecDeque::with_capacity(MAX_SAMPLES)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{JoinMethod, JoinRequest};
    use crate::session::SessionStore;
    use std::sync::Arc;

    fn sample() -> StreamProfilerSample {
        StreamProfilerSample { version: 2, source: "web".into(), kind: "qualitySample".into(), created_at_ms: 0.0, connection_id: "profiler-test".into(), device_id: "profiler-test".into(), room_id: "untrusted-client-room".into(), sample_index: 1, latency_ms: Some(100.0), round_trip_ms: Some(80.0), jitter_ms: None, buffer_ms: Some(60.0), packet_loss_percent: Some(0.0), packets_received: Some(100), packets_lost: Some(0) }
    }

    #[test]
    fn receiver_profiles_require_connected_identity_and_use_desktop_room() -> Result<(), String> {
        let mut store = SessionStore::default();
        let started = store.start_stream("127.0.0.1".into(), 13370, None)?;
        store.submit_join_request(JoinRequest { device_id: "profiler-test".into(), device_name: "Test".into(), method: JoinMethod::Qr })?;
        let session = Arc::new(Mutex::new(store));
        assert!(record_receiver(sample(), "profiler-test", &session).is_err());
        { let mut store = session.lock().map_err(|error| error.to_string())?;
          store.allow_device("profiler-test".into());
          store.mark_device_connected("profiler-test".into()); }
        assert!(record_receiver(sample(), "another-device", &session).is_err());
        record_receiver(sample(), "profiler-test", &session)?;
        let snapshots = get_stream_profiler()?;
        let latest = snapshots.iter().find(|value| value.device_id == "profiler-test").ok_or("Missing profile")?;
        assert_eq!(Some(latest.room_id.clone()), started.session.room_id);
        assert!(latest.created_at_ms > 0.0);
        Ok(())
    }

    #[test]
    fn invalid_measurements_are_rejected() {
        let mut value = sample();
        value.buffer_ms = Some(-1.0);
        assert!(validate(&value).is_err());
        value.buffer_ms = Some(60.0);
        value.packet_loss_percent = Some(101.0);
        assert!(validate(&value).is_err());
    }
}

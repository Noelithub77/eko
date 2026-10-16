use super::*;
use bytes::Bytes;
use std::time::Duration;
use webrtc::media::Sample;
use crate::audio::frame::AudioFrame;
use crate::audio::opus_codec::OpusAudioEncoder;
use crate::audio::windows_capture::start_system_audio_source;

pub(super) fn start(hub: &SharedMediaHub) -> Result<(), String> {
    let (sender, mut receiver) = mpsc::channel::<AudioFrame>(3);
    let capture_thread = start_system_audio_source(sender)?;
    let track = Arc::clone(&hub.track);
    let counters = Arc::clone(&hub.audio_counters);
    let session = hub.session.clone();
    let app = hub.app.clone();
    let task = tauri::async_runtime::spawn(async move {
        let mut encoder = match OpusAudioEncoder::new() {
            Ok(encoder) => encoder,
            Err(error) => {
                log::error!("Opus encoder failed: {error}");
                if let Some(session) = &session {
                    if let Ok(mut store) = session.lock() {
                        let session = store
                            .push_event("error", &format!("Audio encoder failed: {error}"));
                        if let Some(app) = &app {
                            crate::signaling::emit_room_session(app, session);
                        }
                    }
                }
                return;
            }
        };

        let mut dropped = 0_u16;
        while let Some(frame) = receiver.recv().await {
            if frame.captured_at.elapsed() > Duration::from_millis(60) {
                dropped = dropped.saturating_add(1);
                counters.stale_frames_dropped.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                continue;
            }
            counters.queue_timing.record_us(frame.captured_at.elapsed().as_micros() as u64);
            if let Some(micros) = frame.capture_latency_us { counters.capture_timing.record_us(micros); }
            let encode_started = std::time::Instant::now();
            counters
                .frames_received
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let Ok(encoded) = encoder.encode(frame) else {
                log::warn!("Audio loop: Opus encode failed");
                continue;
            };
            counters
                .frames_encoded
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            counters.encode_timing.record_us(encode_started.elapsed().as_micros() as u64);
            let sample = Sample {
                data: Bytes::from(encoded.data),
                duration: Duration::from_millis(encoded.duration_ms),
                prev_dropped_packets: dropped,
                ..Default::default()
            };
            dropped = 0;
            let write_started = std::time::Instant::now();
            if let Err(error) = track.write_sample(&sample).await {
                counters
                    .write_errors
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                log::error!("Audio loop: write_sample error: {error}");
            } else {
                counters
                    .samples_written
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            }
            counters.write_timing.record_us(write_started.elapsed().as_micros() as u64);
        }
    });

    *hub.audio_task.lock().map_err(|error| error.to_string())? = Some(task);
    *hub.capture_thread
        .lock()
        .map_err(|error| error.to_string())? = Some(capture_thread);

    Ok(())
}

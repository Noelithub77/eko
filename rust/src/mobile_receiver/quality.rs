use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use crate::domain::StreamProfilerSample;

pub(super) struct AndroidProfiler {
    connection_id: String,
    device_id: String,
    started_at: Instant,
    last_sample_at: Instant,
    last_packet: Option<(u16, u32, Duration)>,
    recent_packets: u128,
    tracked_sequences: u16,
    jitter_ms: Option<f64>,
    packet_count: u64,
    lost_count: u64,
    previous_packet_count: u64,
    previous_lost_count: u64,
    sample_index: u64,
}

impl AndroidProfiler {
    pub(super) fn new(device_id: String) -> Self {
        Self {
            connection_id: format!("android-{}-{}", device_id, now_ms()), device_id,
            started_at: Instant::now(), last_sample_at: Instant::now(), last_packet: None,
            recent_packets: 0, tracked_sequences: 1,
            jitter_ms: None, packet_count: 0, lost_count: 0,
            previous_packet_count: 0, previous_lost_count: 0, sample_index: 0,
        }
    }

    pub(super) fn record_packet(&mut self, sequence: u16, timestamp: u32) {
        self.record_arrival(sequence, timestamp, self.started_at.elapsed());
    }

    fn record_arrival(&mut self, sequence: u16, timestamp: u32, arrival: Duration) {
        if let Some((previous, previous_timestamp, previous_arrival)) = self.last_packet {
            let advance = sequence.wrapping_sub(previous);
            if advance == 0 { return; }
            // Count late arrivals once without moving the sequence high-water mark backwards.
            if advance >= 0x8000 {
                let behind = previous.wrapping_sub(sequence);
                if behind < self.tracked_sequences && self.recent_packets & (1_u128 << behind) == 0 {
                    self.recent_packets |= 1_u128 << behind;
                    self.packet_count += 1;
                    self.lost_count = self.lost_count.saturating_sub(1);
                }
                return;
            }
            self.recent_packets = self.recent_packets.checked_shl(u32::from(advance)).unwrap_or(0);
            self.tracked_sequences = self.tracked_sequences.saturating_add(advance).min(128);
            self.lost_count += u64::from(advance - 1);
            let media_ms = f64::from(timestamp.wrapping_sub(previous_timestamp)) / 48.0;
            let delta = (arrival.saturating_sub(previous_arrival).as_secs_f64() * 1000.0 - media_ms).abs();
            // RFC 3550, appendix A.8, with the Opus 48 kHz clock expressed in milliseconds.
            let jitter = self.jitter_ms.unwrap_or(0.0);
            self.jitter_ms = Some(jitter + (delta - jitter) / 16.0);
        }
        self.recent_packets |= 1;
        self.last_packet = Some((sequence, timestamp, arrival));
        self.packet_count += 1;
    }

    pub(super) fn next_sample(&mut self, buffer_ms: Option<f64>) -> Option<StreamProfilerSample> {
        if self.last_sample_at.elapsed() < Duration::from_secs(2) { return None; }
        self.last_sample_at = Instant::now();
        Some(self.sample(buffer_ms))
    }

    fn sample(&mut self, buffer_ms: Option<f64>) -> StreamProfilerSample {
        self.sample_index += 1;
        let received = self.packet_count - self.previous_packet_count;
        let lost = self.lost_count.saturating_sub(self.previous_lost_count);
        self.previous_packet_count = self.packet_count;
        self.previous_lost_count = self.lost_count;
        let total = received + lost;
        StreamProfilerSample {
            version: 2, source: "android".into(), kind: "qualitySample".into(),
            created_at_ms: now_ms(), connection_id: self.connection_id.clone(),
            device_id: self.device_id.clone(), room_id: "local-session".into(),
            sample_index: count(self.sample_index), latency_ms: None, round_trip_ms: None,
            jitter_ms: self.jitter_ms, buffer_ms,
            packet_loss_percent: if total > 0 { Some(100.0 * lost as f64 / total as f64) } else { None },
            packets_received: Some(count(received)), packets_lost: Some(count(lost)),
        }
    }
}

fn count(value: u64) -> u32 { u32::try_from(value).unwrap_or(u32::MAX) }
fn now_ms() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn samples_wait_for_the_interval_and_preserve_missing_transport_measurements() {
        let mut tracker = AndroidProfiler::new("test".into());
        tracker.record_packet(1, 0);
        assert!(tracker.next_sample(None).is_none());
        tracker.last_sample_at -= Duration::from_secs(3);
        let sample = tracker.next_sample(None);
        assert!(sample.is_some_and(|s| s.version == 2 && s.latency_ms.is_none() && s.buffer_ms.is_none()));
    }

    #[test]
    fn sequence_and_timestamp_wrap_do_not_create_loss_or_jitter() {
        let mut tracker = AndroidProfiler::new("test".into());
        tracker.record_arrival(u16::MAX, u32::MAX - 959, Duration::ZERO);
        tracker.record_arrival(0, 0, Duration::from_millis(20));
        let sample = tracker.sample(Some(20.0));
        assert_eq!(sample.packets_lost, Some(0));
        assert_eq!(sample.jitter_ms, Some(0.0));
        assert_eq!(sample.latency_ms, None);
    }

    #[test]
    fn gaps_count_once_and_reordered_packets_do_not_move_the_sequence_back() {
        let mut tracker = AndroidProfiler::new("test".into());
        tracker.record_arrival(10, 0, Duration::ZERO);
        tracker.record_arrival(12, 1920, Duration::from_millis(50));
        tracker.record_arrival(11, 960, Duration::from_millis(51));
        tracker.record_arrival(12, 1920, Duration::from_millis(52));
        tracker.record_arrival(13, 2880, Duration::from_millis(70));
        let sample = tracker.sample(Some(15.0));
        assert_eq!(sample.packets_received, Some(4));
        assert_eq!(sample.packets_lost, Some(0));
        assert_eq!(sample.packet_loss_percent, Some(0.0));
        assert!(sample.jitter_ms.is_some_and(|j| j > 0.0));
        assert_eq!(tracker.sample(None).packet_loss_percent, None);
    }

    #[test]
    fn recovery_after_a_report_never_produces_negative_loss() {
        let mut tracker = AndroidProfiler::new("test".into());
        tracker.record_arrival(1, 0, Duration::ZERO);
        tracker.record_arrival(3, 1920, Duration::from_millis(40));
        assert_eq!(tracker.sample(None).packets_lost, Some(1));
        tracker.record_arrival(2, 960, Duration::from_millis(41));
        assert_eq!(tracker.sample(None).packet_loss_percent, Some(0.0));
    }
}

use std::collections::VecDeque;
use std::time::Instant;

use super::frame::{AudioFrame, SAMPLES_PER_PACKET};

pub fn decode_stereo(buffers: &[&[u8]], big_endian: bool) -> Result<Vec<f32>, String> {
    let decode = |bytes: &[u8]| {
        let bytes = [bytes[0], bytes[1], bytes[2], bytes[3]];
        let value = if big_endian { f32::from_be_bytes(bytes) } else { f32::from_le_bytes(bytes) };
        if value.is_finite() { value } else { 0.0 }
    };
    match buffers {
        [interleaved] if interleaved.len() % 8 == 0 => Ok(interleaved.chunks_exact(4).map(decode).collect()),
        [left, right] if left.len() == right.len() && left.len() % 4 == 0 => {
            Ok(left.chunks_exact(4).zip(right.chunks_exact(4)).flat_map(|(left, right)| [decode(left), decode(right)]).collect())
        }
        _ => Err("ScreenCaptureKit returned an invalid stereo buffer layout.".into()),
    }
}

#[derive(Default)]
pub struct Packetizer {
    samples: VecDeque<f32>,
    started_at: Option<Instant>,
}

impl Packetizer {
    pub fn push(&mut self, samples: Vec<f32>, mut emit: impl FnMut(AudioFrame)) {
        if self.started_at.is_some_and(|started| started.elapsed().as_millis() > 60) {
            self.samples.clear();
            self.started_at = None;
        }
        for sample in samples {
            if self.samples.is_empty() { self.started_at = Some(Instant::now()); }
            self.samples.push_back(sample);
            if self.samples.len() == SAMPLES_PER_PACKET {
                let mut frame = AudioFrame::new(self.samples.drain(..).collect());
                if let Some(started) = self.started_at.take() { frame.captured_at = started; }
                emit(frame);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn planar_and_interleaved_stereo_preserve_channel_order() -> Result<(), String> {
        let left = [0.25_f32.to_le_bytes(), 0.5_f32.to_le_bytes()].concat();
        let right = [(-0.25_f32).to_le_bytes(), (-0.5_f32).to_le_bytes()].concat();
        let expected = vec![0.25, -0.25, 0.5, -0.5];
        assert_eq!(decode_stereo(&[&left, &right], false)?, expected);
        let interleaved: Vec<u8> = expected.iter().flat_map(|value| value.to_be_bytes()).collect();
        assert_eq!(decode_stereo(&[&interleaved], true)?, expected);
        assert!(decode_stereo(&[&left, &right[..4]], false).is_err());
        Ok(())
    }

    #[test]
    fn fragmented_callbacks_produce_exact_packets_and_discard_stale_partial_audio() {
        let mut packets = Vec::new();
        let mut packetizer = Packetizer::default();
        packetizer.push(vec![0.25; 1000], |frame| packets.push(frame));
        assert!(packets.is_empty());
        packetizer.push(vec![0.5; 1000], |frame| packets.push(frame));
        assert_eq!(packets.len(), 1);
        assert_eq!(packets[0].samples.len(), SAMPLES_PER_PACKET);
        assert_eq!(packets[0].samples[999], 0.25);
        assert_eq!(packets[0].samples[1000], 0.5);
        packetizer.started_at = Instant::now().checked_sub(std::time::Duration::from_millis(100));
        packetizer.push(vec![0.75; SAMPLES_PER_PACKET], |frame| packets.push(frame));
        assert_eq!(packets.len(), 2);
        assert!(packets[1].samples.iter().all(|value| *value == 0.75));
        assert!(packetizer.samples.is_empty());
    }
}

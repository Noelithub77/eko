use std::collections::VecDeque;

const SAMPLES_PER_MS: usize = 48 * 2;
const MAX_SAMPLES: usize = 80 * SAMPLES_PER_MS;
const RECOVERY_SAMPLES: usize = 40 * SAMPLES_PER_MS;

pub(super) struct PlaybackBuffer {
    samples: VecDeque<f32>,
    paused: bool,
}

impl PlaybackBuffer {
    pub(super) fn new(paused: bool) -> Self {
        Self { samples: VecDeque::with_capacity(MAX_SAMPLES), paused }
    }

    pub(super) fn push(&mut self, decoded: &[f32]) {
        if !self.paused {
            append_live(&mut self.samples, decoded);
        }
    }

    pub(super) fn set_paused(&mut self, paused: bool) {
        self.samples.clear();
        self.paused = paused;
    }

    pub(super) fn buffer_ms(&self) -> f64 {
        self.samples.len() as f64 / SAMPLES_PER_MS as f64
    }

    pub(super) fn render(&mut self, frames: &mut [(f32, f32)]) {
        for (left, right) in frames {
            *left = self.samples.pop_front().unwrap_or(0.0);
            *right = self.samples.pop_front().unwrap_or(0.0);
        }
    }
}

pub(super) fn append_live(samples: &mut VecDeque<f32>, decoded: &[f32]) {
    samples.extend(decoded.iter().copied());
    if samples.len() > MAX_SAMPLES {
        let excess = samples.len() - RECOVERY_SAMPLES;
        samples.drain(..excess);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pause_discards_old_and_incoming_audio_and_resume_plays_fresh_samples() {
        let mut buffer = PlaybackBuffer::new(false);
        for _ in 0..3 {
            buffer.push(&[1.0; 1920]);
            buffer.set_paused(true);
            for _ in 0..500 {
                buffer.push(&[2.0; 1920]);
            }
            assert_eq!(buffer.buffer_ms(), 0.0);
            let mut output = [(9.0, 9.0); 960];
            buffer.render(&mut output);
            assert!(output.iter().all(|frame| *frame == (0.0, 0.0)));
            buffer.set_paused(false);
            buffer.render(&mut output);
            assert!(output.iter().all(|frame| *frame == (0.0, 0.0)));
            buffer.push(&[3.0; 1920]);
            buffer.render(&mut output);
            assert!(output.iter().all(|frame| *frame == (3.0, 3.0)));
        }
    }

    #[test]
    fn receiver_starting_paused_cannot_collect_audio() {
        let mut buffer = PlaybackBuffer::new(true);
        buffer.push(&[1.0; 1920]);
        assert_eq!(buffer.buffer_ms(), 0.0);
        buffer.set_paused(false);
        buffer.push(&[2.0; 1920]);
        assert_eq!(buffer.buffer_ms(), 20.0);
    }

    #[test]
    fn stalled_playback_returns_to_recent_audio() {
        let mut samples = VecDeque::new();
        append_live(&mut samples, &vec![1.0; 60 * SAMPLES_PER_MS]);
        append_live(&mut samples, &vec![2.0; 40 * SAMPLES_PER_MS]);
        assert_eq!(samples.len(), RECOVERY_SAMPLES);
        assert!(samples.iter().all(|value| *value == 2.0));
    }

    #[test]
    fn normal_packet_does_not_discard_jitter_protection() {
        let mut samples = VecDeque::new();
        append_live(&mut samples, &[1.0; 1920]);
        append_live(&mut samples, &[2.0; 1920]);
        assert_eq!(samples.len(), 3840);
        assert_eq!(samples.front(), Some(&1.0));
    }
}

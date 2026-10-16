use std::collections::VecDeque;

const SAMPLES_PER_MS: usize = 48 * 2;
const MAX_SAMPLES: usize = 80 * SAMPLES_PER_MS;
const RECOVERY_SAMPLES: usize = 40 * SAMPLES_PER_MS;

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

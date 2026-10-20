const BINS: usize = 48;
const WINDOW: usize = 128;

// Match the browser's 128-sample frequency view; only normalized levels leave Rust.
pub(super) fn frequency_levels(stereo: &[f32]) -> Vec<f32> {
    let mut mono = [0.0_f32; WINDOW];
    for (index, pair) in stereo.chunks_exact(2).take(WINDOW).enumerate() {
        let window = 0.5 - 0.5 * (std::f32::consts::TAU * index as f32 / WINDOW as f32).cos();
        mono[index] = (pair[0] + pair[1]) * 0.5 * window;
    }
    (0..BINS).map(|bin| {
        let coefficient = 2.0 * (std::f32::consts::TAU * bin as f32 / WINDOW as f32).cos();
        let (mut previous, mut before) = (0.0_f32, 0.0_f32);
        for sample in mono {
            let next = sample + coefficient * previous - before;
            before = previous;
            previous = next;
        }
        let power = (previous * previous + before * before - coefficient * previous * before).max(0.0);
        let amplitude = power.sqrt() / WINDOW as f32;
        if !amplitude.is_finite() || amplitude <= 0.0 { return 0.0; }
        ((20.0 * amplitude.log10() + 100.0) / 70.0).clamp(0.0, 1.0)
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_produces_no_activity() {
        assert_eq!(frequency_levels(&[0.0; 1920]), vec![0.0; BINS]);
    }

    #[test]
    fn decoded_tone_appears_in_its_frequency_bin() {
        let samples: Vec<f32> = (0..WINDOW).flat_map(|i| {
            let value = 0.01 * (std::f32::consts::TAU * 8.0 * i as f32 / WINDOW as f32).sin();
            [value, value]
        }).collect();
        let levels = frequency_levels(&samples);
        assert!(levels[8] > 0.5);
        assert!(levels[8] > levels[4] + 0.3);
        assert!(levels.iter().all(|v| v.is_finite() && (0.0..=1.0).contains(v)));
    }
}

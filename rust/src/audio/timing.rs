use std::sync::atomic::{AtomicU64, Ordering};
use serde::Serialize;

#[derive(Debug, Default)]
pub struct AudioTiming {
    count: AtomicU64,
    total: AtomicU64,
    latest: AtomicU64,
    max: AtomicU64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingSnapshot {
    samples: u64,
    latest_ms: Option<f64>,
    average_ms: Option<f64>,
    max_ms: Option<f64>,
}

impl AudioTiming {
    pub fn record_us(&self, micros: u64) {
        self.latest.store(micros, Ordering::Relaxed);
        self.total.fetch_add(micros, Ordering::Relaxed);
        self.max.fetch_max(micros, Ordering::Relaxed);
        self.count.fetch_add(1, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> TimingSnapshot {
        let samples = self.count.load(Ordering::Relaxed);
        TimingSnapshot {
            samples,
            latest_ms: (samples > 0).then(|| self.latest.load(Ordering::Relaxed) as f64 / 1000.0),
            average_ms: (samples > 0).then(|| self.total.load(Ordering::Relaxed) as f64 / samples as f64 / 1000.0),
            max_ms: (samples > 0).then(|| self.max.load(Ordering::Relaxed) as f64 / 1000.0),
        }
    }
}

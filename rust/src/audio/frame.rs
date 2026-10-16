pub const SAMPLE_RATE: u32 = 48_000;
pub const CHANNELS: usize = 2;
pub const FRAME_MS: u64 = 20;
pub const FRAMES_PER_PACKET: usize = 960;
pub const SAMPLES_PER_PACKET: usize = FRAMES_PER_PACKET * CHANNELS;

#[derive(Clone, Debug)]
pub struct AudioFrame {
    pub samples: Vec<f32>,
    pub captured_at: std::time::Instant,
    pub capture_latency_us: Option<u64>,
}

#[derive(Clone, Debug)]
pub struct EncodedAudioFrame {
    pub data: Vec<u8>,
    pub duration_ms: u64,
}

impl AudioFrame {
    pub fn new(samples: Vec<f32>) -> Self {
        Self { samples, captured_at: std::time::Instant::now(), capture_latency_us: None }
    }
}

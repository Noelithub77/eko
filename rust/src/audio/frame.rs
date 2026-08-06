pub const SAMPLE_RATE: u32 = 48_000;
pub const CHANNELS: usize = 2;
pub const FRAME_MS: u64 = 20;
pub const FRAMES_PER_PACKET: usize = 960;
pub const SAMPLES_PER_PACKET: usize = FRAMES_PER_PACKET * CHANNELS;

#[derive(Clone, Debug)]
pub struct AudioFrame {
    pub samples: Vec<f32>,
}

#[derive(Clone, Debug)]
pub struct EncodedAudioFrame {
    pub data: Vec<u8>,
    pub duration_ms: u64,
}

impl AudioFrame {
    pub fn new(samples: Vec<f32>) -> Self {
        Self { samples }
    }
}

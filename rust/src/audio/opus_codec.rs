use opus::{Application, Channels, Encoder};

use super::frame::{AudioFrame, EncodedAudioFrame, FRAME_MS, SAMPLE_RATE};

const MAX_OPUS_PACKET_BYTES: usize = 4_000;

pub struct OpusAudioEncoder {
    encoder: Encoder,
}

impl OpusAudioEncoder {
    pub fn new() -> Result<Self, String> {
        let encoder = Encoder::new(SAMPLE_RATE, Channels::Stereo, Application::LowDelay)
            .map_err(|error| error.to_string())?;

        Ok(Self { encoder })
    }

    pub fn encode(&mut self, frame: AudioFrame) -> Result<EncodedAudioFrame, String> {
        let mut output = vec![0_u8; MAX_OPUS_PACKET_BYTES];
        let used_bytes = self
            .encoder
            .encode_float(&frame.samples, &mut output)
            .map_err(|error| error.to_string())?;
        output.truncate(used_bytes);

        Ok(EncodedAudioFrame {
            data: output,
            duration_ms: FRAME_MS,
            created_at_ms: frame.created_at_ms,
        })
    }
}

use opus::{Application, Bandwidth, Bitrate, Channels, Encoder, Signal};

use super::frame::{AudioFrame, EncodedAudioFrame, FRAME_MS, SAMPLE_RATE};

const MAX_OPUS_PACKET_BYTES: usize = 4_000;

pub struct OpusAudioEncoder {
    encoder: Encoder,
}

impl OpusAudioEncoder {
    pub fn new() -> Result<Self, String> {
        let mut encoder = Encoder::new(SAMPLE_RATE, Channels::Stereo, Application::LowDelay)
            .map_err(|error| error.to_string())?;
        encoder
            .set_bitrate(Bitrate::Bits(128_000))
            .map_err(|error| error.to_string())?;
        encoder.set_vbr(true).map_err(|error| error.to_string())?;
        encoder
            .set_vbr_constraint(true)
            .map_err(|error| error.to_string())?;
        encoder
            .set_inband_fec(true)
            .map_err(|error| error.to_string())?;
        encoder
            .set_packet_loss_perc(5)
            .map_err(|error| error.to_string())?;
        encoder
            .set_max_bandwidth(Bandwidth::Fullband)
            .map_err(|error| error.to_string())?;
        encoder
            .set_force_channels(Some(Channels::Stereo))
            .map_err(|error| error.to_string())?;
        encoder
            .set_signal(Signal::Music)
            .map_err(|error| error.to_string())?;
        encoder
            .set_complexity(8)
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

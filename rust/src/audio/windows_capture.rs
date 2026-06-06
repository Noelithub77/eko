#[cfg(windows)]
mod windows {
    use std::collections::VecDeque;
    use std::thread;

    use tokio::sync::mpsc;
    use wasapi::{
        initialize_mta, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat,
    };

    use crate::audio::frame::{
        AudioFrame, CHANNELS, FRAMES_PER_PACKET, SAMPLE_RATE, SAMPLES_PER_PACKET,
    };

    type CaptureResult<T> = Result<T, String>;

    pub fn start_system_audio_source(sender: mpsc::Sender<AudioFrame>) -> thread::JoinHandle<()> {
        thread::Builder::new()
            .name("eko-wasapi-loopback".to_string())
            .spawn(move || {
                if let Err(error) = capture_loop(sender) {
                    eprintln!("Eko audio capture stopped: {error}");
                }
            })
            .expect("failed to spawn Windows audio capture")
    }

    fn capture_loop(sender: mpsc::Sender<AudioFrame>) -> CaptureResult<()> {
        initialize_mta().ok().map_err(|error| error.to_string())?;

        let enumerator = DeviceEnumerator::new().map_err(|error| error.to_string())?;
        let device = enumerator
            .get_default_device(&Direction::Render)
            .map_err(|error| error.to_string())?;
        let mut audio_client = device
            .get_iaudioclient()
            .map_err(|error| error.to_string())?;
        let format = WaveFormat::new(
            32,
            32,
            &SampleType::Float,
            SAMPLE_RATE as usize,
            CHANNELS,
            None,
        );
        let (_, min_time) = audio_client
            .get_device_period()
            .map_err(|error| error.to_string())?;
        let mode = StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: min_time,
        };

        audio_client
            .initialize_client(&format, &Direction::Capture, &mode)
            .map_err(|error| error.to_string())?;
        let event = audio_client
            .set_get_eventhandle()
            .map_err(|error| error.to_string())?;
        let capture_client = audio_client
            .get_audiocaptureclient()
            .map_err(|error| error.to_string())?;
        let mut bytes = VecDeque::<u8>::with_capacity(SAMPLES_PER_PACKET * 4 * 4);

        audio_client
            .start_stream()
            .map_err(|error| error.to_string())?;

        loop {
            capture_client
                .read_from_device_to_deque(&mut bytes)
                .map_err(|error| error.to_string())?;

            while bytes.len() >= SAMPLES_PER_PACKET * 4 {
                let samples = read_packet_samples(&mut bytes);
                if sender.blocking_send(AudioFrame::new(samples)).is_err() {
                    let _ = audio_client.stop_stream();
                    return Ok(());
                }
            }

            if event.wait_for_event(1_000_000).is_err() {
                let _ = audio_client.stop_stream();
                return Err("WASAPI capture event failed.".to_string());
            }
        }
    }

    fn read_packet_samples(bytes: &mut VecDeque<u8>) -> Vec<f32> {
        let mut samples = Vec::with_capacity(FRAMES_PER_PACKET * CHANNELS);
        for _ in 0..SAMPLES_PER_PACKET {
            let raw = [
                bytes.pop_front().unwrap_or(0),
                bytes.pop_front().unwrap_or(0),
                bytes.pop_front().unwrap_or(0),
                bytes.pop_front().unwrap_or(0),
            ];
            samples.push(f32::from_le_bytes(raw));
        }
        samples
    }
}

#[cfg(windows)]
pub use windows::start_system_audio_source;

#[cfg(not(windows))]
pub use crate::audio::silence::start_silence_source as start_system_audio_source;

#[cfg(target_os = "android")]
mod android {
    use std::collections::VecDeque;
    use std::sync::{Arc, Mutex};

    use oboe::{
        AudioOutputCallback, AudioOutputStreamSafe, AudioStream, AudioStreamBuilder,
        DataCallbackResult, PerformanceMode, SharingMode, Stereo,
    };

    #[derive(Clone)]
    pub struct NativeAudioPlayer {
        samples: Arc<Mutex<VecDeque<f32>>>,
        stream: Arc<Mutex<Option<oboe::AudioStreamAsync<oboe::Output, NativeAudioCallback>>>>,
    }

    impl NativeAudioPlayer {
        pub fn start() -> Result<Self, String> {
            let samples = Arc::new(Mutex::new(VecDeque::with_capacity(48_000)));
            let callback = NativeAudioCallback {
                samples: Arc::clone(&samples),
            };
            let mut stream = AudioStreamBuilder::default()
                .set_performance_mode(PerformanceMode::LowLatency)
                .set_sharing_mode(SharingMode::Shared)
                .set_format::<f32>()
                .set_channel_count::<Stereo>()
                .set_callback(callback)
                .open_stream()
                .map_err(|error| format!("{error:?}"))?;

            stream.start().map_err(|error| format!("{error:?}"))?;

            Ok(Self {
                samples,
                stream: Arc::new(Mutex::new(Some(stream))),
            })
        }

        pub fn push_samples(&self, decoded: &[f32]) {
            if let Ok(mut samples) = self.samples.lock() {
                samples.extend(decoded.iter().copied());
                while samples.len() > 96_000 {
                    let _ = samples.pop_front();
                }
            }
        }

        pub fn stop(&self) {
            if let Ok(mut stream) = self.stream.lock() {
                if let Some(mut stream) = stream.take() {
                    let _ = stream.stop();
                }
            }
        }
    }

    pub struct NativeAudioCallback {
        samples: Arc<Mutex<VecDeque<f32>>>,
    }

    impl AudioOutputCallback for NativeAudioCallback {
        type FrameType = (f32, Stereo);

        fn on_audio_ready(
            &mut self,
            _stream: &mut dyn AudioOutputStreamSafe,
            frames: &mut [(f32, f32)],
        ) -> DataCallbackResult {
            if let Ok(mut samples) = self.samples.lock() {
                for (left, right) in frames {
                    *left = samples.pop_front().unwrap_or(0.0);
                    *right = samples.pop_front().unwrap_or(0.0);
                }
            } else {
                for (left, right) in frames {
                    *left = 0.0;
                    *right = 0.0;
                }
            }

            DataCallbackResult::Continue
        }
    }
}

#[cfg(target_os = "android")]
pub use android::NativeAudioPlayer;

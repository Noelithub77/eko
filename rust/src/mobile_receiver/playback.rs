#[cfg(target_os = "android")]
mod android {
    use std::collections::VecDeque;
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};

    use oboe::{
        AudioOutputCallback, AudioOutputStreamSafe, AudioStream, AudioStreamBuilder,
        DataCallbackResult, PerformanceMode, SharingMode, Stereo,
    };

    static PLAYBACK_PAUSED: AtomicBool = AtomicBool::new(false);
    const SAMPLE_RATE: f64 = 48_000.0;
    const CHANNELS: f64 = 2.0;

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
            if PLAYBACK_PAUSED.load(Ordering::Relaxed) {
                self.clear_buffer();
                return;
            }

            if let Ok(mut samples) = self.samples.lock() {
                samples.extend(decoded.iter().copied());
                while samples.len() > 96_000 {
                    let _ = samples.pop_front();
                }
            }
        }

        pub fn pause(&self) -> Result<(), String> {
            set_paused(true);
            self.clear_buffer();
            Ok(())
        }

        pub fn resume(&self) -> Result<(), String> {
            self.clear_buffer();
            set_paused(false);
            Ok(())
        }

        pub fn clear_buffer(&self) {
            if let Ok(mut samples) = self.samples.lock() {
                samples.clear();
            }
        }

        pub fn buffer_ms(&self) -> Option<f64> {
            self.samples
                .lock()
                .ok()
                .map(|samples| (samples.len() as f64 / (SAMPLE_RATE * CHANNELS)) * 1000.0)
        }

        pub fn stop(&self) {
            if let Ok(mut stream) = self.stream.lock() {
                if let Some(mut stream) = stream.take() {
                    let _ = stream.stop();
                }
            }
        }
    }

    pub fn set_paused(paused: bool) {
        PLAYBACK_PAUSED.store(paused, Ordering::Relaxed);
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
            if PLAYBACK_PAUSED.load(Ordering::Relaxed) {
                for (left, right) in frames {
                    *left = 0.0;
                    *right = 0.0;
                }
                return DataCallbackResult::Continue;
            }

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

    #[no_mangle]
    pub extern "system" fn Java_com_codialo_eko_media_EkoMediaBridge_setNativePlaybackPaused(
        _env: *mut c_void,
        _class: *mut c_void,
        paused: u8,
    ) {
        set_paused(paused != 0);
    }
}

#[cfg(target_os = "android")]
pub use android::NativeAudioPlayer;

#[cfg(target_os = "android")]
mod android {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex, OnceLock, Weak};
    use tauri::{AppHandle, Emitter};
    use super::super::sample_buffer::PlaybackBuffer;

    use oboe::{
        AudioOutputCallback, AudioOutputStreamSafe, AudioStream, AudioStreamBuilder,
        DataCallbackResult, PerformanceMode, SharingMode, Stereo,
    };

    static PLAYBACK_PAUSED: AtomicBool = AtomicBool::new(false);
    static CONTROL: OnceLock<Mutex<PlaybackControl>> = OnceLock::new();
    struct PlaybackControl {
        app: AppHandle,
        samples: Weak<Mutex<PlaybackBuffer>>,
    }

    #[derive(Clone)]
    pub struct NativeAudioPlayer {
        samples: Arc<Mutex<PlaybackBuffer>>,
        stream: Arc<Mutex<Option<oboe::AudioStreamAsync<oboe::Output, NativeAudioCallback>>>>,
    }

    impl NativeAudioPlayer {
        pub fn start(app: AppHandle) -> Result<Self, String> {
            let samples = Arc::new(Mutex::new(PlaybackBuffer::new(is_paused())));
            let control = PlaybackControl { app, samples: Arc::downgrade(&samples) };
            let holder = CONTROL.get_or_init(|| Mutex::new(control));
            let mut current = holder.lock().map_err(|error| error.to_string())?;
            samples.lock().map_err(|error| error.to_string())?.set_paused(is_paused());
            current.samples = Arc::downgrade(&samples);
            drop(current);
            let callback = NativeAudioCallback {
                samples: Arc::clone(&samples),
            };
            let mut stream = AudioStreamBuilder::default()
                .set_performance_mode(PerformanceMode::LowLatency)
                .set_sharing_mode(SharingMode::Shared)
                .set_format::<f32>()
                .set_channel_count::<Stereo>()
                .set_sample_rate(48_000)
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
                samples.push(decoded);
            }
        }

        pub fn buffer_ms(&self) -> Option<f64> {
            self.samples
                .lock()
                .ok()
                .map(|samples| samples.buffer_ms())
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
        if let Some(holder) = CONTROL.get() {
            if let Ok(control) = holder.lock() {
                if let Some(samples) = control.samples.upgrade() {
                    if let Ok(mut samples) = samples.lock() { samples.set_paused(paused); }
                }
                let _ = control.app.emit("native-receiver-event", crate::domain::NativeReceiverEvent::Playback { is_playing: !paused });
            }
        }
    }

    pub fn is_paused() -> bool { PLAYBACK_PAUSED.load(Ordering::Relaxed) }

    pub struct NativeAudioCallback {
        samples: Arc<Mutex<PlaybackBuffer>>,
    }

    impl AudioOutputCallback for NativeAudioCallback {
        type FrameType = (f32, Stereo);

        fn on_audio_ready(
            &mut self,
            _stream: &mut dyn AudioOutputStreamSafe,
            frames: &mut [(f32, f32)],
        ) -> DataCallbackResult {
            if let Ok(mut samples) = self.samples.try_lock() {
                samples.render(frames);
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
pub use android::{is_paused, NativeAudioPlayer};

#[cfg(windows)]
mod windows {
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};

    use tokio::sync::mpsc;
    use wasapi::{
        initialize_mta, DeviceEnumerator, Direction, SampleType, StreamMode, WasapiError,
        WaveFormat,
    };
    use windows::core::PCWSTR;
    use windows::Win32::Media::Audio;
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
    use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};

    use crate::audio::frame::{
        AudioFrame, CHANNELS, FRAME_MS, FRAMES_PER_PACKET, SAMPLES_PER_PACKET, SAMPLE_RATE,
    };

    type CaptureResult<T> = Result<T, String>;
    const RETRY_DELAY_MS: u64 = 500;
    const MAX_RETRY_DELAY_MS: u64 = 5_000;
    const AUDIO_EVENT_TIMEOUT_MS: u32 = 1_000;

    struct CaptureClock {
        frequency: i64,
    }

    impl CaptureClock {
        fn new() -> Option<Self> {
            let mut frequency = 0;
            unsafe { QueryPerformanceFrequency(&mut frequency) }.ok()?;
            (frequency > 0).then_some(Self { frequency })
        }

        fn captured_at(&self, timestamp: u64) -> Option<Instant> {
            if timestamp == 0 { return None; }
            let now = Instant::now();
            let mut counter = 0;
            unsafe { QueryPerformanceCounter(&mut counter) }.ok()?;
            let counter = u128::try_from(counter).ok()?;
            let current = counter * 10_000_000 / self.frequency as u128;
            let elapsed = current.checked_sub(u128::from(timestamp))?;
            let nanos = u64::try_from(elapsed.checked_mul(100)?).ok()?;
            now.checked_sub(Duration::from_nanos(nanos))
        }
    }

    struct DefaultRenderDeviceMonitor {
        enumerator: Audio::IMMDeviceEnumerator,
        callback: Audio::IMMNotificationClient,
        changed: Arc<AtomicBool>,
        active_device_id: Arc<Mutex<Option<String>>>,
    }

    impl DefaultRenderDeviceMonitor {
        fn new() -> CaptureResult<Self> {
            let enumerator = unsafe {
                CoCreateInstance::<_, Audio::IMMDeviceEnumerator>(
                    &Audio::MMDeviceEnumerator,
                    None,
                    CLSCTX_ALL,
                )
            }
            .map_err(|error| error.to_string())?;
            let changed = Arc::new(AtomicBool::new(false));
            let active_device_id = Arc::new(Mutex::new(None));
            let callback: Audio::IMMNotificationClient = DefaultRenderDeviceNotification {
                changed: changed.clone(),
                active_device_id: active_device_id.clone(),
            }
            .into();

            unsafe {
                enumerator
                    .RegisterEndpointNotificationCallback(&callback)
                    .map_err(|error| error.to_string())?;
            }

            Ok(Self {
                enumerator,
                callback,
                changed,
                active_device_id,
            })
        }

        fn set_active_device_id(&self, device_id: String) -> CaptureResult<()> {
            let mut active_device_id = self
                .active_device_id
                .lock()
                .map_err(|_| "Windows audio device monitor lock was poisoned.".to_string())?;
            *active_device_id = Some(device_id);
            Ok(())
        }

        fn take_changed(&self) -> bool {
            self.changed.swap(false, Ordering::Acquire)
        }
    }

    impl Drop for DefaultRenderDeviceMonitor {
        fn drop(&mut self) {
            unsafe {
                let _ = self
                    .enumerator
                    .UnregisterEndpointNotificationCallback(&self.callback);
            }
        }
    }

    #[windows::core::implement(Audio::IMMNotificationClient)]
    struct DefaultRenderDeviceNotification {
        changed: Arc<AtomicBool>,
        active_device_id: Arc<Mutex<Option<String>>>,
    }

    impl DefaultRenderDeviceNotification {
        fn is_active_device(&self, device_id: &PCWSTR) -> bool {
            let Ok(device_id) = (unsafe { device_id.to_string() }) else {
                return true;
            };
            self.active_device_id
                .lock()
                .map(|active_device_id| active_device_id.as_deref() == Some(device_id.as_str()))
                .unwrap_or(true)
        }
    }

    impl Audio::IMMNotificationClient_Impl for DefaultRenderDeviceNotification_Impl {
        fn OnDefaultDeviceChanged(
            &self,
            flow: Audio::EDataFlow,
            role: Audio::ERole,
            _default_device_id: &PCWSTR,
        ) -> windows::core::Result<()> {
            if flow == Audio::eRender && role == Audio::eConsole {
                self.changed.store(true, Ordering::Release);
            }
            Ok(())
        }

        fn OnDeviceStateChanged(
            &self,
            device_id: &PCWSTR,
            state: Audio::DEVICE_STATE,
        ) -> windows::core::Result<()> {
            if self.is_active_device(device_id)
                && (state == Audio::DEVICE_STATE_DISABLED
                    || state == Audio::DEVICE_STATE_NOTPRESENT
                    || state == Audio::DEVICE_STATE_UNPLUGGED)
            {
                self.changed.store(true, Ordering::Release);
            }
            Ok(())
        }

        fn OnDeviceAdded(&self, _device_id: &PCWSTR) -> windows::core::Result<()> {
            Ok(())
        }

        fn OnDeviceRemoved(&self, device_id: &PCWSTR) -> windows::core::Result<()> {
            if self.is_active_device(device_id) {
                self.changed.store(true, Ordering::Release);
            }
            Ok(())
        }

        fn OnPropertyValueChanged(
            &self,
            _device_id: &PCWSTR,
            _key: &windows::Win32::Foundation::PROPERTYKEY,
        ) -> windows::core::Result<()> {
            Ok(())
        }
    }

    pub fn start_system_audio_source(
        sender: mpsc::Sender<AudioFrame>,
    ) -> Result<thread::JoinHandle<()>, String> {
        thread::Builder::new()
            .name("eko-wasapi-loopback".to_string())
            .spawn(move || {
                let mut attempt = 0usize;
                loop {
                    match capture_loop(sender.clone()) {
                        Ok(()) => return,
                        Err(error) => {
                            attempt = attempt.saturating_add(1);
                            let backoff_step = attempt.saturating_sub(1).min(3) as u32;
                            let delay_ms = RETRY_DELAY_MS
                                .saturating_mul(2u64.saturating_pow(backoff_step))
                                .min(MAX_RETRY_DELAY_MS);
                            log::warn!(
                                "Windows audio capture stopped, retrying in {delay_ms}ms (attempt {attempt}): {error}"
                            );
                            thread::sleep(Duration::from_millis(delay_ms));
                        }
                    }
                }
            })
            .map_err(|error| error.to_string())
    }

    fn capture_loop(sender: mpsc::Sender<AudioFrame>) -> CaptureResult<()> {
        initialize_mta().ok().map_err(|error| error.to_string())?;

        let monitor = DefaultRenderDeviceMonitor::new()?;
        let enumerator = DeviceEnumerator::new().map_err(|error| error.to_string())?;
        let device = enumerator
            .get_default_device(&Direction::Render)
            .map_err(|error| error.to_string())?;
        let device_id = device.get_id().map_err(|error| error.to_string())?;
        monitor.set_active_device_id(device_id.clone())?;
        let device_name = device
            .get_friendlyname()
            .unwrap_or_else(|_| "unknown render device".to_string());
        log::info!("Windows WASAPI loopback capture started: device={device_name} id={device_id}");
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
        let buffer_frames = audio_client.get_buffer_size().map_err(|error| error.to_string())? as usize;
        let mut packet = vec![0_u8; buffer_frames * CHANNELS * 4];
        let clock = CaptureClock::new();
        let mut captured_at: Option<Instant> = None;

        audio_client
            .start_stream()
            .map_err(|error| error.to_string())?;

        loop {
            if sender.is_closed() {
                let _ = audio_client.stop_stream();
                return Ok(());
            }
            // Drain every pending device packet before waiting for another event.
            while capture_client.get_next_packet_size().map_err(|error| error.to_string())?.is_some_and(|size| size > 0) {
                let pending = bytes.len();
                let (frames, info) = capture_client
                    .read_from_device(&mut packet)
                    .map_err(|error| error.to_string())?;
                if frames == 0 { break; }
                let read = packet.get(..frames as usize * CHANNELS * 4)
                    .ok_or_else(|| "WASAPI returned more samples than its capture buffer.".to_string())?;
                bytes.extend(read.iter().copied());
                if info.flags.data_discontinuity {
                    bytes.drain(..pending);
                }
                if pending == 0 || info.flags.data_discontinuity {
                    captured_at = if info.flags.timestamp_error { None }
                        else { clock.as_ref().and_then(|clock| clock.captured_at(info.timestamp)) };
                }

                while bytes.len() >= SAMPLES_PER_PACKET * 4 {
                    let samples = read_packet_samples(&mut bytes);
                    let mut frame = AudioFrame::new(samples);
                    if let Some(started) = captured_at {
                        frame.captured_at = started;
                        frame.capture_latency_us = Some(started.elapsed().as_micros().min(u128::from(u64::MAX)) as u64);
                        captured_at = started.checked_add(Duration::from_millis(FRAME_MS));
                    }
                    if sender.blocking_send(frame).is_err() {
                        let _ = audio_client.stop_stream();
                        return Ok(());
                    }
                }
            }

            match event.wait_for_event(AUDIO_EVENT_TIMEOUT_MS) {
                Ok(()) | Err(WasapiError::EventTimeout) => {
                    if monitor.take_changed() {
                        let _ = audio_client.stop_stream();
                        return Err("Windows default render device changed.".to_string());
                    }
                }
                Err(error) => {
                    let _ = audio_client.stop_stream();
                    return Err(format!("WASAPI capture event failed: {error}"));
                }
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

#[cfg(target_os = "linux")]
pub use crate::audio::linux_capture::start_system_audio_source;

#[cfg(not(any(windows, target_os = "linux")))]
pub use crate::audio::silence::start_silence_source as start_system_audio_source;

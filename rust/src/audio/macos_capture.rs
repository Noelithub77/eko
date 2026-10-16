use std::sync::{atomic::{AtomicBool, Ordering}, mpsc as sync_channel, Arc, Mutex};
use std::thread;
use std::time::Duration;

use screencapturekit::prelude::*;
use tokio::sync::mpsc;

use super::frame::AudioFrame;
use super::macos_pcm::{decode_stereo, Packetizer};

pub fn start_system_audio_source(sender: mpsc::Sender<AudioFrame>) -> Result<thread::JoinHandle<()>, String> {
    let (ready, startup) = sync_channel::sync_channel(1);
    let cancelled = Arc::new(AtomicBool::new(false));
    let stop = Arc::clone(&cancelled);
    let thread = thread::Builder::new().name("eko-macos-capture".into()).spawn(move || {
        match create_capture(sender.clone(), Arc::clone(&stop)) {
            Ok(stream) => {
                if ready.send(Ok(())).is_err() { return; }
                while !sender.is_closed() && !stop.load(Ordering::Relaxed) {
                    thread::sleep(Duration::from_millis(100));
                }
                if let Err(error) = stream.stop_capture() { log::warn!("macOS capture stop failed: {error}"); }
            }
            Err(error) => { let _ = ready.send(Err(error)); }
        }
    }).map_err(|error| error.to_string())?;
    match startup.recv_timeout(Duration::from_secs(15)) {
        Ok(Ok(())) => Ok(thread),
        Ok(Err(error)) => Err(error),
        Err(_) => {
            cancelled.store(true, Ordering::Relaxed);
            Err("macOS capture startup timed out. Allow eko in Screen & System Audio Recording, then restart the stream.".into())
        }
    }
}

fn create_capture(sender: mpsc::Sender<AudioFrame>, failed: Arc<AtomicBool>) -> Result<SCStream, String> {
    let content = SCShareableContent::get().map_err(capture_error)?;
    let display = content.displays().into_iter().next().ok_or("No display is available for macOS system-audio capture.")?;
    let filter = SCContentFilter::create().with_display(&display).with_excluding_windows(&[]).build().map_err(capture_error)?;
    // Register only audio output; do not deliver, encode or retain screen frames.
    let config = SCStreamConfiguration::new().with_width(2).with_height(2)
        .with_minimum_frame_interval(&CMTime::new(1, 1)).with_queue_depth(3)
        .with_captures_audio(true).with_sample_rate(48_000).with_channel_count(2)
        .with_excludes_current_process_audio(true);
    let delegate_failure = Arc::clone(&failed);
    let delegate = ErrorHandler::new(move |error| {
        log::error!("macOS system-audio capture stopped: {error}");
        delegate_failure.store(true, Ordering::Relaxed);
    });
    let mut stream = SCStream::new_with_delegate(&filter, &config, delegate).map_err(capture_error)?;
    let packets = Mutex::new(Packetizer::default());
    stream.add_output_handler(move |sample: CMSampleBuffer, kind: SCStreamOutputType| {
        if kind != SCStreamOutputType::Audio || failed.load(Ordering::Relaxed) || sender.is_closed() { return; }
        let result = read_audio(&sample).and_then(|samples| {
            let mut packets = packets.lock().map_err(|_| "macOS audio packet buffer is unavailable.".to_string())?;
            packets.push(samples, |frame| {
                // Never block ScreenCaptureKit's callback on encoding or networking.
                let _ = sender.try_send(frame);
            });
            Ok(())
        });
        if let Err(error) = result {
            log::error!("macOS system-audio capture failed: {error}");
            failed.store(true, Ordering::Relaxed);
        }
    }, SCStreamOutputType::Audio).map_err(capture_error)?;
    stream.start_capture().map_err(capture_error)?;
    Ok(stream)
}

fn read_audio(sample: &CMSampleBuffer) -> Result<Vec<f32>, String> {
    if !sample.is_valid() || !sample.data_is_ready() { return Ok(Vec::new()); }
    let format = sample.format_description().ok_or("macOS audio format is missing.")?;
    if format.audio_sample_rate() != Some(48_000.0) || format.audio_channel_count() != Some(2)
        || format.audio_bits_per_channel() != Some(32) || !format.audio_is_float() {
        return Err("macOS capture did not provide the requested 48 kHz float32 stereo audio.".into());
    }
    let buffers = sample.audio_buffer_list().map_err(|error| format!("macOS audio buffers unavailable ({error})."))?;
    let data: Vec<&[u8]> = (0..buffers.num_buffers()).filter_map(|index| buffers.get(index).map(|buffer| buffer.data())).collect();
    decode_stereo(&data, format.audio_is_big_endian())
}

fn capture_error(error: SCError) -> String {
    format!("macOS system-audio capture: {error}. Allow eko in Privacy & Security → Screen & System Audio Recording, then restart the stream.")
}

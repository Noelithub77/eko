#[cfg(not(windows))]
use std::thread;
#[cfg(not(windows))]
use std::time::Duration;

#[cfg(not(windows))]
use tokio::sync::mpsc;

#[cfg(not(windows))]
use super::frame::{AudioFrame, FRAME_MS, SAMPLES_PER_PACKET};

#[cfg(not(windows))]
pub fn start_silence_source(sender: mpsc::Sender<AudioFrame>) -> thread::JoinHandle<()> {
    thread::Builder::new()
        .name("eko-silence-audio".to_string())
        .spawn(move || loop {
            if sender
                .blocking_send(AudioFrame::new(vec![0.0; SAMPLES_PER_PACKET]))
                .is_err()
            {
                break;
            }
            thread::sleep(Duration::from_millis(FRAME_MS));
        })
        .expect("failed to spawn silence source")
}

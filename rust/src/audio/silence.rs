use std::thread;
use std::time::Duration;

use tokio::sync::mpsc;

use super::frame::{AudioFrame, FRAME_MS, SAMPLES_PER_PACKET};

#[cfg(not(windows))]
pub fn start_silence_source(
    sender: mpsc::Sender<AudioFrame>,
) -> Result<thread::JoinHandle<()>, String> {
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
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
pub fn run_silence_loop(sender: mpsc::Sender<AudioFrame>) {
    loop {
        if sender
            .blocking_send(AudioFrame::new(vec![0.0; SAMPLES_PER_PACKET]))
            .is_err()
        {
            break;
        }
        thread::sleep(Duration::from_millis(FRAME_MS));
    }
}

use std::process::Command;
use std::thread;
use std::time::Duration;

use libpulse_binding::sample::{Format, Spec};
use libpulse_binding::def::BufferAttr;
use libpulse_binding::stream::Direction;
use libpulse_simple_binding::Simple;
use tokio::sync::mpsc;

use super::frame::{AudioFrame, SAMPLES_PER_PACKET, SAMPLE_RATE};

pub fn start_system_audio_source(
    sender: mpsc::Sender<AudioFrame>,
) -> Result<thread::JoinHandle<()>, String> {
    thread::Builder::new()
        .name("eko-linux-capture".to_string())
        .spawn(move || {
            capture_thread_loop(sender);
        })
        .map_err(|e| e.to_string())
}

fn capture_thread_loop(sender: mpsc::Sender<AudioFrame>) {
    let spec = Spec {
        format: Format::S16le,
        rate: SAMPLE_RATE as u32,
        channels: 2,
    };

    loop {
        if sender.is_closed() {
            log::info!("PulseAudio capture stopping because the audio pipeline closed");
            return;
        }

        let source_name = find_monitor_source();
        log::info!("Linux audio capture source: {}", source_name);
        let simple = match Simple::new(
            None,
            "eko",
            Direction::Record,
            Some(&source_name),
            "eko-system-audio",
            &spec,
            None,
            Some(&capture_buffer_attr()),
        ) {
            Ok(simple) => simple,
            Err(error) => {
                log::error!("PulseAudio open failed for source '{source_name}': {error:?}");
                thread::sleep(Duration::from_millis(500));
                continue;
            }
        };

        log::info!(
            "PulseAudio capture started: source={source_name} rate={}Hz channels=2 format=S16le",
            SAMPLE_RATE
        );

        match capture_loop(&simple, &sender) {
            Ok(()) if sender.is_closed() => {
                log::info!("PulseAudio capture stopped because the audio pipeline closed");
                return;
            }
            Ok(()) => {}
            Err(error) => {
                log::error!("PulseAudio capture stopped: {error}");
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
}

fn capture_buffer_attr() -> BufferAttr {
    let packet_bytes = (SAMPLES_PER_PACKET * std::mem::size_of::<i16>()) as u32;
    // The server default can retain seconds of monitor audio.
    BufferAttr { maxlength: packet_bytes * 3, fragsize: packet_bytes, tlength: u32::MAX, prebuf: u32::MAX, minreq: u32::MAX }
}

fn capture_loop(simple: &Simple, sender: &mpsc::Sender<AudioFrame>) -> Result<(), String> {
    let mut buffer = vec![0u8; SAMPLES_PER_PACKET * std::mem::size_of::<i16>()];
    let mut frames_sent = 0_u64;
    loop {
        if sender.is_closed() { return Ok(()); }
        simple.read(&mut buffer).map_err(|error| format!("PulseAudio read error: {error:?}"))?;
        // Byte decoding avoids relying on the alignment of a Vec<u8>.
        let samples = buffer.chunks_exact(2)
            .map(|pair| i16::from_le_bytes([pair[0], pair[1]]) as f32 / 32768.0)
            .collect();
        let mut frame = AudioFrame::new(samples);
        if frames_sent % 50 == 0 {
            frame.capture_latency_us = simple.get_latency().ok().map(|latency| latency.0);
        }
        if sender.blocking_send(frame).is_err() { return Ok(()); }
        frames_sent += 1;
    }
}

fn find_monitor_source() -> String {
    if let Some(monitor) = try_default_sink_monitor() {
        return monitor;
    }

    if let Some(monitor) = try_list_monitor_sources() {
        return monitor;
    }

    log::warn!("No monitor source found. Trying to create a loopback...");
    if let Some(monitor) = try_create_loopback() {
        return monitor;
    }

    log::error!(
        "No monitor source found and loopback creation failed. \n\
         For system audio capture on Linux, one of these is required:\n\
         1. PipeWire (default on Ubuntu 22.04+, Fedora 34+, Arch)\n\
         2. PulseAudio\n\
         3. Manual loopback: pactl load-module module-loopback source=<sink>.monitor"
    );
    "eko-no-source".to_string()
}

fn try_default_sink_monitor() -> Option<String> {
    let output = Command::new("pactl")
        .args(["get-default-sink"])
        .output()
        .ok()
        .filter(|out| out.status.success())?;

    let sink = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if sink.is_empty() {
        return None;
    }

    let monitor = format!("{sink}.monitor");
    log::info!("Default sink: {sink} → monitor source: {monitor}");
    Some(monitor)
}

fn try_list_monitor_sources() -> Option<String> {
    log::warn!("pactl get-default-sink failed, trying pactl list sources short");
    let output = Command::new("pactl")
        .args(["list", "sources", "short"])
        .output()
        .ok()
        .filter(|out| out.status.success())?;

    let text = String::from_utf8_lossy(&output.stdout).to_string();
    for line in text.lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() >= 2 && cols[1].contains("monitor") {
            log::info!("Found monitor source via list: {}", cols[1]);
            return Some(cols[1].to_string());
        }
    }
    None
}

fn try_create_loopback() -> Option<String> {
    let default_sink_output = Command::new("pactl")
        .args(["get-default-sink"])
        .output()
        .ok()
        .filter(|out| out.status.success())?;

    let sink = String::from_utf8_lossy(&default_sink_output.stdout)
        .trim()
        .to_string();
    if sink.is_empty() {
        return None;
    }

    let load_output = Command::new("pactl")
        .args([
            "load-module",
            "module-loopback",
            &format!("source={sink}.monitor"),
        ])
        .output()
        .ok()
        .filter(|out| out.status.success())?;

    let module_id = String::from_utf8_lossy(&load_output.stdout)
        .trim()
        .to_string();
    log::info!("Created loopback module id={module_id} for source={sink}.monitor");

    let monitor = format!("{sink}.monitor");
    Some(monitor)
}

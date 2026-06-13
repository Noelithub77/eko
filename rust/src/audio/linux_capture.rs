use std::process::Command;
use std::thread;
use std::time::Duration;

use libpulse_binding::sample::{Format, Spec};
use libpulse_binding::stream::Direction;
use libpulse_simple_binding::Simple;
use tokio::sync::mpsc;

use super::frame::{AudioFrame, SAMPLES_PER_PACKET, SAMPLE_RATE};

pub fn start_system_audio_source(
    sender: mpsc::Sender<AudioFrame>,
) -> Result<thread::JoinHandle<()>, String> {
    let source_name = find_monitor_source();
    log::info!("Linux audio capture source: {}", source_name);

    let spec = Spec {
        format: Format::S16le,
        rate: SAMPLE_RATE as u32,
        channels: 2,
    };

    let simple = Simple::new(
        None,
        "eko",
        Direction::Record,
        Some(&source_name),
        "eko-system-audio",
        &spec,
        None,
        None,
    )
    .map_err(|e| format!("PulseAudio open failed for source '{source_name}': {e:?}"))?;

    log::info!(
        "PulseAudio capture started: source={source_name} rate={}Hz channels=2 format=S16le",
        SAMPLE_RATE
    );

    thread::Builder::new()
        .name("eko-linux-capture".to_string())
        .spawn(move || {
            capture_loop(simple, sender);
        })
        .map_err(|e| e.to_string())
}

fn capture_loop(simple: Simple, sender: mpsc::Sender<AudioFrame>) {
    let mut accum: Vec<f32> = Vec::with_capacity(SAMPLES_PER_PACKET * 4);
    let mut buffer = vec![0u8; SAMPLES_PER_PACKET * 2 * std::mem::size_of::<i16>() * 2];
    let mut frames_sent: u64 = 0;
    let mut max_sample: f32 = 0.0;

    loop {
        match simple.read(&mut buffer) {
            Ok(()) => {
                let raw: &[i16] = unsafe {
                    std::slice::from_raw_parts(
                        buffer.as_ptr() as *const i16,
                        buffer.len() / std::mem::size_of::<i16>(),
                    )
                };

                if frames_sent == 0 && !raw.is_empty() {
                    let max_raw = raw.iter().map(|s| s.unsigned_abs() as u32).max().unwrap_or(0);
                    log::info!(
                        "PulseAudio capture: first read samples={} max_u16={}",
                        raw.len(),
                        max_raw
                    );
                }

                for &s in raw {
                    let normalized = s as f32 / 32768.0_f32;
                    let abs = normalized.abs();
                    if abs > max_sample {
                        max_sample = abs;
                    }
                    accum.push(normalized);
                }

                while accum.len() >= SAMPLES_PER_PACKET {
                    let packet: Vec<f32> = accum.drain(..SAMPLES_PER_PACKET).collect();
                    let frame = AudioFrame::new(packet);
                    if sender.try_send(frame).is_ok() {
                        frames_sent += 1;
                    }
                    if frames_sent == 100 || frames_sent % 500 == 0 {
                        log::info!(
                            "PulseAudio capture: sent {} frames, max_sample_level={:.6}",
                            frames_sent,
                            max_sample
                        );
                    }
                }
            }
            Err(e) => {
                log::error!("PulseAudio read error: {e:?}");
                thread::sleep(Duration::from_millis(100));
            }
        }
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
    log::info!(
        "Created loopback module id={module_id} for source={sink}.monitor"
    );

    let monitor = format!("{sink}.monitor");
    Some(monitor)
}

pub fn find_monitor_device_name() -> Option<String> {
    Some(find_monitor_source())
}

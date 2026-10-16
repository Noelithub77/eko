use super::MediaHub;

#[test]
#[ignore = "Reads monitor audio and deliberately stalls its consumer; run with the latency operator"]
fn profile_native_capture_recovery() -> Result<(), String> {
    use crate::audio::frame::{AudioFrame, CAPTURE_QUEUE_FRAMES};
    use crate::audio::windows_capture::start_system_audio_source;
    use std::time::{Duration, Instant};
    let stall: u64 = std::env::var("EKO_BENCH_STALL_MS").map_err(|error| error.to_string())?
        .parse().map_err(|error: std::num::ParseIntError| error.to_string())?;
    if !(100..=2000).contains(&stall) { return Err("Stall must be 100..2000 ms.".into()); }
    let (sender, mut receiver) = tokio::sync::mpsc::channel::<AudioFrame>(CAPTURE_QUEUE_FRAMES);
    let capture = start_system_audio_source(sender)?;
    let result = tauri::async_runtime::block_on(async {
        for _ in 0..5 {
            tokio::time::timeout(Duration::from_secs(3), receiver.recv()).await
                .map_err(|_| "Capture warmup timed out.".to_string())?
                .ok_or_else(|| "Capture closed during warmup.".to_string())?;
        }
        tokio::time::sleep(Duration::from_millis(stall)).await;
        let started = Instant::now();
        let mut stale = 0;
        let mut maximum_age_ms = 0.0_f64;
        loop {
            let frame = tokio::time::timeout(Duration::from_secs(3), receiver.recv()).await
                .map_err(|_| "Capture recovery timed out.".to_string())?
                .ok_or_else(|| "Capture closed during recovery.".to_string())?;
            let age = frame.captured_at.elapsed().as_secs_f64() * 1000.0;
            maximum_age_ms = maximum_age_ms.max(age);
            if age <= 60.0 {
                return Ok(serde_json::json!({
                    "environment": "local-native-capture", "success": true,
                    "measurement": "Actual capture and bounded queue recovery after a stalled consumer. No Opus, network or physical output measurement.",
                    "stallMs": stall, "stalePacketsObserved": stale, "maximumSampleAgeMs": maximum_age_ms,
                    "firstFreshSampleAgeMs": age, "recoveryMs": started.elapsed().as_secs_f64() * 1000.0,
                }));
            }
            stale += 1;
            if started.elapsed() > Duration::from_secs(3) { return Err("Capture did not recover to live audio.".to_string()); }
        }
    });
    receiver.close();
    drop(receiver);
    capture.join().map_err(|_| "Capture thread failed.".to_string())?;
    let result = result?;
    println!("EKO_PIPELINE_RESULT={result}");
    Ok(())
}

#[test]
#[ignore = "Reads the system monitor for 3 seconds; run with pnpm ops latency pipeline"]
fn profile_native_audio_pipeline() -> Result<(), String> {
    let hub = MediaHub::start(None, None)?;
    std::thread::sleep(std::time::Duration::from_secs(3));
    let snapshot = tauri::async_runtime::block_on(hub.operator_status());
    let progressed = snapshot.audio_frames_encoded >= 50;
    let result = serde_json::json!({
        "environment": "local-native-capture",
        "success": progressed && snapshot.audio_write_errors == 0,
        "measurement": "Actual system monitor capture, queue, Opus encoding and track writes. No connected peer: write time excludes remote delivery and physical output.",
        "captureMeasurement": if cfg!(windows) { "Oldest sample age from the WASAPI QPC timestamp, including packet collection." } else { "Reported record queue remaining after a packet read." },
        "pipeline": snapshot,
    });
    println!("EKO_PIPELINE_RESULT={result}");
    if !progressed { return Err("Native capture/encoder did not progress.".into()); }
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum BenchCommand {
    Answer { description: crate::domain::SessionDescriptionMessage },
    Candidate { candidate: crate::domain::IceCandidateMessage },
    Stats,
    Stop,
}

// The fixture pipes SDP/ICE to its browser driver in memory; never log this pipe.
#[test]
#[ignore = "Driven by pnpm ops latency media --sender native"]
fn serve_native_benchmark_sender() -> Result<(), String> {
    use std::io::{BufRead, Write};
    let servers = std::env::var("EKO_BENCH_ICE_SERVERS").map_err(|error| error.to_string())?;
    let servers: Vec<webrtc::ice_transport::ice_server::RTCIceServer> = serde_json::from_str(&servers).map_err(|error| error.to_string())?;
    let device_id = std::env::var("EKO_BENCH_DEVICE_ID").map_err(|error| error.to_string())?;
    let hub = MediaHub::start(None, None)?;
    let (commands, mut receiver) = tokio::sync::mpsc::unbounded_channel();
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            let Ok(line) = line else { break };
            let command = serde_json::from_str::<BenchCommand>(&line);
            if commands.send(command).is_err() { break; }
        }
    });
    tauri::async_runtime::block_on(async {
        let offer = hub.create_sender_offer(device_id, &servers).await?;
        let mut signals = offer.signals;
        let emit = |event: serde_json::Value| -> Result<(), String> {
            println!("EKO_NATIVE_EVENT={event}");
            std::io::stdout().flush().map_err(|error| error.to_string())
        };
        emit(serde_json::json!({ "kind": "offer", "description": offer.description }))?;
        loop {
            tokio::select! {
                signal = signals.recv() => {
                    if let Some(super::MediaSignal::IceCandidate(candidate)) = signal {
                        emit(serde_json::json!({ "kind": "candidate", "candidate": candidate }))?;
                    }
                }
                command = receiver.recv() => {
                    match command {
                        Some(Ok(BenchCommand::Answer { description })) => hub.accept_answer(description).await?,
                        Some(Ok(BenchCommand::Candidate { candidate })) => hub.add_ice_candidate(candidate).await?,
                        Some(Ok(BenchCommand::Stats)) => emit(serde_json::json!({ "kind": "stats", "status": hub.operator_status().await }))?,
                        Some(Ok(BenchCommand::Stop)) | None => break,
                        Some(Err(error)) => return Err(error.to_string()),
                    }
                }
            }
        }
        hub.stop().await;
        Ok(())
    })
}

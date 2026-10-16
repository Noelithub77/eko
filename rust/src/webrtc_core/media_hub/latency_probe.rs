use super::MediaHub;

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

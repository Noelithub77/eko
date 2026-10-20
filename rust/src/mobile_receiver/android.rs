use std::sync::Arc;
use std::time::{Duration, Instant};

use opus::{Channels, Decoder};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;

use super::local_candidate_queue::LocalCandidateQueue;
use super::playback::NativeAudioPlayer;
use super::quality::AndroidProfiler;
use super::signaling_transport::connect_signaling;
use crate::domain::{
    DeviceConnectionState, IceCandidateMessage, JoinRequest, NativeReceiverEvent,
    QrPairingPayload, SessionDescriptionMessage, SignalClientMessage, SignalServerMessage,
};
use crate::webrtc_core::candidate_path::log_selected_candidate;

const EVENT_NAME: &str = "native-receiver-event";
const DECODED_SAMPLES: usize = 960 * 2;
const DIRECT_CONNECTION_ERROR: &str = "Couldn’t make a direct connection. This network may block peer-to-peer connections. Try another Wi-Fi network or a phone hotspot.";

pub async fn run_receiver(app: AppHandle, payload: QrPairingPayload, mut request: JoinRequest,
    mut name_updates: mpsc::UnboundedReceiver<String>) {
    let retry_delays = [0_u64, 1, 2, 4, 8];
    let mut final_error = None;
    for delay in retry_delays {
        if delay > 0 {
            emit(
                &app,
                NativeReceiverEvent::Connecting {
                    message: "Reconnecting signaling.".to_string(),
                },
            );
            tokio::time::sleep(Duration::from_secs(delay)).await;
        }
        match run_receiver_inner(app.clone(), payload.clone(), &mut request, &mut name_updates).await {
            Ok(()) => return,
            Err(message) => {
                final_error = Some(message);
            }
        }
    }
    emit(
        &app,
        NativeReceiverEvent::Error {
            message: final_error.unwrap_or_else(|| "Receiver connection ended.".to_string()),
        },
    );
}

async fn run_receiver_inner(
    app: AppHandle,
    payload: QrPairingPayload,
    request: &mut JoinRequest,
    name_updates: &mut mpsc::UnboundedReceiver<String>,
) -> Result<(), String> {
    let (mut writer, mut reader) = connect_signaling(&payload, &request.device_id)
        .await
        .map_err(|error| {
            log::warn!("Receiver could not open signaling: {error}");
            "Could not reach desktop through LAN or hosted pairing.".to_string()
        })?;
    let (sender, mut outgoing) = mpsc::unbounded_channel::<SignalClientMessage>();
    let device_id = request.device_id.clone();
    let candidate_queue = Arc::new(LocalCandidateQueue::default());
    let peer = create_peer(
        app.clone(),
        device_id.clone(),
        sender.clone(),
        Arc::clone(&candidate_queue),
    )
    .await?;

    sender
        .send(SignalClientMessage::JoinRequest { request: request.clone() })
        .map_err(|error| error.to_string())?;

    let writer_task = tauri::async_runtime::spawn(async move {
        while let Some(message) = outgoing.recv().await {
            if writer.send(&message).await.is_err() {
                break;
            }
        }
    });

    let _connection = ReceiverConnection { peer: Arc::clone(&peer), writer_task };
    loop {
        tokio::select! {
            result = reader.next() => {
                let Some(message) = result? else { break; };
                handle_server_message(&app, &peer, &sender, &candidate_queue, &device_id, message).await?;
            }
            Some(name) = name_updates.recv() => {
                sender.send(SignalClientMessage::UpdateReceiverName {
                    device_id: device_id.clone(), name: name.clone(),
                }).map_err(|error| error.to_string())?;
                request.device_name = name;
            }
        }
    }

    emit(
        &app,
        NativeReceiverEvent::Closed {
            message: "Receiver disconnected.".to_string(),
        },
    );
    Err("Signaling connection closed.".to_string())
}

struct ReceiverConnection {
    peer: Arc<RTCPeerConnection>,
    writer_task: tauri::async_runtime::JoinHandle<()>,
}

impl Drop for ReceiverConnection {
    fn drop(&mut self) {
        self.writer_task.abort();
        let peer = Arc::clone(&self.peer);
        tauri::async_runtime::spawn(async move { let _ = peer.close().await; });
    }
}

async fn create_peer(
    app: AppHandle,
    device_id: String,
    sender: mpsc::UnboundedSender<SignalClientMessage>,
    candidate_queue: Arc<LocalCandidateQueue>,
) -> Result<Arc<RTCPeerConnection>, String> {
    let mut media_engine = MediaEngine::default();
    media_engine
        .register_default_codecs()
        .map_err(|error| error.to_string())?;

    let peer = Arc::new(
        APIBuilder::new()
            .with_media_engine(media_engine)
            .build()
            .new_peer_connection(direct_ice_configuration())
            .await
            .map_err(|error| error.to_string())?,
    );

    let ice_sender = sender.clone();
    let ice_device_id = device_id.clone();
    peer.on_ice_candidate(Box::new(move |candidate| {
        let sender = ice_sender.clone();
        let device_id = ice_device_id.clone();
        let candidate_queue = Arc::clone(&candidate_queue);
        Box::pin(async move {
            let Some(candidate) = candidate else {
                return;
            };
            if let Ok(candidate) = candidate.to_json() {
                candidate_queue
                    .send_or_queue(
                        &sender,
                        IceCandidateMessage {
                            device_id,
                            candidate: serde_json::to_string(&candidate).unwrap_or_default(),
                        },
                    )
                    .await;
            }
        })
    }));

    let ice_app = app.clone();
    let stats_peer = Arc::clone(&peer);
    peer.on_ice_connection_state_change(Box::new(move |state| {
        let app = ice_app.clone();
        let stats_peer = Arc::clone(&stats_peer);
        Box::pin(async move {
            match state {
                RTCIceConnectionState::Connected => {
                    log_selected_candidate(&stats_peer, "android-receiver").await;
                }
                RTCIceConnectionState::Failed => {
                    emit(
                        &app,
                        NativeReceiverEvent::Error {
                            message: DIRECT_CONNECTION_ERROR.to_string(),
                        },
                    );
                }
                _ => {}
            }
        })
    }));

    let ready_sender = sender.clone();
    let ready_device_id = device_id.clone();
    let track_peer = Arc::downgrade(&peer);
    peer.on_track(Box::new(move |track, _, _| {
        let app = app.clone();
        let ready_sender = ready_sender.clone();
        let device_id = ready_device_id.clone();
        let peer = track_peer.clone();
        Box::pin(async move {
            let _ = ready_sender.send(SignalClientMessage::ReceiverReady {
                device_id: device_id.clone(),
            });
            emit(
                &app,
                NativeReceiverEvent::Connected {
                    message: "Native audio connected.".to_string(),
                },
            );
            play_track(app, track, ready_sender, device_id, peer).await;
        })
    }));

    Ok(peer)
}

async fn play_track(
    app: AppHandle,
    track: Arc<webrtc::track::track_remote::TrackRemote>,
    sender: mpsc::UnboundedSender<SignalClientMessage>,
    device_id: String,
    peer: std::sync::Weak<RTCPeerConnection>,
) {
    let Ok(player) = NativeAudioPlayer::start(app.clone()) else {
        emit(
            &app,
            NativeReceiverEvent::Error {
                message: "Could not start Android audio output.".to_string(),
            },
        );
        return;
    };
    let mut decoder = match Decoder::new(48_000, Channels::Stereo) {
        Ok(decoder) => decoder,
        Err(error) => {
            emit(
                &app,
                NativeReceiverEvent::Error {
                    message: error.to_string(),
                },
            );
            return;
        }
    };
    let mut decoded = vec![0.0_f32; DECODED_SAMPLES];
    let mut profiler = AndroidProfiler::new(device_id);
    let mut last_waveform = Instant::now();
    while let Ok((packet, _)) = track.read_rtp().await {
        profiler.record_packet(packet.header.sequence_number, packet.header.timestamp);
        if let Ok(frames) = decoder.decode_float(&packet.payload, &mut decoded, false) {
            let used_samples = frames * 2;
            let samples = &decoded[..used_samples.min(decoded.len())];
            player.push_samples(samples);
            if last_waveform.elapsed() >= Duration::from_millis(100) {
                last_waveform = Instant::now();
                let levels = if super::playback::is_paused() { vec![0.0; 48] }
                    else { super::waveform::frequency_levels(samples) };
                emit(&app, NativeReceiverEvent::Waveform { levels });
            }
        }
        if let Some(mut sample) = profiler.next_sample(player.buffer_ms()) {
            if let Some(peer) = peer.upgrade() {
                sample.round_trip_ms = crate::webrtc_core::candidate_path::round_trip_ms(&peer).await;
                sample.latency_ms = sample.buffer_ms.zip(sample.round_trip_ms).map(|(buffer, rtt)| buffer + rtt / 2.0);
            }
            emit(&app, NativeReceiverEvent::Quality { sample: sample.clone() });
            let _ = sender.send(SignalClientMessage::ProfilerSample { sample });
        }
    }
    player.stop();
}

fn direct_ice_configuration() -> RTCConfiguration {
    RTCConfiguration {
        ice_servers: vec![RTCIceServer {
            urls: vec![
                "stun:stun.cloudflare.com:3478".to_string(),
                "stun:stun.cloudflare.com:53".to_string(),
            ],
            ..Default::default()
        }],
        ..Default::default()
    }
}

async fn handle_server_message(
    app: &AppHandle,
    peer: &Arc<RTCPeerConnection>,
    sender: &mpsc::UnboundedSender<SignalClientMessage>,
    candidate_queue: &Arc<LocalCandidateQueue>,
    device_id: &str,
    message: SignalServerMessage,
) -> Result<(), String> {
    match message {
        SignalServerMessage::ApprovalWaiting { .. } => emit(
            app,
            NativeReceiverEvent::Waiting {
                message: "Waiting for desktop approval.".to_string(),
            },
        ),
        SignalServerMessage::JoinRejected { reason } => {
            emit(app, NativeReceiverEvent::Denied { message: reason })
        }
        SignalServerMessage::PermissionChanged { state, .. } => {
            if state == DeviceConnectionState::Denied {
                emit(
                    app,
                    NativeReceiverEvent::Denied {
                        message: "Desktop denied this device.".to_string(),
                    },
                );
            } else if state == DeviceConnectionState::Connecting {
                emit(
                    app,
                    NativeReceiverEvent::Connecting {
                        message: "Connecting native audio.".to_string(),
                    },
                );
            } else if state == DeviceConnectionState::Disconnected {
                let _ = peer.close().await;
                emit(
                    app,
                    NativeReceiverEvent::Closed {
                        message: "Desktop disconnected this device.".to_string(),
                    },
                );
                return Err("Desktop disconnected this device.".to_string());
            }
        }
        SignalServerMessage::HostOffer { description } => {
            answer_offer(peer, sender, candidate_queue, device_id, description).await?;
        }
        SignalServerMessage::HostIceCandidate { candidate } => {
            add_host_candidate(peer, candidate).await?;
        }
        SignalServerMessage::Error { message } => {
            emit(app, NativeReceiverEvent::Error { message });
        }
        _ => {}
    }
    Ok(())
}

async fn answer_offer(
    peer: &Arc<RTCPeerConnection>,
    sender: &mpsc::UnboundedSender<SignalClientMessage>,
    candidate_queue: &Arc<LocalCandidateQueue>,
    device_id: &str,
    description: SessionDescriptionMessage,
) -> Result<(), String> {
    let offer =
        RTCSessionDescription::offer(description.sdp).map_err(|error| error.to_string())?;
    peer.set_remote_description(offer)
        .await
        .map_err(|error| error.to_string())?;
    let answer = peer
        .create_answer(None)
        .await
        .map_err(|error| error.to_string())?;
    peer.set_local_description(answer.clone())
        .await
        .map_err(|error| error.to_string())?;
    sender
        .send(SignalClientMessage::Answer {
            description: SessionDescriptionMessage {
                device_id: device_id.to_string(),
                sdp: answer.sdp,
            },
        })
        .map_err(|error| error.to_string())?;
    candidate_queue.flush_after_answer(sender).await;
    Ok(())
}

async fn add_host_candidate(
    peer: &Arc<RTCPeerConnection>,
    candidate: IceCandidateMessage,
) -> Result<(), String> {
    let candidate = serde_json::from_str::<RTCIceCandidateInit>(&candidate.candidate)
        .map_err(|error| error.to_string())?;
    peer.add_ice_candidate(candidate)
        .await
        .map_err(|error| error.to_string())
}

fn emit(app: &AppHandle, event: NativeReceiverEvent) {
    let _ = app.emit(EVENT_NAME, event);
}

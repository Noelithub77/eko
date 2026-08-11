use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::SinkExt;
use serde::Serialize;
use specta::Type;
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

use crate::domain::{
    DeviceConnectionState, JoinRequest, SharingState, SignalClientMessage, SignalServerMessage,
};
use crate::session::SessionStore;
use crate::webrtc_core::media_hub::{MediaSignal, SharedMediaHub};

pub mod hosted_client;
pub use hosted_client::HostedSignaling;
mod local_server;
pub use local_server::SignalingServer;

pub type SharedSession = Arc<Mutex<SessionStore>>;
pub const ROOM_SESSION_EVENT: &str = "room-session-updated";
pub const PAIRING_PORT: u16 = 13370;

const LOG_DEDUP_WINDOW_MS: u64 = 5_000;
const PLAYBACK_JITTER_BUFFER_TARGET_MS: u16 = 60;
const PLAYBACK_SCHEDULE_LEAD_MS: f64 = 250.0;
const PLAYBACK_SCHEDULE_QUANTUM_MS: f64 = 500.0;

fn log_dedup(key: &str) -> bool {
    use std::sync::OnceLock;
    static LAST_LOGS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    let map = LAST_LOGS.get_or_init(|| Mutex::new(HashMap::new()));
    let Ok(mut guard) = map.lock() else {
        return true;
    };
    let now = Instant::now();
    let window = Duration::from_millis(LOG_DEDUP_WINDOW_MS);
    let should_log = guard
        .get(key)
        .map(|t| now.duration_since(*t) > window)
        .unwrap_or(true);
    if should_log {
        guard.insert(key.to_string(), now);
    }
    should_log
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SignalingProofStatus {
    pub transport: String,
    pub library_ready: bool,
    pub note: String,
}

pub fn proof_status() -> SignalingProofStatus {
    SignalingProofStatus {
        transport: "WebSocket".to_string(),
        library_ready: true,
        note: "tokio-tungstenite runs the LAN approval and WebRTC signaling server.".to_string(),
    }
}

fn push_session_event(session: &SharedSession, app: &tauri::AppHandle, level: &str, message: &str) {
    if let Ok(mut store) = session.lock() {
        let session = store.push_event(level, message);
        emit_room_session(app, session);
    }
}

async fn handle_client_message(
    message: Message,
    socket: &mut tokio_tungstenite::WebSocketStream<TcpStream>,
    session: &SharedSession,
    media: &SharedMediaHub,
    app: &tauri::AppHandle,
    device_id: &mut Option<String>,
) -> bool {
    let Ok(text) = message.into_text() else {
        return true;
    };
    let parsed = serde_json::from_str::<SignalClientMessage>(&text);

    match parsed {
        Ok(SignalClientMessage::JoinRequest { request }) => {
            log::info!(
                "Signaling JoinRequest from device={} name={}",
                request.device_id,
                request.device_name
            );
            let response = join_response(session, app, request);
            if let SignalServerMessage::ApprovalWaiting {
                device_id: joined_device_id,
                ..
            } = &response
            {
                *device_id = Some(joined_device_id.clone());
                log::info!(
                    "Signaling JoinRequest approved, device={}",
                    joined_device_id
                );
            }
            if let SignalServerMessage::JoinRejected { reason } = &response {
                log::warn!("Signaling JoinRequest rejected: {reason}");
            }
            send_json(socket, &response).await.is_ok()
        }
        Ok(SignalClientMessage::ReceiverReady { device_id }) => {
            log::info!("Signaling ReceiverReady from {}", device_id);
            let response = receiver_ready_response(session, app, device_id);
            send_json(socket, &response).await.is_ok()
        }
        Ok(SignalClientMessage::Answer { description }) => {
            log::info!(
                "Signaling Answer from {} (sdp len={})",
                description.device_id,
                description.sdp.len()
            );
            match media.accept_answer(description).await {
                Ok(()) => {
                    push_session_event(session, app, "info", "WebRTC answer accepted");
                    if send_signal_ack(socket).await.is_err() {
                        return false;
                    }
                    send_json(
                        socket,
                        &SignalServerMessage::PlaybackSchedule {
                            play_at_server_ms: next_playback_start_ms(),
                            jitter_buffer_target_ms: PLAYBACK_JITTER_BUFFER_TARGET_MS,
                        },
                    )
                    .await
                    .is_ok()
                }
                Err(message) => {
                    log::warn!("Signaling accept_answer failed: {message}");
                    push_session_event(
                        session,
                        app,
                        "warn",
                        &format!("WebRTC answer failed: {message}"),
                    );
                    send_json(socket, &SignalServerMessage::Error { message })
                        .await
                        .is_ok()
                }
            }
        }
        Ok(SignalClientMessage::IceCandidate { candidate }) => {
            log::info!("Signaling ICE candidate from {}", candidate.device_id);
            match media.add_ice_candidate(candidate).await {
                Ok(()) => send_signal_ack(socket).await.is_ok(),
                Err(message) => {
                    log::warn!("Signaling add_ice_candidate failed: {message}");
                    push_session_event(
                        session,
                        app,
                        "warn",
                        &format!("ICE candidate failed: {message}"),
                    );
                    send_json(socket, &SignalServerMessage::Error { message })
                        .await
                        .is_ok()
                }
            }
        }
        Ok(SignalClientMessage::ClockSyncRequest {
            request_id,
            client_sent_at_ms,
        }) => {
            let server_received_at_ms = unix_time_ms();
            let response = SignalServerMessage::ClockSyncResponse {
                request_id,
                client_sent_at_ms,
                server_received_at_ms,
                server_sent_at_ms: unix_time_ms(),
            };
            send_json(socket, &response).await.is_ok()
        }
        Ok(SignalClientMessage::UpdateReceiverName {
            device_id: requested_device_id,
            name,
        }) => {
            let Some(connected_device_id) = device_id.as_deref() else {
                return send_json(
                    socket,
                    &SignalServerMessage::Error {
                        message: "Receiver must join before updating its name.".to_string(),
                    },
                )
                .await
                .is_ok();
            };
            if connected_device_id != requested_device_id.as_str() {
                return send_json(
                    socket,
                    &SignalServerMessage::Error {
                        message: "Receiver name update does not match this connection.".to_string(),
                    },
                )
                .await
                .is_ok();
            }
            log::info!(
                "Signaling UpdateReceiverName from {} -> {}",
                connected_device_id,
                name
            );
            let session_snapshot = {
                let Ok(mut store) = session.lock() else {
                    return false;
                };
                store.update_device_name(connected_device_id.to_string(), name)
            };
            emit_room_session(app, session_snapshot);
            send_signal_ack(socket).await.is_ok()
        }
        Ok(SignalClientMessage::ProfilerSample { sample }) => {
            if let Err(error) = crate::profiler::append_typed_sample(sample) {
                log::warn!("Live profiler sample ignored: {error}");
            }
            true
        }
        Ok(SignalClientMessage::Offer { .. }) => send_json(
            socket,
            &SignalServerMessage::Error {
                message: "Receivers should answer the host offer.".to_string(),
            },
        )
        .await
        .is_ok(),
        Err(error) => send_json(
            socket,
            &SignalServerMessage::Error {
                message: format!("Invalid signal message: {error}"),
            },
        )
        .await
        .is_ok(),
    }
}

fn join_response(
    session: &SharedSession,
    app: &tauri::AppHandle,
    request: JoinRequest,
) -> SignalServerMessage {
    let store_result = session.lock().map_err(|error| error.to_string());
    let mut store = match store_result {
        Ok(store) => store,
        Err(message) => return SignalServerMessage::Error { message },
    };

    match store.submit_join_request(request.clone()) {
        Ok(session) => {
            emit_room_session(app, session.clone());
            SignalServerMessage::ApprovalWaiting {
                device_id: request.device_id,
                session,
            }
        }
        Err(reason) => SignalServerMessage::JoinRejected { reason },
    }
}

fn receiver_ready_response(
    session: &SharedSession,
    app: &tauri::AppHandle,
    device_id: String,
) -> SignalServerMessage {
    let store_result = session.lock().map_err(|error| error.to_string());
    let mut store = match store_result {
        Ok(store) => store,
        Err(message) => return SignalServerMessage::Error { message },
    };
    let session = store.mark_device_connected(device_id.clone());
    emit_room_session(app, session.clone());

    SignalServerMessage::PermissionChanged {
        device_id,
        state: DeviceConnectionState::Connected,
        sharing: SharingState::Enabled,
        session,
    }
}

pub fn emit_room_session(app: &tauri::AppHandle, session: crate::domain::RoomSession) {
    use tauri::Emitter;

    if let Err(error) = app.emit(ROOM_SESSION_EVENT, session) {
        log::warn!("Room session event failed: {error}");
    }
}

async fn send_permission_update(
    device_id: &str,
    session: &SharedSession,
    media: &SharedMediaHub,
    socket: &mut tokio_tungstenite::WebSocketStream<TcpStream>,
    last_state: &mut Option<DeviceConnectionState>,
) -> Result<Option<mpsc::UnboundedReceiver<MediaSignal>>, String> {
    let update = {
        let store = session.lock().map_err(|error| error.to_string())?;
        let Some((state, sharing)) = store.device_state(device_id) else {
            return Ok(None);
        };
        if last_state.as_ref() == Some(&state) {
            return Ok(None);
        }
        log::info!(
            "Signaling device {} state changed to {:?}",
            device_id,
            state
        );
        *last_state = Some(state.clone());
        SignalServerMessage::PermissionChanged {
            device_id: device_id.to_string(),
            state,
            sharing,
            session: store.snapshot(),
        }
    };

    send_json(socket, &update).await?;
    if matches!(
        update,
        SignalServerMessage::PermissionChanged {
            state: DeviceConnectionState::Connecting,
            ..
        }
    ) {
        let offer = media.create_sender_offer(device_id.to_string()).await?;
        send_json(
            socket,
            &SignalServerMessage::WebRtcReady {
                device_id: device_id.to_string(),
            },
        )
        .await?;
        send_json(
            socket,
            &SignalServerMessage::HostOffer {
                description: offer.description,
            },
        )
        .await?;
        send_json(
            socket,
            &SignalServerMessage::AudioReady {
                device_id: device_id.to_string(),
            },
        )
        .await?;
        return Ok(Some(offer.signals));
    }

    Ok(None)
}

async fn forward_media_signals(
    socket: &mut tokio_tungstenite::WebSocketStream<TcpStream>,
    signals: &mut Option<mpsc::UnboundedReceiver<MediaSignal>>,
) -> Result<(), String> {
    let Some(signals) = signals else {
        return Ok(());
    };

    while let Ok(signal) = signals.try_recv() {
        match signal {
            MediaSignal::IceCandidate(candidate) => {
                send_json(socket, &SignalServerMessage::HostIceCandidate { candidate }).await?;
            }
        }
    }

    Ok(())
}

fn next_playback_start_ms() -> f64 {
    let earliest = unix_time_ms() + PLAYBACK_SCHEDULE_LEAD_MS;
    (earliest / PLAYBACK_SCHEDULE_QUANTUM_MS).ceil() * PLAYBACK_SCHEDULE_QUANTUM_MS
}

fn unix_time_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64() * 1_000.0)
        .unwrap_or(0.0)
}

async fn send_signal_ack(
    socket: &mut tokio_tungstenite::WebSocketStream<TcpStream>,
) -> Result<(), String> {
    send_json(
        socket,
        &SignalServerMessage::SignalAck {
            message: "Signal received".to_string(),
        },
    )
    .await
}

async fn send_json(
    socket: &mut tokio_tungstenite::WebSocketStream<TcpStream>,
    message: &SignalServerMessage,
) -> Result<(), String> {
    let json = serde_json::to_string(message).map_err(|error| error.to_string())?;
    socket
        .send(Message::Text(json.into()))
        .await
        .map_err(|error| error.to_string())
}

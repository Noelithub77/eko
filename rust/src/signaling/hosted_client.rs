use std::collections::HashMap;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

use crate::domain::{
    DeviceConnectionState, HostedPairingDetails, SignalClientMessage, SignalServerMessage,
};
use crate::webrtc_core::media_hub::{MediaSignal, SharedMediaHub};

use super::{
    emit_room_session, next_playback_start_ms, receiver_ready_response, unix_time_ms,
    SharedSession, PLAYBACK_JITTER_BUFFER_TARGET_MS,
};

const DEFAULT_RELAY_URL: &str = "https://eko.noelmcv7.workers.dev";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostedRoomResponse {
    room_id: String,
    host_token: String,
    join_token: String,
    socket_url: String,
    client_url: String,
}

#[derive(Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum RelayHostMessage<'a> {
    Hello {
        role: &'static str,
        token: &'a str,
    },
    Signal {
        device_id: &'a str,
        payload: &'a SignalServerMessage,
    },
    CloseRoom,
}

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum RelayServerMessage {
    Ready {
        role: String,
    },
    Signal {
        device_id: String,
        payload: Box<SignalClientMessage>,
    },
    PeerLeft {
        device_id: String,
    },
    HostConnected,
    HostReconnecting,
    RoomClosed,
    Error {
        message: String,
    },
}

struct ReceiverState {
    last_state: Option<DeviceConnectionState>,
    media_signals: Option<mpsc::UnboundedReceiver<MediaSignal>>,
}

pub struct HostedSignaling {
    room: HostedRoomResponse,
    shutdown: Option<oneshot::Sender<()>>,
    _task: tauri::async_runtime::JoinHandle<()>,
}

impl HostedSignaling {
    pub async fn create() -> Result<(HostedPairingDetails, HostedRoomResponse), String> {
        let relay_url = std::env::var("EKO_RELAY_URL")
            .unwrap_or_else(|_| DEFAULT_RELAY_URL.to_string())
            .trim_end_matches('/')
            .to_string();
        let room = reqwest::Client::new()
            .post(format!("{relay_url}/v1/rooms"))
            .timeout(Duration::from_secs(8))
            .json(&serde_json::json!({}))
            .send()
            .await
            .map_err(|error| format!("Hosted pairing is unavailable: {error}"))?
            .error_for_status()
            .map_err(|error| format!("Hosted pairing was rejected: {error}"))?
            .json::<HostedRoomResponse>()
            .await
            .map_err(|error| format!("Hosted pairing returned invalid data: {error}"))?;
        let details = HostedPairingDetails {
            room_id: room.room_id.clone(),
            join_token: room.join_token.clone(),
            socket_url: room.socket_url.clone(),
            client_url: room.client_url.clone(),
        };
        Ok((details, room))
    }

    pub fn start(
        room: HostedRoomResponse,
        session: SharedSession,
        media: SharedMediaHub,
        app: tauri::AppHandle,
    ) -> Self {
        let task_room = room.clone();
        let (shutdown, shutdown_receiver) = oneshot::channel();
        let task = tauri::async_runtime::spawn(async move {
            run_with_reconnect(task_room, session, media, app, shutdown_receiver).await;
        });
        Self {
            room,
            shutdown: Some(shutdown),
            _task: task,
        }
    }

    pub fn stop(&mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
    }
}

impl Drop for HostedSignaling {
    fn drop(&mut self) {
        self.stop();
        log::info!("Hosted signaling stopped for room {}", self.room.room_id);
    }
}

async fn run_with_reconnect(
    room: HostedRoomResponse,
    session: SharedSession,
    media: SharedMediaHub,
    app: tauri::AppHandle,
    mut shutdown: oneshot::Receiver<()>,
) {
    let mut retry_seconds = 1;
    loop {
        let connection = run_connection(&room, &session, &media, &app, &mut shutdown).await;
        match connection {
            ConnectionEnd::Stopped => return,
            ConnectionEnd::RoomClosed => return,
            ConnectionEnd::Retry(message) => {
                log::warn!("Hosted signaling disconnected: {message}");
                tokio::select! {
                    _ = &mut shutdown => return,
                    _ = tokio::time::sleep(Duration::from_secs(retry_seconds)) => {}
                }
                retry_seconds = (retry_seconds * 2).min(8);
            }
        }
    }
}

enum ConnectionEnd {
    Stopped,
    RoomClosed,
    Retry(String),
}

async fn run_connection(
    room: &HostedRoomResponse,
    session: &SharedSession,
    media: &SharedMediaHub,
    app: &tauri::AppHandle,
    shutdown: &mut oneshot::Receiver<()>,
) -> ConnectionEnd {
    let connection = tokio_tungstenite::connect_async(&room.socket_url).await;
    let (socket, _) = match connection {
        Ok(result) => result,
        Err(error) => return ConnectionEnd::Retry(error.to_string()),
    };
    let (mut writer, mut reader) = socket.split();
    if send_relay(
        &mut writer,
        &RelayHostMessage::Hello {
            role: "host",
            token: &room.host_token,
        },
    )
    .await
    .is_err()
    {
        return ConnectionEnd::Retry("Could not authenticate hosted desktop".to_string());
    }

    let mut receivers: HashMap<String, ReceiverState> = HashMap::new();
    let mut approval_tick = tokio::time::interval(Duration::from_millis(400));
    loop {
        tokio::select! {
            _ = &mut *shutdown => {
                let _ = send_relay(&mut writer, &RelayHostMessage::CloseRoom).await;
                return ConnectionEnd::Stopped;
            }
            _ = approval_tick.tick() => {
                if let Err(error) = send_receiver_updates(&mut writer, &mut receivers, session, media).await {
                    return ConnectionEnd::Retry(error);
                }
            }
            message = reader.next() => {
                let Some(message) = message else {
                    return ConnectionEnd::Retry("Hosted socket closed".to_string());
                };
                let text = match message {
                    Ok(Message::Text(text)) => text,
                    Ok(Message::Close(_)) => return ConnectionEnd::Retry("Hosted socket closed".to_string()),
                    Ok(_) => continue,
                    Err(error) => return ConnectionEnd::Retry(error.to_string()),
                };
                let relay = match serde_json::from_str::<RelayServerMessage>(&text) {
                    Ok(message) => message,
                    Err(error) => return ConnectionEnd::Retry(error.to_string()),
                };
                match relay {
                    RelayServerMessage::Ready { role } => log::info!("Hosted signaling authenticated as {role}"),
                    RelayServerMessage::Signal { device_id, payload } => {
                        receivers.entry(device_id.clone()).or_insert(ReceiverState {
                            last_state: None,
                            media_signals: None,
                        });
                        if let Err(error) = handle_receiver_message(
                            &mut writer,
                            &mut receivers,
                            device_id,
                            *payload,
                            session,
                            media,
                            app,
                        ).await {
                            log::warn!("Hosted receiver message failed: {error}");
                        }
                    }
                    RelayServerMessage::PeerLeft { device_id } => {
                        receivers.remove(&device_id);
                        media.close_peer(&device_id).await;
                        if let Ok(mut store) = session.lock() {
                            emit_room_session(app, store.disconnect_device(device_id));
                        }
                    }
                    RelayServerMessage::RoomClosed => return ConnectionEnd::RoomClosed,
                    RelayServerMessage::Error { message } => log::warn!("Hosted relay error: {message}"),
                    RelayServerMessage::HostConnected | RelayServerMessage::HostReconnecting => {}
                }
            }
        }
    }
}

async fn handle_receiver_message<S>(
    writer: &mut S,
    receivers: &mut HashMap<String, ReceiverState>,
    device_id: String,
    message: SignalClientMessage,
    session: &SharedSession,
    media: &SharedMediaHub,
    app: &tauri::AppHandle,
) -> Result<(), String>
where
    S: futures_util::Sink<Message> + Unpin,
    S::Error: std::fmt::Display,
{
    let response = match message {
        SignalClientMessage::JoinRequest { mut request } => {
            request.device_id = device_id.clone();
            super::join_response(session, app, request)
        }
        SignalClientMessage::ReceiverReady { .. } => {
            receiver_ready_response(session, app, device_id.clone())
        }
        SignalClientMessage::Answer { mut description } => {
            description.device_id = device_id.clone();
            media.accept_answer(description).await?;
            SignalServerMessage::PlaybackSchedule {
                play_at_server_ms: next_playback_start_ms(),
                jitter_buffer_target_ms: PLAYBACK_JITTER_BUFFER_TARGET_MS,
            }
        }
        SignalClientMessage::IceCandidate { mut candidate } => {
            candidate.device_id = device_id.clone();
            media.add_ice_candidate(candidate).await?;
            SignalServerMessage::SignalAck {
                message: "Signal received".to_string(),
            }
        }
        SignalClientMessage::ClockSyncRequest {
            request_id,
            client_sent_at_ms,
        } => SignalServerMessage::ClockSyncResponse {
            request_id,
            client_sent_at_ms,
            server_received_at_ms: unix_time_ms(),
            server_sent_at_ms: unix_time_ms(),
        },
        SignalClientMessage::UpdateReceiverName { name, .. } => {
            if let Ok(mut store) = session.lock() {
                emit_room_session(app, store.update_device_name(device_id.clone(), name));
            }
            SignalServerMessage::SignalAck {
                message: "Receiver updated".to_string(),
            }
        }
        SignalClientMessage::ProfilerSample { sample } => {
            crate::profiler::append_typed_sample(sample)?;
            SignalServerMessage::SignalAck {
                message: "Profiler sample received".to_string(),
            }
        }
        SignalClientMessage::Offer { .. } => SignalServerMessage::Error {
            message: "Receivers should answer the host offer.".to_string(),
        },
    };
    if let Some(state) = receivers.get_mut(&device_id) {
        if matches!(response, SignalServerMessage::PermissionChanged { .. }) {
            state.last_state = None;
        }
    }
    send_signal(writer, &device_id, &response).await
}

async fn send_receiver_updates<S>(
    writer: &mut S,
    receivers: &mut HashMap<String, ReceiverState>,
    session: &SharedSession,
    media: &SharedMediaHub,
) -> Result<(), String>
where
    S: futures_util::Sink<Message> + Unpin,
    S::Error: std::fmt::Display,
{
    let device_ids: Vec<String> = receivers.keys().cloned().collect();
    for device_id in device_ids {
        let Some(state) = receivers.get_mut(&device_id) else {
            continue;
        };
        let current = session
            .lock()
            .map_err(|error| error.to_string())?
            .device_state(&device_id);
        if let Some(device_state) = current {
            if state.last_state.as_ref() != Some(&device_state) {
                state.last_state = Some(device_state.clone());
                let snapshot = session
                    .lock()
                    .map_err(|error| error.to_string())?
                    .snapshot();
                send_signal(
                    writer,
                    &device_id,
                    &SignalServerMessage::PermissionChanged {
                        device_id: device_id.clone(),
                        state: device_state.clone(),
                        session: snapshot,
                    },
                )
                .await?;
                if device_state == DeviceConnectionState::Connecting {
                    let offer = media.create_sender_offer(device_id.clone()).await?;
                    send_signal(
                        writer,
                        &device_id,
                        &SignalServerMessage::HostOffer {
                            description: offer.description,
                        },
                    )
                    .await?;
                    state.media_signals = Some(offer.signals);
                }
            }
        } else {
            if state.last_state.as_ref() == Some(&DeviceConnectionState::Disconnected) {
                continue;
            }
            state.last_state = Some(DeviceConnectionState::Disconnected);
            let snapshot = session
                .lock()
                .map_err(|error| error.to_string())?
                .snapshot();
            send_signal(
                writer,
                &device_id,
                &SignalServerMessage::PermissionChanged {
                    device_id: device_id.clone(),
                    state: DeviceConnectionState::Disconnected,
                    session: snapshot,
                },
            )
            .await?;
            media.close_peer(&device_id).await;
            continue;
        }
        if let Some(signals) = state.media_signals.as_mut() {
            while let Ok(MediaSignal::IceCandidate(candidate)) = signals.try_recv() {
                send_signal(
                    writer,
                    &device_id,
                    &SignalServerMessage::HostIceCandidate { candidate },
                )
                .await?;
            }
        }
    }
    Ok(())
}

async fn send_signal<S>(
    writer: &mut S,
    device_id: &str,
    payload: &SignalServerMessage,
) -> Result<(), String>
where
    S: futures_util::Sink<Message> + Unpin,
    S::Error: std::fmt::Display,
{
    send_relay(writer, &RelayHostMessage::Signal { device_id, payload }).await
}

async fn send_relay<S, T>(writer: &mut S, message: &T) -> Result<(), String>
where
    S: futures_util::Sink<Message> + Unpin,
    S::Error: std::fmt::Display,
    T: Serialize,
{
    let text = serde_json::to_string(message).map_err(|error| error.to_string())?;
    writer
        .send(Message::Text(text.into()))
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{RelayHostMessage, RelayServerMessage};
    use crate::domain::SignalServerMessage;

    #[test]
    fn reads_worker_device_id() {
        let message = serde_json::from_str::<RelayServerMessage>(
            r#"{"type":"signal","deviceId":"phone-1","payload":{"kind":"clockSyncRequest","requestId":"clock-1","clientSentAtMs":1}}"#,
        )
        .expect("Worker signal should deserialize");

        match message {
            RelayServerMessage::Signal { device_id, .. } => assert_eq!(device_id, "phone-1"),
            _ => panic!("Expected a Worker signal"),
        }
    }

    #[test]
    fn writes_worker_device_id() {
        let payload = SignalServerMessage::SignalAck {
            message: "ok".to_string(),
        };
        let value = serde_json::to_value(RelayHostMessage::Signal {
            device_id: "phone-1",
            payload: &payload,
        })
        .expect("Host signal should serialize");

        assert_eq!(value["deviceId"], "phone-1");
        assert!(value.get("device_id").is_none());
    }
}

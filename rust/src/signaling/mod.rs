use std::net::TcpListener as StdTcpListener;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use specta::Type;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot};
use tokio::time;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::Message;

use crate::domain::{
    DeviceConnectionState, JoinRequest, SharingState, SignalClientMessage, SignalServerMessage,
};
use crate::session::SessionStore;
use crate::web_client;
use crate::webrtc_core::media_hub::{MediaSignal, SharedMediaHub};

pub type SharedSession = Arc<Mutex<SessionStore>>;
pub const ROOM_SESSION_EVENT: &str = "room-session-updated";

#[derive(Debug)]
pub struct SignalingServer {
    port: u16,
    shutdown: Option<oneshot::Sender<()>>,
    task: tauri::async_runtime::JoinHandle<()>,
}

impl SignalingServer {
    pub fn start(
        session: SharedSession,
        media: SharedMediaHub,
        app: tauri::AppHandle,
    ) -> Result<Self, String> {
        let listener = StdTcpListener::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
        listener
            .set_nonblocking(true)
            .map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (shutdown, shutdown_receiver) = oneshot::channel();
        let task = tauri::async_runtime::spawn(async move {
            let Ok(listener) = TcpListener::from_std(listener) else {
                return;
            };
            run_server(listener, session, media, app, shutdown_receiver).await;
        });

        Ok(Self {
            port,
            shutdown: Some(shutdown),
            task,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn stop(&mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        self.task.abort();
    }
}

impl Drop for SignalingServer {
    fn drop(&mut self) {
        self.stop();
    }
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

async fn run_server(
    listener: TcpListener,
    session: SharedSession,
    media: SharedMediaHub,
    app: tauri::AppHandle,
    mut shutdown: oneshot::Receiver<()>,
) {
    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                if let Ok((stream, address)) = accept_result {
                    log::info!("Signaling client connected from {address}");
                    tauri::async_runtime::spawn(handle_client(
                        stream,
                        Arc::clone(&session),
                        Arc::clone(&media),
                        app.clone(),
                    ));
                }
            }
            _ = &mut shutdown => {
                break;
            }
        }
    }
}

async fn handle_client(
    stream: TcpStream,
    session: SharedSession,
    media: SharedMediaHub,
    app: tauri::AppHandle,
) {
    let mut peek = [0_u8; 512];
    if let Ok(read) = stream.peek(&mut peek).await {
        if web_client::looks_like_http_client(&peek[..read]) {
            web_client::serve(stream).await;
            return;
        }
    }

    let peer_address = stream.peer_addr().ok();
    let accepted =
        tokio_tungstenite::accept_hdr_async(stream, |request: &Request, response: Response| {
            log::info!("Signaling websocket upgrade path: {}", request.uri().path());
            Ok(response)
        })
        .await;

    let Ok(mut socket) = accepted else {
        if let Err(error) = accepted {
            log::warn!("Signaling websocket handshake failed: {error}");
        }
        return;
    };
    let mut device_id: Option<String> = None;
    let mut last_state: Option<DeviceConnectionState> = None;
    let mut media_signals: Option<mpsc::UnboundedReceiver<MediaSignal>> = None;
    let mut approval_check = time::interval(Duration::from_millis(400));

    loop {
        tokio::select! {
            Some(message_result) = socket.next() => {
                let Ok(message) = message_result else {
                    if let Err(error) = message_result {
                        log::warn!("Signaling client socket closed with error: {error}");
                    }
                    break;
                };
                if !handle_client_message(message, &mut socket, &session, &media, &app, &mut device_id).await {
                    break;
                }
            }
            _ = approval_check.tick(), if device_id.is_some() => {
                let Some(active_device_id) = device_id.clone() else {
                    continue;
                };
                match send_permission_update(
                    &active_device_id,
                    &session,
                    &media,
                    &mut socket,
                    &mut last_state,
                ).await {
                    Ok(Some(signals)) => media_signals = Some(signals),
                    Ok(None) => {}
                    Err(error) => {
                        log::warn!("Signaling permission update failed: {error}");
                        break;
                    }
                }
                if let Err(error) = forward_media_signals(&mut socket, &mut media_signals).await {
                    log::warn!("Signaling media signal forwarding failed: {error}");
                    break;
                }
            }
        }
    }

    if let Some(peer_address) = peer_address {
        log::info!("Signaling client disconnected from {peer_address}");
    }
    if let Some(device_id) = device_id {
        let session = match session.lock() {
            Ok(mut store) => store.disconnect_device(device_id),
            Err(error) => {
                log::warn!("Mark disconnected failed: {error}");
                return;
            }
        };
        emit_room_session(&app, session);
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
            *device_id = Some(request.device_id.clone());
            let response = join_response(session, app, request);
            send_json(socket, &response).await.is_ok()
        }
        Ok(SignalClientMessage::ReceiverReady { device_id }) => {
            let response = receiver_ready_response(session, app, device_id);
            send_json(socket, &response).await.is_ok()
        }
        Ok(SignalClientMessage::Answer { description }) => {
            match media.accept_answer(description).await {
                Ok(()) => send_signal_ack(socket).await.is_ok(),
                Err(message) => send_json(socket, &SignalServerMessage::Error { message })
                    .await
                    .is_ok(),
            }
        }
        Ok(SignalClientMessage::IceCandidate { candidate }) => {
            match media.add_ice_candidate(candidate).await {
                Ok(()) => send_signal_ack(socket).await.is_ok(),
                Err(message) => send_json(socket, &SignalServerMessage::Error { message })
                    .await
                    .is_ok(),
            }
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

use std::net::TcpListener as StdTcpListener;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use specta::Type;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tokio::time;
use tokio_tungstenite::tungstenite::Message;

use crate::domain::{
    DeviceConnectionState, JoinRequest, SharingState, SignalClientMessage, SignalServerMessage,
};
use crate::session::SessionStore;

pub type SharedSession = Arc<Mutex<SessionStore>>;

#[derive(Debug)]
pub struct SignalingServer {
    port: u16,
    shutdown: Option<oneshot::Sender<()>>,
    task: tauri::async_runtime::JoinHandle<()>,
}

impl SignalingServer {
    pub fn start(session: SharedSession) -> Result<Self, String> {
        let listener = StdTcpListener::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
        listener
            .set_nonblocking(true)
            .map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let listener = TcpListener::from_std(listener).map_err(|error| error.to_string())?;
        let (shutdown, shutdown_receiver) = oneshot::channel();
        let task = tauri::async_runtime::spawn(run_server(listener, session, shutdown_receiver));

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
    mut shutdown: oneshot::Receiver<()>,
) {
    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                if let Ok((stream, _address)) = accept_result {
                    tauri::async_runtime::spawn(handle_client(stream, Arc::clone(&session)));
                }
            }
            _ = &mut shutdown => {
                break;
            }
        }
    }
}

async fn handle_client(stream: TcpStream, session: SharedSession) {
    let Ok(mut socket) = tokio_tungstenite::accept_async(stream).await else {
        return;
    };
    let mut device_id: Option<String> = None;
    let mut last_state: Option<DeviceConnectionState> = None;
    let mut approval_check = time::interval(Duration::from_millis(400));

    loop {
        tokio::select! {
            Some(message_result) = socket.next() => {
                let Ok(message) = message_result else {
                    break;
                };
                if !handle_client_message(message, &mut socket, &session, &mut device_id).await {
                    break;
                }
            }
            _ = approval_check.tick(), if device_id.is_some() => {
                let Some(active_device_id) = device_id.clone() else {
                    continue;
                };
                if send_permission_update(&active_device_id, &session, &mut socket, &mut last_state).await.is_err() {
                    break;
                }
            }
        }
    }
}

async fn handle_client_message(
    message: Message,
    socket: &mut tokio_tungstenite::WebSocketStream<TcpStream>,
    session: &SharedSession,
    device_id: &mut Option<String>,
) -> bool {
    let Ok(text) = message.into_text() else {
        return true;
    };
    let parsed = serde_json::from_str::<SignalClientMessage>(&text);

    match parsed {
        Ok(SignalClientMessage::JoinRequest { request }) => {
            *device_id = Some(request.device_id.clone());
            let response = join_response(session, request);
            send_json(socket, &response).await.is_ok()
        }
        Ok(SignalClientMessage::ReceiverReady { device_id }) => {
            let response = receiver_ready_response(session, device_id);
            send_json(socket, &response).await.is_ok()
        }
        Ok(SignalClientMessage::Offer { .. })
        | Ok(SignalClientMessage::Answer { .. })
        | Ok(SignalClientMessage::IceCandidate { .. }) => send_json(
            socket,
            &SignalServerMessage::SignalAck {
                message: "Signal received".to_string(),
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

fn join_response(session: &SharedSession, request: JoinRequest) -> SignalServerMessage {
    let store_result = session.lock().map_err(|error| error.to_string());
    let mut store = match store_result {
        Ok(store) => store,
        Err(message) => return SignalServerMessage::Error { message },
    };

    match store.submit_join_request(request.clone()) {
        Ok(session) => SignalServerMessage::ApprovalWaiting {
            device_id: request.device_id,
            session,
        },
        Err(reason) => SignalServerMessage::JoinRejected { reason },
    }
}

fn receiver_ready_response(session: &SharedSession, device_id: String) -> SignalServerMessage {
    let store_result = session.lock().map_err(|error| error.to_string());
    let mut store = match store_result {
        Ok(store) => store,
        Err(message) => return SignalServerMessage::Error { message },
    };
    let session = store.mark_device_connected(device_id.clone());

    SignalServerMessage::PermissionChanged {
        device_id,
        state: DeviceConnectionState::Connected,
        sharing: SharingState::Enabled,
        session,
    }
}

async fn send_permission_update(
    device_id: &str,
    session: &SharedSession,
    socket: &mut tokio_tungstenite::WebSocketStream<TcpStream>,
    last_state: &mut Option<DeviceConnectionState>,
) -> Result<(), String> {
    let update = {
        let store = session.lock().map_err(|error| error.to_string())?;
        let Some((state, sharing)) = store.device_state(device_id) else {
            return Ok(());
        };
        if last_state.as_ref() == Some(&state) {
            return Ok(());
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
        send_json(
            socket,
            &SignalServerMessage::WebRtcReady {
                device_id: device_id.to_string(),
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
    }

    Ok(())
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

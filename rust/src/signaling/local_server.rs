use std::net::TcpListener as StdTcpListener;
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot};
use tokio::time;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};

use crate::domain::DeviceConnectionState;
use crate::web_client;
use crate::webrtc_core::media_hub::{MediaSignal, SharedMediaHub};

use super::{
    emit_room_session, forward_media_signals, handle_client_message, log_dedup, push_session_event,
    send_permission_update, SharedSession, PAIRING_PORT,
};

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
        let listener = StdTcpListener::bind(("0.0.0.0", PAIRING_PORT))
            .map_err(|error| format!("Could not start Eko on port {PAIRING_PORT}: {error}"))?;
        listener
            .set_nonblocking(true)
            .map_err(|error| error.to_string())?;
        let listener = TcpListener::from_std(listener)
            .map_err(|error| format!("Could not prepare Eko listener: {error}"))?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        let (shutdown, shutdown_receiver) = oneshot::channel();
        let task = tauri::async_runtime::spawn(async move {
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
                    let ip = address.ip().to_string();
                    if log_dedup(&format!("conn:{ip}")) {
                        log::info!("Signaling client connected from {address}");
                    }
                    tauri::async_runtime::spawn(handle_client(
                        stream,
                        Arc::clone(&session),
                        Arc::clone(&media),
                        app.clone(),
                    ));
                }
            }
            _ = &mut shutdown => break,
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
            if log_dedup("http:assets") {
                log::info!("Signaling serving HTTP web client assets");
            }
            web_client::serve(stream, app.clone()).await;
            return;
        }
    }

    let peer_address = stream.peer_addr().ok();
    let accepted =
        tokio_tungstenite::accept_hdr_async(stream, |request: &Request, response: Response| {
            let path = request.uri().path().to_string();
            if log_dedup(&format!("ws:{path}")) {
                log::info!("Signaling websocket upgrade path: {path}");
            }
            Ok(response)
        })
        .await;

    let Ok(mut socket) = accepted else {
        if let Err(error) = accepted {
            log::warn!("Signaling websocket handshake failed: {error}");
            push_session_event(
                &session,
                &app,
                "warn",
                &format!("Signaling handshake failed: {error}"),
            );
        }
        return;
    };
    push_session_event(
        &session,
        &app,
        "info",
        "Signaling WebSocket client connected",
    );
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
        push_session_event(
            &session,
            &app,
            "info",
            &format!("Signaling client disconnected: {peer_address}"),
        );
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

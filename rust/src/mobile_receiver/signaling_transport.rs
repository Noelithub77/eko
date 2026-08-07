use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use crate::domain::{QrPairingPayload, SignalClientMessage, SignalServerMessage};

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RelayReceiverMessage<'a> {
    Hello {
        role: &'static str,
        token: &'a str,
        device_id: &'a str,
    },
    Signal {
        payload: &'a SignalClientMessage,
    },
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum RelayServerMessage {
    Ready {
        role: String,
    },
    Signal {
        device_id: String,
        payload: SignalServerMessage,
    },
    HostConnected,
    HostReconnecting,
    RoomClosed,
    Error {
        message: String,
    },
}

pub(super) struct SignalWriter {
    writer: SplitSink<Socket, Message>,
    hosted: bool,
}

pub(super) struct SignalReader {
    reader: SplitStream<Socket>,
    hosted: bool,
}

pub(super) async fn connect_signaling(
    payload: &QrPairingPayload,
    device_id: &str,
) -> Result<(SignalWriter, SignalReader), String> {
    let local_url = format!("ws://{}:{}/eko", payload.local.host, payload.local.port);
    let local = connect(local_url, None, device_id);
    tokio::pin!(local);

    let Some(hosted) = payload.hosted.as_ref() else {
        return local.await;
    };

    let cloud = connect(
        hosted.socket_url.clone(),
        Some(hosted.join_token.as_str()),
        device_id,
    );
    tokio::pin!(cloud);

    tokio::select! {
        local_result = &mut local => match local_result {
            Ok(connection) => Ok(connection),
            Err(local_error) => cloud.await.map_err(|cloud_error| {
                format!("Local signaling failed: {local_error}. Hosted signaling failed: {cloud_error}")
            }),
        },
        cloud_result = &mut cloud => match cloud_result {
            Ok(connection) => Ok(connection),
            Err(cloud_error) => local.await.map_err(|local_error| {
                format!("Hosted signaling failed: {cloud_error}. Local signaling failed: {local_error}")
            }),
        },
    }
}

async fn connect(
    url: String,
    hosted_token: Option<&str>,
    device_id: &str,
) -> Result<(SignalWriter, SignalReader), String> {
    let (socket, _) = tokio_tungstenite::connect_async(&url)
        .await
        .map_err(|error| error.to_string())?;
    let (mut writer, mut reader) = socket.split();
    let hosted = hosted_token.is_some();

    if let Some(token) = hosted_token {
        send_json(
            &mut writer,
            &RelayReceiverMessage::Hello {
                role: "receiver",
                token,
                device_id,
            },
        )
        .await?;
        wait_for_ready(&mut reader).await?;
    }

    Ok((
        SignalWriter { writer, hosted },
        SignalReader { reader, hosted },
    ))
}

async fn wait_for_ready(reader: &mut SplitStream<Socket>) -> Result<(), String> {
    while let Some(message) = reader.next().await {
        let message = message.map_err(|error| error.to_string())?;
        let Message::Text(text) = message else {
            continue;
        };
        match serde_json::from_str::<RelayServerMessage>(&text)
            .map_err(|error| error.to_string())?
        {
            RelayServerMessage::Ready { role } if role == "receiver" => return Ok(()),
            RelayServerMessage::Error { message } => return Err(message),
            RelayServerMessage::RoomClosed => return Err("This stream has ended.".to_string()),
            _ => {}
        }
    }
    Err("Hosted signaling closed during authentication.".to_string())
}

impl SignalWriter {
    pub(super) async fn send(&mut self, message: &SignalClientMessage) -> Result<(), String> {
        if self.hosted {
            send_json(
                &mut self.writer,
                &RelayReceiverMessage::Signal { payload: message },
            )
            .await
        } else {
            send_json(&mut self.writer, message).await
        }
    }
}

impl SignalReader {
    pub(super) async fn next(&mut self) -> Result<Option<SignalServerMessage>, String> {
        while let Some(message) = self.reader.next().await {
            let message = message.map_err(|error| error.to_string())?;
            let Message::Text(text) = message else {
                continue;
            };
            if !self.hosted {
                return serde_json::from_str(&text)
                    .map(Some)
                    .map_err(|error| error.to_string());
            }
            match serde_json::from_str::<RelayServerMessage>(&text)
                .map_err(|error| error.to_string())?
            {
                RelayServerMessage::Signal { device_id, payload } => {
                    if !device_id.is_empty() {
                        return Ok(Some(payload));
                    }
                }
                RelayServerMessage::HostReconnecting => continue,
                RelayServerMessage::HostConnected | RelayServerMessage::Ready { .. } => continue,
                RelayServerMessage::RoomClosed => return Err("This stream has ended.".to_string()),
                RelayServerMessage::Error { message } => return Err(message),
            }
        }
        Ok(None)
    }
}

async fn send_json<T: Serialize>(
    writer: &mut SplitSink<Socket, Message>,
    value: &T,
) -> Result<(), String> {
    let json = serde_json::to_string(value).map_err(|error| error.to_string())?;
    writer
        .send(Message::Text(json.into()))
        .await
        .map_err(|error| error.to_string())
}

use std::sync::Mutex;

use crate::domain::{JoinRequest, QrPairingPayload};

#[derive(Default)]
pub struct NativeReceiverManager {
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl NativeReceiverManager {
    pub fn start(
        &self,
        app: tauri::AppHandle,
        payload: QrPairingPayload,
        request: JoinRequest,
    ) -> Result<(), String> {
        self.stop();

        #[cfg(target_os = "android")]
        {
            let task = tauri::async_runtime::spawn(android::run_receiver(app, payload, request));
            *self.task.lock().map_err(|error| error.to_string())? = Some(task);
            Ok(())
        }

        #[cfg(not(target_os = "android"))]
        {
            let _ = (app, payload, request);
            Err("Native receiver only runs on Android.".to_string())
        }
    }

    pub fn stop(&self) {
        if let Ok(mut task) = self.task.lock() {
            if let Some(task) = task.take() {
                task.abort();
            }
        }
    }
}

#[cfg(target_os = "android")]
mod android {
    use std::sync::Arc;

    use futures_util::{SinkExt, StreamExt};
    use opus::{Channels, Decoder};
    use tauri::{AppHandle, Emitter};
    use tokio::sync::mpsc;
    use tokio_tungstenite::tungstenite::Message;
    use webrtc::api::APIBuilder;
    use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
    use webrtc::peer_connection::configuration::RTCConfiguration;
    use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
    use webrtc::peer_connection::RTCPeerConnection;

    use super::playback::NativeAudioPlayer;
    use crate::domain::{
        DeviceConnectionState, IceCandidateMessage, JoinRequest, NativeReceiverEvent,
        QrPairingPayload, SessionDescriptionMessage, SignalClientMessage, SignalServerMessage,
    };

    const EVENT_NAME: &str = "native-receiver-event";
    const DECODED_SAMPLES: usize = 960 * 2;

    pub async fn run_receiver(app: AppHandle, payload: QrPairingPayload, request: JoinRequest) {
        if let Err(message) = run_receiver_inner(app.clone(), payload, request).await {
            emit(&app, NativeReceiverEvent::Error { message });
        }
    }

    async fn run_receiver_inner(
        app: AppHandle,
        payload: QrPairingPayload,
        request: JoinRequest,
    ) -> Result<(), String> {
        let url = format!("ws://{}:{}", payload.host, payload.port);
        let (socket, _) = tokio_tungstenite::connect_async(url)
            .await
            .map_err(|error| error.to_string())?;
        let (mut writer, mut reader) = socket.split();
        let (sender, mut outgoing) = mpsc::unbounded_channel::<SignalClientMessage>();
        let device_id = request.device_id.clone();
        let peer = Arc::new(create_peer(app.clone(), device_id.clone(), sender.clone()).await?);

        sender
            .send(SignalClientMessage::JoinRequest { request })
            .map_err(|error| error.to_string())?;

        let writer_task = tauri::async_runtime::spawn(async move {
            while let Some(message) = outgoing.recv().await {
                let Ok(json) = serde_json::to_string(&message) else {
                    continue;
                };
                if writer.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        });

        while let Some(message) = reader.next().await {
            let message = message.map_err(|error| error.to_string())?;
            let Message::Text(text) = message else {
                continue;
            };
            let server_message =
                serde_json::from_str::<SignalServerMessage>(&text).map_err(|error| error.to_string())?;
            handle_server_message(&app, &peer, &sender, &device_id, server_message).await?;
        }

        writer_task.abort();
        emit(
            &app,
            NativeReceiverEvent::Closed {
                message: "Receiver disconnected.".to_string(),
            },
        );
        Ok(())
    }

    async fn create_peer(
        app: AppHandle,
        device_id: String,
        sender: mpsc::UnboundedSender<SignalClientMessage>,
    ) -> Result<RTCPeerConnection, String> {
        let peer = APIBuilder::new()
            .build()
            .new_peer_connection(RTCConfiguration::default())
            .await
            .map_err(|error| error.to_string())?;

        let ice_sender = sender.clone();
        let ice_device_id = device_id.clone();
        peer.on_ice_candidate(Box::new(move |candidate| {
            let sender = ice_sender.clone();
            let device_id = ice_device_id.clone();
            Box::pin(async move {
                let Some(candidate) = candidate else {
                    return;
                };
                if let Ok(candidate) = candidate.to_json() {
                    let _ = sender.send(SignalClientMessage::IceCandidate {
                        candidate: IceCandidateMessage {
                            device_id,
                            candidate: serde_json::to_string(&candidate).unwrap_or_default(),
                        },
                    });
                }
            })
        }));

        let ready_sender = sender.clone();
        let ready_device_id = device_id.clone();
        peer.on_track(Box::new(move |track, _, _| {
            let app = app.clone();
            let ready_sender = ready_sender.clone();
            let device_id = ready_device_id.clone();
            Box::pin(async move {
                let _ = ready_sender.send(SignalClientMessage::ReceiverReady { device_id });
                emit(
                    &app,
                    NativeReceiverEvent::Connected {
                        message: "Native audio connected.".to_string(),
                    },
                );
                let Ok(player) = NativeAudioPlayer::start() else {
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
                        emit(&app, NativeReceiverEvent::Error { message: error.to_string() });
                        return;
                    }
                };
                let mut decoded = vec![0.0_f32; DECODED_SAMPLES];

                while let Ok((packet, _)) = track.read_rtp().await {
                    if let Ok(frames) = decoder.decode_float(&packet.payload, &mut decoded, false) {
                        let used_samples = frames * 2;
                        player.push_samples(&decoded[..used_samples.min(decoded.len())]);
                    }
                }
                player.stop();
            })
        }));

        Ok(peer)
    }

    async fn handle_server_message(
        app: &AppHandle,
        peer: &Arc<RTCPeerConnection>,
        sender: &mpsc::UnboundedSender<SignalClientMessage>,
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
                }
            }
            SignalServerMessage::HostOffer { description } => {
                answer_offer(peer, sender, device_id, description).await?;
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
        device_id: &str,
        description: SessionDescriptionMessage,
    ) -> Result<(), String> {
        let offer = RTCSessionDescription::offer(description.sdp).map_err(|error| error.to_string())?;
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
            .map_err(|error| error.to_string())
    }

    async fn add_host_candidate(
        peer: &Arc<RTCPeerConnection>,
        candidate: IceCandidateMessage,
    ) -> Result<(), String> {
        let candidate =
            serde_json::from_str::<RTCIceCandidateInit>(&candidate.candidate).map_err(|error| error.to_string())?;
        peer.add_ice_candidate(candidate)
            .await
            .map_err(|error| error.to_string())
    }

    fn emit(app: &AppHandle, event: NativeReceiverEvent) {
        let _ = app.emit(EVENT_NAME, event);
    }
}

#[cfg(target_os = "android")]
mod playback;

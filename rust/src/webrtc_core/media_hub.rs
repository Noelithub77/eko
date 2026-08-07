use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use bytes::Bytes;
use tokio::sync::{mpsc, Mutex};
use webrtc::api::media_engine::{MediaEngine, MIME_TYPE_OPUS};
use webrtc::api::APIBuilder;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::media::Sample;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::track::track_local::track_local_static_sample::TrackLocalStaticSample;
use webrtc::track::track_local::TrackLocal;

use crate::audio::frame::{AudioFrame, SAMPLE_RATE};
use crate::audio::opus_codec::OpusAudioEncoder;
use crate::audio::windows_capture::start_system_audio_source;
use crate::domain::{IceCandidateMessage, SessionDescriptionMessage};
use crate::webrtc_core::candidate_path::log_selected_candidate;

pub type SharedMediaHub = Arc<MediaHub>;

#[derive(Clone, Debug)]
pub enum MediaSignal {
    IceCandidate(IceCandidateMessage),
}

#[derive(Debug)]
pub struct MediaPeerOffer {
    pub description: SessionDescriptionMessage,
    pub signals: mpsc::UnboundedReceiver<MediaSignal>,
}

#[derive(Debug)]
pub struct MediaHub {
    track: Arc<TrackLocalStaticSample>,
    peers: Mutex<HashMap<String, Arc<RTCPeerConnection>>>,
    audio_task: StdMutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    session: Option<crate::signaling::SharedSession>,
    app: Option<tauri::AppHandle>,
}

impl MediaHub {
    pub fn start(
        session: Option<crate::signaling::SharedSession>,
        app: Option<tauri::AppHandle>,
    ) -> Result<SharedMediaHub, String> {
        let track = Arc::new(TrackLocalStaticSample::new(
            RTCRtpCodecCapability {
                mime_type: MIME_TYPE_OPUS.to_string(),
                clock_rate: SAMPLE_RATE,
                channels: 2,
                sdp_fmtp_line:
                    "minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000"
                        .to_string(),
                rtcp_feedback: Vec::new(),
            },
            "eko-system-audio".to_string(),
            "eko-stream".to_string(),
        ));
        let hub = Arc::new(Self {
            track,
            peers: Mutex::new(HashMap::new()),
            audio_task: StdMutex::new(None),
            session,
            app,
        });

        MediaHub::start_audio_loop(&hub)?;
        Ok(hub)
    }

    pub async fn stop(&self) {
        if let Some(task) = self
            .audio_task
            .lock()
            .map(|mut task| task.take())
            .ok()
            .flatten()
        {
            task.abort();
        }
        let mut peers = self.peers.lock().await;
        for peer in peers.values() {
            let _ = peer.close().await;
        }
        peers.clear();
    }

    pub async fn create_sender_offer(&self, device_id: String) -> Result<MediaPeerOffer, String> {
        self.close_peer(&device_id).await;

        let api = webrtc_api_with_default_codecs()?;
        let peer = Arc::new(
            api.new_peer_connection(direct_ice_configuration())
                .await
                .map_err(|error| error.to_string())?,
        );
        let (signal_sender, signal_receiver) = mpsc::unbounded_channel();
        let candidate_device_id = device_id.clone();

        peer.on_ice_candidate(Box::new(move |candidate| {
            let signal_sender = signal_sender.clone();
            let candidate_device_id = candidate_device_id.clone();
            Box::pin(async move {
                let Some(candidate) = candidate else {
                    return;
                };
                if let Ok(json) = candidate.to_json() {
                    let _ = signal_sender.send(MediaSignal::IceCandidate(IceCandidateMessage {
                        device_id: candidate_device_id,
                        candidate: serde_json::to_string(&json).unwrap_or_default(),
                    }));
                }
            })
        }));

        let _sender = peer
            .add_track(Arc::clone(&self.track) as Arc<dyn TrackLocal + Send + Sync>)
            .await
            .map_err(|error| error.to_string())?;
        log::info!("Track added for device {device_id}");

        peer.on_peer_connection_state_change(Box::new({
            let device_id = device_id.clone();
            move |state| {
                log::info!("Peer connection state for {device_id}: {state:?}");
                Box::pin(async {})
            }
        }));
        peer.on_ice_connection_state_change(Box::new({
            let device_id = device_id.clone();
            let stats_peer = Arc::clone(&peer);
            move |state| {
                log::info!("ICE connection state for {device_id}: {state:?}");
                let device_id = device_id.clone();
                let stats_peer = Arc::clone(&stats_peer);
                Box::pin(async move {
                    if state
                        == webrtc::ice_transport::ice_connection_state::RTCIceConnectionState::Connected
                    {
                        log_selected_candidate(&stats_peer, &device_id).await;
                    }
                })
            }
        }));

        let offer = peer
            .create_offer(None)
            .await
            .map_err(|error| error.to_string())?;
        peer.set_local_description(offer.clone())
            .await
            .map_err(|error| error.to_string())?;

        self.peers.lock().await.insert(device_id.clone(), peer);

        Ok(MediaPeerOffer {
            description: SessionDescriptionMessage {
                device_id,
                sdp: offer.sdp,
            },
            signals: signal_receiver,
        })
    }

    pub async fn accept_answer(
        &self,
        description: SessionDescriptionMessage,
    ) -> Result<(), String> {
        let peer = self
            .peers
            .lock()
            .await
            .get(&description.device_id)
            .cloned()
            .ok_or_else(|| "No WebRTC peer for this device.".to_string())?;
        let answer =
            RTCSessionDescription::answer(description.sdp).map_err(|error| error.to_string())?;
        log::info!(
            "Setting remote description for device {} (sdp type=answer)",
            description.device_id
        );
        peer.set_remote_description(answer)
            .await
            .map_err(|error| error.to_string())?;
        log::info!(
            "Remote description set successfully for device {}",
            description.device_id
        );
        Ok(())
    }

    pub async fn add_ice_candidate(&self, candidate: IceCandidateMessage) -> Result<(), String> {
        let peer = self
            .peers
            .lock()
            .await
            .get(&candidate.device_id)
            .cloned()
            .ok_or_else(|| "No WebRTC peer for this device.".to_string())?;
        let parsed = serde_json::from_str::<RTCIceCandidateInit>(&candidate.candidate)
            .map_err(|error| error.to_string())?;
        peer.add_ice_candidate(parsed)
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn close_peer(&self, device_id: &str) {
        if let Some(peer) = self.peers.lock().await.remove(device_id) {
            let _ = peer.close().await;
        }
    }

    fn start_audio_loop(hub: &SharedMediaHub) -> Result<(), String> {
        let (sender, mut receiver) = mpsc::channel::<AudioFrame>(8);
        let _capture_thread = start_system_audio_source(sender)?;
        let track = Arc::clone(&hub.track);
        let session = hub.session.clone();
        let app = hub.app.clone();
        let task = tauri::async_runtime::spawn(async move {
            let mut encoder = match OpusAudioEncoder::new() {
                Ok(encoder) => encoder,
                Err(error) => {
                    log::error!("Opus encoder failed: {error}");
                    if let Some(session) = &session {
                        if let Ok(mut store) = session.lock() {
                            let session = store
                                .push_event("error", &format!("Audio encoder failed: {error}"));
                            if let Some(app) = &app {
                                crate::signaling::emit_room_session(app, session);
                            }
                        }
                    }
                    return;
                }
            };

            while let Some(frame) = receiver.recv().await {
                let Ok(encoded) = encoder.encode(frame) else {
                    continue;
                };
                let sample = Sample {
                    data: Bytes::from(encoded.data),
                    duration: Duration::from_millis(encoded.duration_ms),
                    ..Default::default()
                };
                if let Err(error) = track.write_sample(&sample).await {
                    log::error!("Audio loop: write_sample error: {error}");
                }
            }
        });

        *hub.audio_task.lock().map_err(|error| error.to_string())? = Some(task);

        Ok(())
    }
}

fn webrtc_api_with_default_codecs() -> Result<webrtc::api::API, String> {
    let mut media_engine = MediaEngine::default();
    media_engine
        .register_default_codecs()
        .map_err(|error| error.to_string())?;
    Ok(APIBuilder::new().with_media_engine(media_engine).build())
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

use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use bytes::Bytes;
use serde::Serialize;
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
    peers: Mutex<HashMap<String, Arc<MediaPeer>>>,
    audio_counters: Arc<AudioCounters>,
    capture_thread: StdMutex<Option<std::thread::JoinHandle<()>>>,
    audio_task: StdMutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    session: Option<crate::signaling::SharedSession>,
    app: Option<tauri::AppHandle>,
}

#[derive(Debug, Default)]
struct AudioCounters {
    frames_received: std::sync::atomic::AtomicU64,
    frames_encoded: std::sync::atomic::AtomicU64,
    samples_written: std::sync::atomic::AtomicU64,
    write_errors: std::sync::atomic::AtomicU64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPeerOperatorStatus {
    pub device_id: String,
    pub peer_connection_state: String,
    pub ice_connection_state: String,
    pub outbound_audio_packets: u64,
    pub outbound_audio_bytes: u64,
    pub selected_candidate_type: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaOperatorStatus {
    pub audio_task_running: bool,
    pub audio_frames_received: u64,
    pub audio_frames_encoded: u64,
    pub audio_samples_written: u64,
    pub audio_write_errors: u64,
    pub peers: Vec<MediaPeerOperatorStatus>,
}

#[derive(Debug)]
struct MediaPeer {
    connection: Arc<RTCPeerConnection>,
    remote_signal: Mutex<RemoteSignalState>,
}

#[derive(Debug, Default)]
struct RemoteSignalState {
    remote_description_ready: bool,
    pending_candidates: Vec<RTCIceCandidateInit>,
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
            audio_counters: Arc::new(AudioCounters::default()),
            capture_thread: StdMutex::new(None),
            audio_task: StdMutex::new(None),
            session,
            app,
        });

        MediaHub::start_audio_loop(&hub)?;
        Ok(hub)
    }

    pub async fn stop(&self) {
        self.stop_audio_tasks();
        let mut peers = self.peers.lock().await;
        for peer in peers.values() {
            let _ = peer.connection.close().await;
        }
        peers.clear();
    }

    pub async fn create_sender_offer(&self, device_id: String) -> Result<MediaPeerOffer, String> {
        self.close_peer(&device_id).await;

        log::info!(
            "Creating WebRTC sender for device {device_id}; ICE candidate filtering disabled"
        );
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
                log::info!(
                    "Local ICE candidate for device {candidate_device_id}: type={} address={} port={} protocol={}",
                    candidate.typ,
                    candidate.address,
                    candidate.port,
                    candidate.protocol
                );
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

        self.peers.lock().await.insert(
            device_id.clone(),
            Arc::new(MediaPeer {
                connection: peer,
                remote_signal: Mutex::new(RemoteSignalState::default()),
            }),
        );

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
        peer.connection
            .set_remote_description(answer)
            .await
            .map_err(|error| error.to_string())?;
        let pending_candidates = {
            let mut signal = peer.remote_signal.lock().await;
            signal.remote_description_ready = true;
            std::mem::take(&mut signal.pending_candidates)
        };
        for candidate in pending_candidates {
            peer.connection
                .add_ice_candidate(candidate)
                .await
                .map_err(|error| error.to_string())?;
        }
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
        log::info!(
            "Remote ICE candidate received for device {}: {}",
            candidate.device_id,
            describe_ice_candidate(&parsed),
        );
        {
            let mut signal = peer.remote_signal.lock().await;
            if !signal.remote_description_ready {
                signal.pending_candidates.push(parsed);
                log::debug!(
                    "Queued ICE candidate for {} until its answer is ready",
                    candidate.device_id
                );
                return Ok(());
            }
        }
        peer.connection
            .add_ice_candidate(parsed)
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn close_peer(&self, device_id: &str) {
        if let Some(peer) = self.peers.lock().await.remove(device_id) {
            let _ = peer.connection.close().await;
        }
    }

    pub async fn operator_status(&self) -> MediaOperatorStatus {
        use std::sync::atomic::Ordering;

        let peers = self.peers.lock().await.clone();
        let mut peer_statuses = Vec::with_capacity(peers.len());

        for (device_id, peer) in peers {
            let stats = peer.connection.get_stats().await;
            let mut selected_local_candidate_id: Option<String> = None;
            let mut outbound_audio_packets = 0_u64;
            let mut outbound_audio_bytes = 0_u64;

            for report in stats.reports.values() {
                match report {
                    webrtc::stats::StatsReportType::CandidatePair(pair) if pair.nominated => {
                        selected_local_candidate_id = Some(pair.local_candidate_id.clone());
                    }
                    webrtc::stats::StatsReportType::OutboundRTP(outbound)
                        if outbound.kind == "audio" =>
                    {
                        outbound_audio_packets =
                            outbound_audio_packets.saturating_add(outbound.packets_sent);
                        outbound_audio_bytes =
                            outbound_audio_bytes.saturating_add(outbound.bytes_sent);
                    }
                    _ => {}
                }
            }

            let selected_candidate_type = selected_local_candidate_id.and_then(|candidate_id| {
                stats.reports.values().find_map(|report| match report {
                    webrtc::stats::StatsReportType::LocalCandidate(candidate)
                        if candidate.id == candidate_id =>
                    {
                        Some(candidate.candidate_type.to_string())
                    }
                    _ => None,
                })
            });

            peer_statuses.push(MediaPeerOperatorStatus {
                device_id,
                peer_connection_state: format!("{:?}", peer.connection.connection_state())
                    .to_ascii_lowercase(),
                ice_connection_state: format!("{:?}", peer.connection.ice_connection_state())
                    .to_ascii_lowercase(),
                outbound_audio_packets,
                outbound_audio_bytes,
                selected_candidate_type,
            });
        }

        let audio_task_running = self
            .audio_task
            .lock()
            .map(|task| task.is_some())
            .unwrap_or(false);

        MediaOperatorStatus {
            audio_task_running,
            audio_frames_received: self.audio_counters.frames_received.load(Ordering::Relaxed),
            audio_frames_encoded: self.audio_counters.frames_encoded.load(Ordering::Relaxed),
            audio_samples_written: self.audio_counters.samples_written.load(Ordering::Relaxed),
            audio_write_errors: self.audio_counters.write_errors.load(Ordering::Relaxed),
            peers: peer_statuses,
        }
    }

    fn start_audio_loop(hub: &SharedMediaHub) -> Result<(), String> {
        let (sender, mut receiver) = mpsc::channel::<AudioFrame>(8);
        let capture_thread = start_system_audio_source(sender)?;
        let track = Arc::clone(&hub.track);
        let counters = Arc::clone(&hub.audio_counters);
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
                counters
                    .frames_received
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                let Ok(encoded) = encoder.encode(frame) else {
                    log::warn!("Audio loop: Opus encode failed");
                    continue;
                };
                counters
                    .frames_encoded
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                let sample = Sample {
                    data: Bytes::from(encoded.data),
                    duration: Duration::from_millis(encoded.duration_ms),
                    ..Default::default()
                };
                if let Err(error) = track.write_sample(&sample).await {
                    counters
                        .write_errors
                        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    log::error!("Audio loop: write_sample error: {error}");
                } else {
                    counters
                        .samples_written
                        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                }
            }
        });

        *hub.audio_task.lock().map_err(|error| error.to_string())? = Some(task);
        *hub.capture_thread
            .lock()
            .map_err(|error| error.to_string())? = Some(capture_thread);

        Ok(())
    }

    fn stop_audio_tasks(&self) {
        if let Some(task) = self
            .audio_task
            .lock()
            .map(|mut task| task.take())
            .ok()
            .flatten()
        {
            task.abort();
        }
        if let Some(thread) = self
            .capture_thread
            .lock()
            .map(|mut thread| thread.take())
            .ok()
            .flatten()
        {
            if thread.join().is_err() {
                log::warn!("Linux audio capture thread did not exit cleanly");
            }
        }
    }
}

impl Drop for MediaHub {
    fn drop(&mut self) {
        self.stop_audio_tasks();
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

fn describe_ice_candidate(candidate: &RTCIceCandidateInit) -> String {
    let fields: Vec<&str> = candidate.candidate.split_whitespace().collect();
    let protocol = fields.get(2).copied().unwrap_or("unknown");
    let address = fields.get(4).copied().unwrap_or("unknown");
    let port = fields.get(5).copied().unwrap_or("unknown");
    let candidate_type = fields
        .windows(2)
        .find(|pair| pair[0] == "typ")
        .map(|pair| pair[1])
        .unwrap_or("unknown");
    let address_kind = if address.ends_with(".local") {
        "mdns"
    } else if address.parse::<std::net::Ipv4Addr>().is_ok() {
        "ipv4"
    } else if address.contains(':') {
        "ipv6"
    } else {
        "opaque"
    };
    format!(
        "type={candidate_type} address_kind={address_kind} port={port} protocol={protocol}"
    )
}

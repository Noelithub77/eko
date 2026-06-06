# Step 01: Core Proof

## Goal

Prove the risky audio path before polishing the whole app.

## Build

- Confirm Rust and Cargo are available.
- Research and install the best current Rust crates for:
  - WebRTC
  - Opus
  - Windows audio capture
  - Android low-latency audio output
- Create the first native sender and receiver proof.
- Measure setup time and latency.

## Current Package Choices

- `webrtc`: native Rust WebRTC sender/receiver work.
- `opus`: Opus codec bindings for the audio stream.
- `cpal`: cross-platform audio device proof and fallback layer.
- `wasapi`: Windows-first full-system audio capture direction.
- `oboe`: Android low-latency native audio output.
- `mdns-sd`: LAN discovery over mDNS.
- `tokio` + `tokio-tungstenite`: async runtime and WebSocket signaling.

## Current Proof Status

- Rust core proof modules are wired into Tauri.
- Desktop Dev tab can read core proof status through a typed Tauri command.
- Android native build requires `minSdkVersion = 26` because Oboe links Android `aaudio`.
- Android x86_64 debug APK builds successfully for emulator testing.
- Windows default-output loopback capture is implemented with `wasapi`.
- Rust Opus encoding is implemented at 48 kHz stereo with 20 ms packets.
- Rust WebRTC sender track is implemented with `TrackLocalStaticSample`.
- Android currently receives through WebRTC in the Tauri WebView UI, not through native Oboe playback.

## Done When

- [x] Windows can produce a system-audio stream.
- [x] Rust can encode and send Opus packets through WebRTC.
- [ ] Android native receiver can play through Oboe.
- [ ] Dev metrics show setup timing and latency.
- [ ] The result is good enough to continue toward the under-100 ms target.

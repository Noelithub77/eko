# Eko TODO

## Done

- [x] Chose Tauri 2 for desktop and Android.
- [x] Chose Rust as the owner of audio, sessions, signaling, discovery, and WebRTC core work.
- [x] Chose React + shadcn-style components for the UI.
- [x] Created the Eko v1 architecture plan files.
- [x] Created step-by-step plan files under `plan/eko-v1-steps`.
- [x] Added project agent rules in `AGENTS.md`.
- [x] Set up Rust and Cargo.
- [x] Set up Java, Android SDK, Android command-line tools, NDK, CMake, and Ninja.
- [x] Added Android environment variables to the user environment.
- [x] Added core Rust package direction:
  - [x] `tokio`
  - [x] `tokio-tungstenite`
  - [x] `webrtc`
  - [x] `opus`
  - [x] `cpal`
  - [x] `wasapi`
  - [x] `oboe`
  - [x] `mdns-sd`
- [x] Added Rust proof modules for audio, discovery, signaling, and WebRTC.
- [x] Added typed Tauri command for core proof status.
- [x] Added typed frontend API for core proof status.
- [x] Added typed frontend model for core proof status.
- [x] Added Core Proof status cards to the desktop Dev tab.
- [x] Fixed desktop Tauri build commands to use npm.
- [x] Added Android-specific Tauri config for mobile frontend builds.
- [x] Set Android `minSdkVersion` to 26 for Oboe/AAudio.
- [x] Verified TypeScript with `npm run test:types`.
- [x] Verified Rust desktop target with `cargo check`.
- [x] Verified Android x86_64 Rust build.
- [x] Built Android x86_64 debug APK for emulator testing.

## Pending

- [ ] Step 01: Build real Windows system-audio capture proof.
- [ ] Step 01: Build real Android native audio output proof.
- [ ] Step 01: Measure first real setup time and audio latency.
- [ ] Step 01: Decide final Windows capture backend after testing `wasapi` vs `cpal`.
- [ ] Step 02: Build WebSocket signaling server in Rust.
- [ ] Step 02: Add typed signaling messages for join, approval, SDP, ICE, and state events.
- [ ] Step 02: Build first WebRTC sender and receiver handshake.
- [ ] Step 02: Stream Opus audio through WebRTC.
- [ ] Step 03: Implement QR pairing payload with `host`, `port`, `roomId`, and session token.
- [ ] Step 03: Implement session token validation.
- [ ] Step 03: Implement join request approval and denial against real signaling.
- [ ] Step 03: Keep denied devices blocked until desktop unblocks them.
- [ ] Step 04: Implement mDNS LAN discovery toggle separately from QR pairing.
- [ ] Step 04: Make approved devices start sharing automatically.
- [ ] Step 04: Support multiple Android receivers in one session.
- [ ] Step 05: Polish desktop UI for Start/Stop, QR, LAN toggle, pending requests, and connected devices.
- [ ] Step 05: Polish Android UI for Scan QR, Find Nearby Host, waiting, connected, and denied states.
- [ ] Step 05: Persist only dev mode and phone-provided labels.
- [ ] Step 06: Add Dev tab graphs for latency, setup time, states, device events, and errors.
- [ ] Step 06: Add automated tests for session token validation.
- [ ] Step 06: Add tests for approval, denial, unblock, and stop stream cleanup.
- [ ] Step 06: Add Android emulator build and launch test script.
- [ ] Step 06: Add latency regression test script.
- [ ] Final: Test under 100 ms latency on real Windows hardware and a real Android phone.

## Current Known Notes

- [x] Android native audio means Eko v1 should target Android 8.0 or newer.
- [x] Emulator tests are useful for regressions but not enough for final latency acceptance.
- [ ] V1 still needs real audio streaming; the current Rust modules prove package wiring and build compatibility.

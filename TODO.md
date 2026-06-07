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
- [x] Added `specta` + `tauri-specta` generated Rust-to-TypeScript bindings.
- [x] Replaced hand-written frontend command invokes with generated Tauri commands.
- [x] Re-exported shared frontend boundary types from generated Rust bindings.
- [x] Removed handwritten `any` from the Rust-to-TypeScript command boundary.
- [x] Added Core Proof status cards to the desktop Dev tab.
- [x] Fixed desktop Tauri build commands to use npm.
- [x] Added Android-specific Tauri config for mobile frontend builds.
- [x] Set Android `minSdkVersion` to 26 for Oboe/AAudio.
- [x] Verified TypeScript with `npm run test:types`.
- [x] Verified Rust desktop target with `cargo check`.
- [x] Verified Android x86_64 Rust build.
- [x] Built Android x86_64 debug APK for emulator testing.
- [x] Added Windows WASAPI loopback capture for default system output.
- [x] Added Rust Opus encoder for 48 kHz stereo 20 ms audio packets.
- [x] Added Rust WebRTC sender hub with Opus audio track, offer creation, answer handling, and ICE handling.
- [x] Added typed WebSocket messages for host WebRTC offer and host ICE candidates.
- [x] Added Android native Rust WebRTC receiver with Opus decode and Oboe playback.
- [x] Wired Start Stream and Stop Stream to start and stop the Rust media hub.
- [x] Wired Android UI to Rust receiver commands and typed receiver events.

## Pending

- [x] Step 01: Build real Windows system-audio capture proof.
- [x] Step 01: Build real Android native audio output proof.
- [ ] Step 01: Measure first real setup time and audio latency.
- [ ] Step 01: Decide final Windows capture backend after testing `wasapi` vs `cpal`.
- [x] Step 02: Build WebSocket signaling server in Rust.
- [x] Step 02: Add typed signaling messages for join, approval, SDP, ICE, and state events.
- [x] Step 02: Build first WebRTC sender and receiver handshake structure.
- [x] Step 02: Stream Opus audio through WebRTC from the Rust desktop sender.
- [x] Step 03: Implement QR pairing payload with `host`, `port`, `roomId`, and session token.
- [x] Step 03: Implement session token validation.
- [x] Step 03: Implement join request approval and denial against real signaling.
- [x] Step 03: Keep denied devices blocked until desktop unblocks them.
- [x] Step 04: Implement mDNS LAN discovery toggle separately from QR pairing.
- [x] Step 04: Make approved devices start sharing automatically.
- [x] Step 04: Support multiple Android receivers in one session.
- [x] Step 05: Polish desktop UI for Start/Stop, QR, LAN toggle, pending requests, and connected devices.
- [x] Step 05: Polish Android UI for Scan QR, Find Nearby Host, waiting, connected, and denied states.
- [x] Step 05: Persist only dev mode and phone-provided labels.
- [ ] Step 06: Add Dev tab graphs for latency, setup time, states, device events, and errors.
- [ ] Step 06: Add automated tests for session token validation.
- [ ] Step 06: Add tests for approval, denial, unblock, and stop stream cleanup.
- [ ] Step 06: Add Android emulator build and launch test script.
- [ ] Step 06: Add latency regression test script.
- [ ] Final: Test under 100 ms latency on real Windows hardware and a real Android phone.

## Current Known Notes

- [x] Android native audio means Eko v1 should target Android 8.0 or newer.
- [x] Emulator tests are useful for regressions but not enough for final latency acceptance.
- [x] V1 workflow structure is now QR/mDNS -> handshake -> permission -> WebRTC/audio-ready state.
- [x] V1 now sends real Opus packets from Rust over WebRTC after desktop approval.
- [x] Android now receives with native Rust WebRTC and native Oboe audio output.
- [x] Fixed the Windows `link.exe` 1120 failure by building `audiopus_sys` without the debug C runtime in dev builds.
- [ ] `cargo test export_typescript_bindings` now links, but the test binary exits with `STATUS_ENTRYPOINT_NOT_FOUND`; generated bindings are currently maintained manually until that runtime issue is fixed.

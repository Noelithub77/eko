# Step 05: Android UI

## Goal

Make Android joining simple.

## Build

- Add Scan QR.
- Add Find Nearby Host.
- Add waiting, connected, and denied states.
- Add just-in-time permission prompts.
- After connection, use the shared receiver card with a native waveform,
  local play/pause, disconnect, receiver-name editing and stream-quality tiles.

## Done When

- A phone can request access by QR.
- A phone can request access by LAN discovery.
- The phone clearly shows waiting, connected, or denied.
- The phone starts the native Rust receiver from the UI.
- The native receiver answers the host WebRTC offer and plays decoded Opus through Oboe.
- Android and web share their connected presentation; Android supplies native levels,
  playback state and two-second quality updates. Missing measurements remain unavailable.

See [the receiver UI plan](../android-receiver-ui/summary.md) for ownership and verification.

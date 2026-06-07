# Step 05: Android UI

## Goal

Make Android joining simple.

## Build

- Add Scan QR.
- Add Find Nearby Host.
- Add waiting, connected, and denied states.
- Add just-in-time permission prompts.
- Keep native receiver hidden behind simple status UI.

## Done When

- A phone can request access by QR.
- A phone can request access by LAN discovery.
- The phone clearly shows waiting, connected, or denied.
- The phone starts the native Rust receiver from the UI.
- The native receiver answers the host WebRTC offer and plays decoded Opus through Oboe.

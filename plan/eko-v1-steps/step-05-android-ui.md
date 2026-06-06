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
- The phone answers the host WebRTC offer and plays the received audio stream through the current WebView receiver path.
- Native Oboe playback remains the next receiver upgrade.

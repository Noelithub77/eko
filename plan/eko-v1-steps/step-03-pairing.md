# Step 03: Pairing

## Goal

Add the two approved pairing paths.

## Build

- Show a QR code after Start Stream.
- Add Android QR scanning.
- Add LAN discovery as a separate desktop toggle.
- Add Android nearby-host discovery.
- Keep manual IP entry out of v1.

## Done When

- QR pairing can create a pending request.
- LAN discovery can create a pending request when enabled.
- LAN discovery stops accepting new discovery joins when disabled.
- Both paths still require desktop approval.

## Current Status

- [x] QR payload contains `host`, `port`, `roomId`, and `token`.
- [x] Android QR scan validates the payload before connecting.
- [x] LAN discovery publishes the active room over `_eko-audio._tcp.local.`.
- [x] Android can browse nearby hosts through the native Tauri command.
- [x] QR and LAN discovery both use the same approval flow.
- [ ] Real device testing is still needed for Android mDNS behavior across routers.

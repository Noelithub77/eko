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
- QR pairing uses a plain desktop address, not a hidden payload token.
- LAN discovery can create a pending request when enabled.
- LAN discovery stops accepting new discovery joins when disabled.
- Both paths still require desktop approval.
- Web and Android receivers can set the name shown on desktop.

## Current Status

- [x] QR payload contains only `host` and `port`.
- [x] Web receiver remembers the desktop address after opening the QR link.
- [x] Android QR scan validates the payload before connecting.
- [x] LAN discovery publishes the active room over `_eko-audio._tcp.local.`.
- [x] Android can browse nearby hosts through the native Tauri command.
- [x] QR and LAN discovery both use the same approval flow.
- [x] Web and Android receiver names are saved in a persisted Zustand store and editable before connecting.
- [ ] Real device testing is still needed for Android mDNS behavior across routers.

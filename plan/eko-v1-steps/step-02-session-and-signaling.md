# Step 02: Session And Signaling

## Goal

Make joining safe and typed.

## Build

- Add WebSocket signaling.
- Add room ID and session token checks.
- Add typed join, approval, denial, unblock, disconnect, and sharing messages.
- Keep denied devices blocked until the desktop unblocks them.

## Done When

- Invalid room or token joins are rejected.
- Valid joins appear as pending on desktop.
- Allow starts sharing.
- Deny blocks the device.
- Stop Stream clears the full session.

## Current Status

- [x] Desktop starts a Rust WebSocket signaling server on Start Stream.
- [x] QR and LAN clients send typed join requests to the desktop server.
- [x] Desktop remains the only authority for allow, deny, unblock, disconnect, and sharing.
- [x] Allow moves the phone to `connecting` and enables sharing.
- [x] Receiver-ready moves the phone to `connected`.
- [x] Denied devices stay blocked until desktop unblock removes them.
- [ ] Real SDP, ICE, and Opus packet exchange still needs the full media implementation.

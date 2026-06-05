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

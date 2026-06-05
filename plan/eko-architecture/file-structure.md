# Proposed File Structure

```text
eko/
  AGENTS.md
  package.json
  vite.config.ts
  plan/
    eko-architecture/
      summary.md
      file-structure.md
    eko-v1-steps/
      step-01-core-proof.md
      step-02-session-and-signaling.md
      step-03-pairing.md
      step-04-desktop-ui.md
      step-05-android-ui.md
      step-06-dev-mode-and-tests.md
  frontend/
    desktop/
      App.tsx
      features/
        devices/
          DeviceList.tsx
          DeviceRequestList.tsx
        pairing/
          PairingPanel.tsx
          QrPairingCard.tsx
        stream/
          StreamControls.tsx
      layouts/
        DesktopLayout.tsx
    mobile/
      App.tsx
      features/
        approval/
          WaitingForApproval.tsx
        discovery/
          NearbyHostList.tsx
        pairing/
          ScanQrScreen.tsx
        playback/
          AudioReceiver.tsx
      layouts/
        MobileLayout.tsx
    shared/
      components/
        ui/
      hooks/
      types/
        device.ts
        pairing.ts
        signaling.ts
        stream.ts
      utils/
        network.ts
  rust/
    Cargo.toml
    tauri.conf.json
    src/
      lib.rs
      audio/
        capture.rs
        device_picker.rs
        mod.rs
      discovery/
        mdns_host.rs
        mdns_scan.rs
        mod.rs
      domain/
        device.rs
        pairing.rs
        session.rs
        signaling.rs
        mod.rs
      signaling/
        message_handler.rs
        websocket_server.rs
        mod.rs
      session/
        approval.rs
        room_session.rs
        mod.rs
      webrtc/
        audio_sender.rs
        peer.rs
        mod.rs
```

## Notes

- `frontend/desktop/features` contains only desktop screens and user actions.
- `frontend/mobile/features` contains only Android screens and playback UI.
- `frontend/shared/types` contains TypeScript types used by both frontends.
- `rust/src/domain` contains shared Rust data types.
- `rust/src/session` owns approval state.
- `rust/src/signaling` owns WebSocket messages.
- `rust/src/webrtc` owns peer connections and audio tracks.
- `rust/src/audio` owns desktop audio capture.
- `rust/src/discovery` owns mDNS publish and scan logic.

## Files To Avoid

Avoid adding these unless there is a clear need:

```text
index.ts
types/index.ts
helpers.ts
utils.ts with unrelated functions
manager.ts with many responsibilities
service.ts with unclear meaning
```

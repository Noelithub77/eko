# Android receiver UI

**[chosen]** Android and the browser share the receiver card, waveform renderer,
playback controls, receiver-name editor and quality tiles. Android keeps native
WebRTC, Opus/Oboe playback and the existing Media3 session.

- Android publishes bounded audio levels and two-second quality updates to its UI.
- Play/pause uses the media session and stays synchronized with notification controls.
- Receiver-name edits use the existing signaling message without reconnecting.
- Missing measurements remain unavailable; delay is half network round trip plus
  the native playback queue, excluding capture, decoding and physical output.
- Pairing and approval retain their current rules. Scan/discovery controls disappear
  from the connected screen and return after disconnecting.
- Desktop startup shows a blurred, non-pairing QR placeholder with a spinner until
  the real pairing QR has rendered.

No new package is needed. Frontend interaction and pixel checks, focused Rust tests,
type checks, lint and core tests are required. Native Android compile/device proof
depends on the local Android toolchain; do not equate browser fixtures with playback.

Status: implemented. Type checks, lint, core tests, eight latency regressions,
eleven native receiver helper tests, binding generation, desktop Cargo check,
mobile/web frontend builds and twelve focused browser/layout tests passed.
Light/dark and short-phone screenshots were inspected with the native-event
fixture. Native Android compilation and physical playback remain unverified;
the Android Rust target and generated Gradle wiring are absent locally, and
the requested slower toolchain/build verification is awaiting a user decision.

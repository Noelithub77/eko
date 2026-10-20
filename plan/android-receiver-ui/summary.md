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
fixture.

Android arm64 debug APK verification passed on 2026-10-20 for application source
commit `42beb64`. Both Android-only Rust and the Kotlin media plugin compiled;
no application source fixes were needed. The APK contains the native playback
library, media service and `setPlaybackPaused` command. Package inspection reports
`com.codialo.eko`, version `0.5.0` / code `5000`, minimum SDK 26 and target SDK 36.
APK signature v2 verification passed.

Artifact: `rust/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
(397,935,082 bytes; debug symbols retained).

SHA-256: `214ab438d63ff1a94148fb865d6b449910d6cebb3de2b4354b8fef6009ae229f`.

The Android Rust target and generated Gradle wiring are prepared. Local builds
use Java 17 and SDK CMake 3.22.1 to avoid the system CMake 4 / bundled Java 25
incompatibilities; see [Android build verification](../../docs/android-builds.md).
Cargo and Gradle caches were preserved. Physical playback remains unverified;
the APK was built and inspected, without installing it on a device.

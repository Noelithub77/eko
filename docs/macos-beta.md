# macOS beta

**[chosen]** On 16 October 2026 Noel approved the macOS-only `screencapturekit` 11 dependency. This uses Apple's ScreenCaptureKit system-audio API rather than a microphone or a silent fallback. The crate's Swift bridge requires macOS 13+ and Xcode Command Line Tools at build time. Other platforms do not compile this dependency.

The beta requests 48 kHz float32 stereo, excludes eko's own output and registers only the audio callback. It does not deliver or retain screen frames. The callback accepts planar or interleaved stereo, validates the format, forms the existing 20 ms Opus input packets and never blocks on the sender. The existing three-frame sender queue and stale-frame limit apply; partial packets older than 60 ms are discarded. Capture timestamp/physical delay remain unknown rather than reporting an invented measurement.

Startup returns a bounded error for capture/permission failures; stream delegate errors stop the capture thread. Allow eko under System Settings → Privacy & Security → Screen & System Audio Recording, then restart the stream. `rust/Info.plist` describes why recording access is requested. No microphone access is requested. Source errors are logged without audio or screen content.

Run `pnpm ops platforms start --ref build/macos/NAME --json` for the exact committed macOS beta snapshot. The hosted runner builds a DMG with the same app version. Apple code signing/notarization credentials are not configured, so this beta DMG is separate from the signed Windows/Linux/Android public release and is not advertised as a stable macOS updater target.

The pure PCM/packetization regression tests run on Linux too: `cd rust; cargo test --offline -j 2 --lib macos_pcm`. macOS-specific bindings and linking must be checked by the macOS runner. A successful build is not a physical-audio test. Acceptance on a real Mac still needs recording permission allow/deny, actual system audio, direct/TURN playback, output-device changes and stop/start. ScreenCaptureKit may exclude protected content. Do not claim movie lip sync or robust device recovery before those tests.

Research used Context7 and the exact downloaded crate sources/examples, plus [Apple's capture sample](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos), [capturesAudio](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/capturesaudio), and [the crate's current documentation](https://docs.rs/screencapturekit/11.0.0/screencapturekit/).

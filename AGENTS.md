# Eko Agent Instructions

## Project Goal

Build Eko as a local desktop-to-device audio relay.

The desktop app captures computer audio and streams it to approved Android devices on the same local network. Android is the preferred client experience. A desktop-served web client exists mainly as an iOS/browser fallback. The app must work without accounts, cloud services, or internet access.

## Main Rules

- Use strict types everywhere. Do not use `any`.
- Keep files under 500 lines.
- Keep names simple and clear.
- Prefer battle-tested packages over custom code.
- Do not add barrel files unless the user asks for them.
- Do not add wrapper layers that only pass data through.
- Keep comments short and useful.
- Do not revert or overwrite changes from other agents.
- Ask the user before making product or architecture decisions.
- Do not use `unwrap`, `expect`, or `panic!` in runtime app paths. Convert failures into typed `Result` errors and show a clear UI/log message.
- Keep error logs useful but small. Log the failing action and the real error; do not spam repeated frame/audio/debug logs.

## Error Handling Rules

Native crashes are expensive to debug, especially on Android. Treat every app startup path as fallible.

- Tauri commands must return `Result<_, String>` or a proper typed error.
- Rust startup code must not do dev-only work that can fail on Android, such as writing generated TypeScript files.
- File generation, binding export, and codegen should run from tests/scripts or desktop-only dev paths, not mobile app startup.
- If a lock, file write, audio device, network socket, WebRTC step, or plugin init can fail, handle it and return the error.
- For Android crashes, inspect `adb logcat -b crash` and tombstones before changing code.
- If the app can keep running after an error, keep it running and show the simplest useful state.
- If the app cannot keep running, log one clear error and stop that feature instead of aborting the whole process.

## Fast Check Rules

Full Tauri and Android builds are slow. Do not run them as the default verification step.

Default checks after normal code edits:

```powershell
npm run test:types
npm run lint
npm run test:core
cd rust
cargo check
```

Use targeted checks instead of full builds:

- Frontend-only change: `npm run test:types` and `npm run lint`.
- Session/signaling TypeScript test change: `npm run test:core`.
- Rust desktop core change: `cd rust; cargo check`.
- Android Rust compile concern: prefer the narrowest Tauri Android command needed; avoid repeated full APK builds.
- Android Kotlin/media plugin concern: use `cd rust/gen/android; .\gradlew.bat :app:compileUniversalDebugKotlin`.
- UI preview check: use `npm run dev:web:desktop`, `npm run dev:web:mobile`, or `npm run dev:web:client`.

Only run full slow commands when the changed layer needs them or the user asks:

- `npm run tauri -- build`
- `npm run tauri -- android build --debug --apk ...`
- `npm run dev:android:direct`
- VS Code `Ctrl+Shift+B` desktop Tauri dev + `tauri android dev --open`

When a slow build is needed, say why before running it.

## Build Cache Rules

Prefer caching over repeated clean builds.

- Keep Cargo target directories intact. Do not delete `rust/target` unless the user asks or the cache is clearly corrupt.
- Desktop and Android dev intentionally use separate Cargo target folders: `rust/target/desktop-dev` and `rust/target/android-dev`. Keep them separate so VS Code can run both tasks without Cargo build-lock waiting.
- Keep Gradle caches intact. Do not delete `rust/gen/android/.gradle` or global Gradle caches unless needed.
- If `sccache` is installed, use it for Rust builds with `RUSTC_WRAPPER=sccache`.
- If `sccache` is not installed, ask before installing it.
- Do not add global build-cache config without asking the user first.
- For local dev, remember that Cargo incremental builds already help. Use `sccache` when repeated cross-target builds are the bottleneck.

## Required Planning Flow

Before implementation:

1. Explain the possible approaches.
2. List pros and cons for each approach.
3. Mark the selected approach with **[CHOSEN]**.
4. Ask the user when a decision is still open.
5. For larger work, update the matching folder inside `plan/`.

For Eko v1, follow the step files in `plan/eko-v1-steps/`.

Do not put production source code in `step-01`, `step-02`, or similar folders. Step folders are only for planning. Source code should stay grouped by responsibility, such as `audio`, `session`, `signaling`, `webrtc`, `discovery`, or UI feature folders.

## Current Architecture Direction

**[CHOSEN]** Tauri 2 app with a Rust core and React UI.

- Rust owns audio capture, signaling, LAN discovery, sessions, and WebRTC sender logic.
- React owns desktop, Android, and web fallback screens.
- Android uses the Tauri Android WebView for UI, but native Rust/Android code owns receiver playback.
- Android should be treated as the preferred client experience.
- The web client is mainly for iOS/browser fallback and uses browser WebRTC/audio APIs.
- The desktop local signaling server also serves the built web client at `/client`.
- Shared TypeScript types live in `frontend/shared/types`.
- Shared Rust types live in `rust/src/domain`.

Do not move core audio or session approval logic into React.
Do not make the browser web client the primary Android experience.

## Pairing Rules

Only two pairing methods are allowed:

- QR pairing
- LAN discovery

Manual IP entry is not allowed.

The desktop QR uses a local web URL with a hash payload:

```text
http://<desktop-lan-ip>:<port>/client#payload=<base64url-json>
```

The Android app scanner must parse this QR directly and start the native receiver. It must not open the website from inside the app.

The browser/iOS fallback opens the same URL and runs the desktop-served web client.

Scanning a QR code or finding a LAN host must not grant access by itself. The desktop user must approve every device before it can receive audio.

Never allow:

- Open WebSocket joins
- Open WebRTC joins
- Automatic LAN joins
- Streaming before desktop approval

## Native Desktop UI Rules

The desktop app must feel like a proper native application, not a web page in a window.

- Never allow page-level scrollbars. Lock `html`, `body`, and `#root` to `overflow: hidden`.
- Use `h-screen` with `flex flex-col` layout to fill the viewport exactly.
- Use internal `overflow-y: auto` on specific content panels rather than the window.
- Do not use `min-h-screen`, `min-h-[calc(100vh-...)]`, or other patterns that let content exceed the viewport.
- Avoid web-like patterns (card carousels, infinite scroll, long vertical pages).
- Prefer fixed-size panels and internal scrolling for overflow content.

## Desktop Responsibilities

The desktop app is the authority.

It must handle:

- Start stream
- Stop stream
- Show QR code
- Advertise over mDNS
- Show pending devices
- Allow devices
- Deny devices
- Enable or disable sharing per device
- Disconnect devices
- Stop all streams

## Android Responsibilities

The Android app must stay simple and native-first.

It must show only:

- Scan QR Code
- Find Nearby Host
- Connection status
- Waiting for desktop approval
- Connected or denied state

Manual IP entry must not be added.

Android playback rules:

- Use the native receiver path, not browser WebRTC, when running inside the Android app.
- Use Android Media3 `MediaSessionService` for media notification, lock-screen, and play/pause controls.
- Play/pause controls are client-only. Pause must stop local Android playback and clear stale samples while keeping the desktop stream/session alive.
- Resume must continue from the live stream, not old buffered audio.
- Do not claim Spotify-level durable background playback unless the receiver lifecycle is actually anchored to the foreground media service and tested under Android background limits.

## Web Client Responsibilities

The web client is a fallback, mainly for iOS and browsers.

It must:

- Be served by the desktop local server at `/client`.
- Parse the same QR hash payload as the Android app.
- Ask the desktop for approval before playback.
- Use browser WebRTC/audio APIs.
- Avoid LAN discovery and manual IP entry for v1.

It must not:

- Use Cloudflare as an audio or signaling relay.
- Replace the Android native app as the preferred Android experience.
- Use a full Rust/WASM receiver unless the user explicitly chooses that later.

## Package Rules

Before adding a package:

1. Check current docs with `ctx7` when the package, SDK, API, CLI, or framework is part of the task.
2. Prefer maintained packages with clear docs.
3. Ask the user before installing new packages.
4. Record package decisions in the relevant `plan/` file for larger work.

Current preferred package direction:

- `tauri` for desktop and Android shell
- `webrtc` Rust crate for native WebRTC sender work
- `mdns-sd` for LAN discovery
- `wasapi` or `cpal` for desktop audio capture, depending on target OS
- `qrcode.react` for desktop QR display
- `@zxing/browser` for Android QR scanning
- `androidx.media3` for Android media session controls
- `specta` and `tauri-specta` for Rust-to-TypeScript command types
- `zod` only when runtime validation is needed at app boundaries

## File Organization Rules

Use feature folders only when they contain real feature logic.

Preferred structure:

```text
frontend/
  desktop/
    App.tsx
    features/
  mobile/
    App.tsx
    features/
  shared/
    components/
    types/
    utils/
  web/
    client/
      App.tsx
      features/
rust/
  src/
    audio/
    discovery/
    domain/
    mobile_receiver/
    signaling/
    session/
    web_client/
    webrtc/
  plugins/
    tauri-plugin-eko-media/
      src/
      android/
        src/main/kotlin/com/codialo/eko/media/
```

Native Android plugin source should use the Tauri plugin shape when possible:

```text
rust/plugins/tauri-plugin-eko-media/
  src/
    lib.rs
    mobile.rs
  android/
    src/main/kotlin/com/codialo/eko/media/
```

The long `com/codialo/eko/media` package path is normal Android/Kotlin structure. Prefer `kotlin` over `java` for `.kt` files.

Do not put canonical production source code in `rust/gen/android`. That folder is generated Tauri Android output. Small Gradle or manifest wiring may exist there if needed, but stable native source should live outside `gen`.

## Reporting After Work

After completing a change, list:

- What changed
- Files changed
- Why each file changed
- Setup steps, only when needed
- What is next, only for larger changes

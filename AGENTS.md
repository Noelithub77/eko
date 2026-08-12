# Eko Agent Instructions

## Project Goal

Build Eko as a local desktop-to-device audio relay.

The desktop app captures computer audio and streams it to approved Android devices on the same local network. Android is the preferred client experience. A desktop-served web client exists mainly as an iOS/browser fallback. The app must work without accounts, cloud services, or internet access.

Keep the product simple: one desktop authority, approved local devices, no cloud relay, no accounts, no manual IP entry.

## How To Work With Noel

Noel prefers clear, practical work that starts from the real repo state.

- Read the actual files before suggesting or changing anything.
- Explain choices in simple terms, with pros and cons.
- Clearly mark the selected approach as **[CHOSEN]**.
- Ask before product or architecture decisions. Do not guess on open decisions.
- Prefer direct fixes over workarounds.
- Prefer one source of truth over copied state.
- Prefer shared logic over wrapper layers.
- Keep reports short. Include only the useful result unless asked for full logs.
- Do not make broad refactors unless they are needed for the task.
- Do not revert or overwrite changes from other agents.
- Use Windows/PowerShell-friendly commands and quote paths when needed.

## Main Rules

- Use strict types everywhere. Do not use `any`.
- Keep files under 500 lines.
- Keep names simple and clear.
- Prefer battle-tested packages over custom code.
- Do not add barrel files unless the user asks for them.
- Do not add wrapper layers that only pass data through.
- Keep comments short and useful.
- Remove dead or unused code when it is part of the touched area.
- Keep error logs useful but small.
- Do not use `unwrap`, `expect`, or `panic!` in runtime app paths.
- Convert failures into typed `Result` errors and show a clear UI or log message.

## Planning Before Implementation

Before implementation:

1. Explain the possible approaches.
2. List simple pros and cons for each approach.
3. Mark the selected approach as **[CHOSEN]**.
4. Ask Noel when a decision is still open.
5. For larger work, update the matching folder inside `plan/`.

Ask Noel when:

- A product behavior can go more than one way.
- A new package is needed.
- A folder or architecture direction would change.
- A slow build or device test is needed.
- The task can affect Android native playback, approval rules, pairing, or streaming security.

For larger work, create simple plan artifacts:

```text
plan/
  feature-name/
    summary.md
    file-structure.md
```

For Eko v1, first check `plan/eko-v1-steps/`. Step files are planning docs only. Do not put production source code in `step-01`, `step-02`, or similar folders.

## Package And Docs Rules

Before adding a package:

1. Check current docs with `ctx7` when the task involves a library, SDK, API, CLI, framework, or cloud service.
2. Prefer maintained packages with clear docs.
3. Present options with simple pros and cons.
4. Ask Noel before installing.
5. Record the package decision in the relevant `plan/` file for larger work.

Current preferred package direction:

- `tauri` for desktop and Android shell.
- `webrtc` Rust crate for native WebRTC sender work.
- `mdns-sd` for LAN discovery.
- `wasapi` or `cpal` for desktop audio capture, depending on target OS.
- `qr-code-styling` for styled desktop QR display.
- `@zxing/browser` for Android QR scanning.
- `androidx.media3` for Android media session controls.
- `specta` and `tauri-specta` for Rust-to-TypeScript command types.
- `zod` only when runtime validation is needed at app boundaries.

## Current Architecture Direction

**[CHOSEN]** Tauri 2 app with a Rust core and React UI.

- Rust owns audio capture, signaling, LAN discovery, sessions, and WebRTC sender logic.
- React owns desktop, Android, and web fallback screens.
- Android uses the Tauri Android WebView for UI, but native Rust and Android code owns receiver playback.
- Android is the preferred client experience.
- The web client is mainly for iOS/browser fallback and uses browser WebRTC/audio APIs.
- The desktop local signaling server also serves the built web client at `/client`.
- Shared TypeScript types live in `frontend/shared/types`.
- Shared Rust types live in `rust/src/domain`.

Do not move core audio or session approval logic into React.
Do not make the browser web client the primary Android experience.

## Current File Structure

Use this map to find the right place before editing.

```text
eko/
  AGENTS.md
  README.md
  .github/
    SETUP.md
    TODO.md
  package.json
  vite.config.ts
  biome.json
  components.json
  scripts/
    start-desktop-dev.mjs
    start-desktop-dev.ps1
    stop-desktop-dev.ps1
    start-android-dev.ps1
    stop-android-dev.ps1
    open-android-studio.ps1
    build-production.mjs
    sync-version.mjs
  plan/
    eko-architecture/
    eko-v1-steps/
    ci-release/
  frontend/
    desktop/
      App.tsx
      layouts/
      features/dev/
      features/devices/
      features/pairing/
      features/settings/
      features/stream/
      features/updates/
    mobile/
      App.tsx
      layouts/
      features/approval/
      features/discovery/
      features/pairing/
    web/
      client/
        App.tsx
        features/playback/
        components/
    shared/
      bindings/
      components/
      components/ui/
      core/
      hooks/
      lib/
      stores/
      types/
      utils/
  rust/
    Cargo.toml
    tauri.conf.json
    tauri.android.conf.json
    src/
      lib.rs
      main.rs
      audio/
      discovery/
      domain/
      media/
      mobile_receiver/
      session/
      signaling/
      web_client/
      webrtc_core/
    plugins/
      eko-media/android/src/main/java/com/codialo/eko/media/
  tests/
    core/
    desktop/
    android/
    latency/
  docs/
```

## Where Things Live

### Planning And Setup

- `plan/eko-architecture/` explains the chosen architecture and proposed structure.
- `plan/eko-v1-steps/` holds the v1 step plan. Follow it for larger v1 work.
- `plan/ci-release/` holds release and CI planning.
- `.github/SETUP.md` explains local setup, desktop dev, Android dev, build commands, and manual test flow.
- `scripts/` holds Windows-friendly dev, stop, Android Studio, build, and release helpers.

### Desktop UI

Desktop UI lives in `frontend/desktop/`.

- `App.tsx` wires the desktop app.
- `layouts/DesktopLayout.tsx` owns the main window layout.
- `features/stream/` owns stream controls and now-playing UI.
- `features/dev/` owns dev-only controls.
- `features/devices/` owns approved and pending device display.
- `features/pairing/` owns QR display and pairing UI.
- `features/settings/` owns desktop settings.
- `features/updates/` owns update checks and prompts.

Desktop UI must feel like a native app: no page-level scrollbars, fixed app-height layout, and internal scroll only inside panels that need it.

### Android UI

Android-facing React UI lives in `frontend/mobile/`.

- `App.tsx` wires the Android app shell.
- `layouts/MobileLayout.tsx` owns the mobile screen frame.
- `features/pairing/ScanQrScreen.tsx` scans QR payloads.
- `features/discovery/NearbyHostList.tsx` shows LAN hosts.
- `features/approval/ConnectionStatus.tsx` shows waiting, connected, denied, or error state.

Android UI must stay simple: Scan QR Code, Find Nearby Host, connection status, waiting for approval, connected, or denied. Do not add manual IP entry.

### Web Client Fallback

Browser fallback lives in `frontend/web/client/`. `App.tsx` owns the client flow, `features/playback/` owns browser playback and quality reporting, and `components/AudioWaveVisualizer.tsx` owns the visualizer.

The web client is served by the desktop local server at `/client`. It parses the same QR hash payload used by Android: `http://<desktop-lan-ip>:<port>/client#payload=<base64url-json>`.

The web client is mainly for iOS and browser fallback. Do not make it the primary Android path.

### Shared Frontend

Shared frontend code lives in `frontend/shared/`.

- `bindings/tauri.ts` contains generated or shared Tauri binding types.
- `components/` contains reusable UI pieces.
- `components/ui/` contains shadcn-style UI primitives.
- `core/session.ts` contains shared session logic used by tests and UI.
- `hooks/` contains shared React hooks.
- `stores/` contains Zustand stores for local UI state.
- `types/` contains shared TypeScript types.
- `utils/` contains focused helpers such as API calls, pairing links, logging, and signaling clients.

Put shared logic here only when two surfaces really use it. Use the existing Zustand store pattern for persisted UI state.

### Rust App Core

Rust app code lives in `rust/src/`.

- `main.rs` starts the Tauri app.
- `lib.rs` wires Tauri commands and app modules.
- `core_proof.rs` contains early proof or readiness logic.
- `network_host.rs` finds the LAN host address used for local pairing.
- `profiler.rs` stores the in-memory live profiler snapshot.
- `eko_media.rs` wires the native media plugin side.
- `linux_wayland.rs` contains Linux Wayland runtime handling.
- `audio/` captures or creates audio frames.
- `discovery/` owns LAN discovery and mDNS behavior.
- `domain/` owns shared Rust data types for devices, sessions, receivers, and signaling.
- `media/` owns platform audio integration.
- `mobile_receiver/` owns native receiver playback pieces.
- `session/` owns room state, approval, device access, and session lifecycle.
- `signaling/` owns local signaling messages and server behavior.
- `web_client/` serves the browser fallback client.
- `webrtc_core/` owns WebRTC media hub and peer flow.

Keep approval, session, signaling, and audio authority in Rust.

### Android Native Plugin

Native Android media code lives in:

```text
rust/plugins/eko-media/android/src/main/java/com/codialo/eko/media/
```

- `EkoMediaPlugin.kt` exposes the Tauri plugin.
- `EkoMediaBridge.kt` bridges app calls to native media behavior.
- `EkoMediaService.kt` owns Android media service behavior.
- `EkoMediaState.kt` owns media state.
- `EkoSessionPlayer.kt` owns session playback behavior.

Do not put canonical production source code in `rust/gen/android/`. That folder is generated by Tauri. Small Gradle or manifest wiring may exist there only when needed.

### Tests

- `tests/core/session.test.ts` checks shared session behavior.
- `tests/desktop/app.spec.ts` checks desktop UI behavior with Playwright.
- `tests/android/emulator-smoke.ts` checks Android emulator wiring.
- `tests/latency/latency-regression.ts` checks stream latency expectations.

Use the narrowest test that matches the change.

## Pairing Rules

Only two pairing methods are allowed:

- QR pairing.
- LAN discovery.

Manual IP entry is not allowed.

The desktop QR uses a local web URL with a hash payload:

```text
http://<desktop-lan-ip>:<port>/client#payload=<base64url-json>
```

The Android app scanner must parse this QR directly and start the native receiver. It must not open the website from inside the app.

The browser or iOS fallback opens the same URL and runs the desktop-served web client.

Scanning a QR code or finding a LAN host must not grant access by itself. The desktop user must approve every device before it can receive audio.

Never allow open WebSocket joins, open WebRTC joins, automatic LAN joins, or streaming before desktop approval.

## Desktop Responsibilities

The desktop app is the authority. It must handle start stream, stop stream, show QR code, advertise over mDNS, show pending devices, allow devices, deny devices, enable or disable sharing per device, disconnect devices, and stop all streams.

## Android Responsibilities

The Android app is the preferred client. It must show only Scan QR Code, Find Nearby Host, connection status, waiting for desktop approval, connected state, or denied state.

Android playback rules:

- Use the native receiver path, not browser WebRTC, when running inside the Android app.
- Use Android Media3 `MediaSessionService` for media notification, lock-screen, and play/pause controls.
- Play and pause are client-only.
- Pause must stop local Android playback and clear stale samples while keeping the desktop stream/session alive.
- Resume must continue from the live stream, not old buffered audio.
- Do not claim durable background playback unless the receiver lifecycle is anchored to the foreground media service and tested under Android background limits.

## Web Client Responsibilities

The web client is a fallback, mainly for iOS and browsers. It must be served at `/client`, parse the same QR hash payload, ask the desktop for approval before playback, use browser WebRTC/audio APIs, and avoid LAN discovery or manual IP entry for v1. It must not use Cloudflare as an audio or signaling relay, replace Android native playback, or use a full Rust/WASM receiver unless Noel explicitly chooses that later.

## Error Handling Rules

Native crashes are expensive to debug, especially on Android. Treat every app startup path as fallible.

- Tauri commands must return `Result<_, String>` or a proper typed error.
- Rust startup code must not do dev-only work that can fail on Android, such as writing generated TypeScript files.
- File generation, binding export, and codegen should run from tests, scripts, or desktop-only dev paths, not mobile app startup.
- If a lock, file write, audio device, network socket, WebRTC step, or plugin init can fail, handle it and return the error.
- For Android crashes, inspect `adb logcat -b crash` and tombstones before changing code.
- If the app can keep running after an error, keep it running and show the simplest useful state.
- If the app cannot keep running, log one clear error and stop that feature instead of aborting the whole process.

## Live Profiling Rules

Use live profiling when improving stream smoothness, latency, jitter, buffering, packet loss, or audio quality.

- Keep profiling session-only by default. Do not write profiler logs to disk unless Noel explicitly asks.
- The desktop local server exposes the current in-memory profiler snapshot at `GET /__eko_profiler`.
- Web clients should send browser WebRTC stats while connected.
- Android native receivers should send native receive/playback stats while connected.
- Keep a bounded rolling window in memory so agents can inspect the current run without creating stale files.
- Compare several samples instead of reacting to one spike.
- Treat missing fields honestly.

Collect only useful stream-quality fields: `source`, `connectionId`, `deviceId`, `roomId`, `sampleIndex`, `latencyMs`, `jitterMs`, `bufferMs`, `packetLossPercent`, `packetsReceived`, and `packetsLost`.

Do not collect personal data, raw audio, IP history, tokens, SDP bodies, ICE candidates, or full user-agent strings.

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

Use targeted checks instead:

- Frontend-only change: `npm run test:types` and `npm run lint`.
- Session/signaling TypeScript test change: `npm run test:core`.
- Rust desktop core change: `cd rust; cargo check`.
- Android Rust compile concern: prefer the narrowest Tauri Android command needed; avoid repeated full APK builds.
- Android Kotlin/media plugin concern: `cd rust/gen/android; .\gradlew.bat :app:compileUniversalDebugKotlin`.
- UI preview check: use `npm run dev:web:desktop`, `npm run dev:web:mobile`, or `npm run dev:web:client`.

Only run full slow commands when the changed layer needs them or Noel asks:

- `npm run tauri -- build`.
- `npm run tauri -- android build --debug --apk ...`.
- `npm run dev:android:direct`.
- VS Code `Ctrl+Shift+B` desktop Tauri dev plus `tauri android dev --open`.

When a slow build is needed, say why before running it.

## Build Cache Rules

Prefer caching over repeated clean builds.

- Keep Cargo target directories intact. Do not delete `rust/target` unless Noel asks or the cache is clearly corrupt.
- Desktop and Android dev intentionally use separate Cargo target folders: `rust/target/desktop-dev` and `rust/target/android-dev`.
- Keep them separate so VS Code can run both tasks without Cargo build-lock waiting.
- Keep Gradle caches intact. Do not delete `rust/gen/android/.gradle` or global Gradle caches unless needed.
- If `sccache` is installed, use it for Rust builds with `RUSTC_WRAPPER=sccache`.
- If `sccache` is not installed, ask before installing it.
- Do not add global build-cache config without asking Noel first.
- Cargo incremental builds already help. Use `sccache` when repeated cross-target builds are the bottleneck.

## Useful Commands

- Install dependencies: `npm install`.
- Desktop web preview: `npm run dev:web:desktop`.
- Desktop Tauri dev: `npm run dev:desktop`.
- Android Tauri dev through Android Studio: `npm run dev:android`.
- Raw Android Tauri dev: `npm run dev:android:direct`.
- Mobile UI web preview: `npm run dev:web:mobile`.
- Web client preview: `npm run dev:web:client`.
- Core checks: `npm run test:types`, `npm run lint`, `npm run test:core`, then `cd rust; cargo check`.
- Android Kotlin compile check: `cd rust/gen/android; .\gradlew.bat :app:compileUniversalDebugKotlin`.

## Dev Workflow Notes

- `npm run dev:desktop` uses `scripts/start-desktop-dev.mjs`.
- Desktop dev uses `rust/target/desktop-dev/`.
- `npm run dev:android` uses `scripts/start-android-dev.ps1`.
- Android dev uses `rust/target/android-dev/`.
- Separate Cargo target folders avoid waiting on one Rust build lock.
- Android dev may use ADB reverse for USB devices.
- If no USB device is connected, Android dev falls back to the PC LAN IP.
- When Android Studio opens, keep the Tauri dev terminal running.
- If Android loads an old dev URL, rerun `npm run dev:android`; the script removes stale dev APKs on connected USB devices.

## UI Rules

- Keep UI minimal.
- Avoid repeated text.
- Show only what the user needs right now.
- Use clear button hierarchy.
- Prefer existing shared UI components.
- Use lucide icons where they fit.
- Do not add decorative layouts that make the app feel like a website.
- Lock `html`, `body`, and `#root` to `overflow: hidden`.
- Use `h-screen` with `flex flex-col` layout.
- Avoid `min-h-screen` and page-level scroll patterns.
- Put overflow inside a specific panel with `overflow-y: auto`.

## Refactoring Rules

Refactor only when it helps the current task.

- Split a file if it is over 500 lines.
- Move repeated logic into a focused shared helper.
- Delete dead code in the touched area.
- Keep modules small and named by what they actually do.
- Do not add wrapper layers that only pass values through.
- Do not add broad `manager.ts`, `service.ts`, or `utils.ts` files without a clear purpose.
- Do not add index barrel files unless Noel asks.
- Do not move ownership across layers without asking.

Avoid creating these unless there is a clear reason:

```text
index.ts
types/index.ts
helpers.ts
utils.ts with unrelated functions
manager.ts with many responsibilities
service.ts with unclear meaning
```

## Reporting After Work

After completing a change, list:

- What changed.
- Files changed.
- Why each file changed.
- Setup steps, only when needed.
- What is next, only for larger changes.

Keep the report short and useful. Do not include a "What's Next" section for simple questions or tiny edits.

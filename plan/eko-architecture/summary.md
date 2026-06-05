# Eko Architecture Plan

## Goal

Build a local desktop-to-Android audio relay.

The desktop captures computer audio. Android devices connect by QR code or LAN discovery. The desktop must approve every device before audio starts.

## Current Repo Fit

The current repo is a good base for this project.

It already has:

- Tauri 2
- React 19
- Vite
- Rust backend
- Separate desktop and mobile frontend folders
- Tauri Android generated project

## Main Architecture Options

### Option 1: Tauri for desktop and Android **[CHOSEN]**

Description:

Use the current Tauri repo. Keep Rust as the core backend and React as the UI for desktop and Android.

Pros:

- Uses the repo that already exists.
- One shared codebase for desktop and Android UI.
- Rust is a good fit for audio, WebRTC, mDNS, and local networking.
- Tauri Android can call native Kotlin plugins when needed.

Cons:

- Android WebView support depends on the device WebView version.
- QR camera permission may need a small Android permission/plugin path.
- Desktop audio capture is still native and OS-specific.

### Option 2: Tauri desktop plus native Android app

Description:

Keep Tauri for desktop. Build Android separately with Kotlin or React Native.

Pros:

- Android audio and camera behavior is easier to control.
- WebRTC native Android libraries are mature.
- Fewer WebView surprises.

Cons:

- More codebases.
- More duplicate UI and state logic.
- Slower to build the first version.

### Option 3: Browser-only receiver

Description:

Desktop runs the local server. Phones open a browser page instead of installing an Android app.

Pros:

- Fastest prototype.
- No Android build setup.
- WebRTC works well in Chrome on Android.

Cons:

- Not a real app experience.
- Camera and permissions are browser-dependent.
- Harder to manage device identity cleanly.

## Selected Approach

**[CHOSEN]** Use Tauri for both desktop and Android.

The project should keep the current repo and build the core logic in Rust. React should stay focused on screens and user actions.

## Recommended Runtime Shape

```text
Desktop React UI
  calls Tauri commands

Rust core
  captures desktop audio
  owns session state
  advertises mDNS service
  runs WebSocket signaling
  creates WebRTC senders

Android React UI
  scans QR code
  browses LAN
  requests approval
  receives WebRTC audio
```

## Package Recommendations

### Tauri 2

What it does:

Builds the desktop and Android app shell.

Why it is a good choice:

The repo already uses it, and the official docs show Tauri mobile plugins can call native Android Kotlin code when needed.

Pros:

- Already installed.
- Rust backend fits this app.
- Small app size compared to Electron.

Cons:

- Android WebView version depends on the device.
- Some mobile permissions may need native plugin work.

### Rust `webrtc` crate

What it does:

Creates native WebRTC connections from Rust.

Why it is a good choice:

The desktop audio starts in Rust, so native WebRTC avoids awkward browser-only media APIs.

Pros:

- Keeps audio streaming inside Rust.
- Supports SDP, ICE, RTP, SRTP, and peer connections.
- Good fit for a desktop sender.

Cons:

- More complex than browser WebRTC.
- Needs careful latency testing.

### `mdns-sd`

What it does:

Advertises and discovers services on the local network.

Why it is a good choice:

It supports publishing and browsing mDNS services and does not force a specific async runtime.

Pros:

- Simple LAN discovery.
- Works with sync and async code.
- Cross-platform desktop support.

Cons:

- Android local network permissions may need extra care.
- Some networks block multicast.

### `wasapi` and `cpal`

What they do:

Capture and handle desktop audio.

Why they are good choices:

`wasapi` is direct for Windows loopback capture. `cpal` is useful for cross-platform audio device handling.

Pros:

- Avoids writing raw OS audio code from scratch.
- Rust-friendly.
- Can start with Windows first and expand.

Cons:

- Loopback capture differs by OS.
- macOS and Linux need separate testing.

### `qrcode.react`

What it does:

Renders QR codes in React.

Why it is a good choice:

The desktop QR screen can stay simple and typed.

Pros:

- React-friendly.
- TypeScript declarations included.
- Small focused package.

Cons:

- Only solves QR display, not scanning.

### `@zxing/browser`

What it does:

Scans QR codes from the camera in the browser/WebView.

Why it is a good choice:

It is based on ZXing and works with video camera input.

Pros:

- Battle-tested QR scanning family.
- TypeScript declarations included.
- Avoids custom QR scanning code.

Cons:

- Needs camera permissions.
- Must be tested inside Tauri Android WebView.

### `specta` and `tauri-specta`

What they do:

Generate TypeScript bindings from Rust command types.

Why they are good choices:

They help keep Rust and TypeScript command types in sync without using `any`.

Pros:

- Supports strict typing.
- Reduces manual duplicated types.
- Fits Tauri command boundaries.

Cons:

- Adds a generation step.
- Agents must keep generated bindings updated.

## Important Technical Notes

- Tauri uses Android system WebView, so WebRTC support depends on the device WebView provider.
- Android local network access is moving toward explicit permission handling.
- WebRTC is peer-to-peer, so multi-device streaming means one peer connection per approved phone.
- WebSocket is only for signaling and approval messages.
- Audio must not be sent until desktop approval is complete.

## Critical Questions For The User

1. Should the first version target Windows only for desktop audio capture, or Windows, macOS, and Linux from the start?
2. Is Android the only phone target for v1, or should the structure leave room for iOS soon?
3. Is the audio source always full desktop/system audio, or should users pick a specific app or output device later?
4. Should one desktop stream allow multiple phones at once in v1?
5. Should approved devices be remembered after app restart, or should approval always be session-only?
6. Is LAN-only required forever for v1, or should the code leave a clean path for internet streaming later?
7. What latency is acceptable: under 100 ms, under 250 ms, or just "feels close enough for watching video"?
8. Should denied devices be blocked for the whole session, or allowed to request again?
9. Should the Android app keep playing when the screen turns off?
10. Should the desktop app continue streaming when minimized?

## Build Order

Detailed step files live in `plan/eko-v1-steps/`.

1. Core proof
2. Session and signaling
3. Pairing
4. Desktop UI
5. Android UI
6. Dev mode and tests

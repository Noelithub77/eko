# Eko Agent Instructions

## Project Goal

Build Eko as a local desktop-to-Android audio relay.

The desktop app captures computer audio and streams it to approved Android devices on the same local network. The app must work without accounts, cloud services, or internet access.

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
- React owns desktop and mobile screens.
- The Android app uses the Tauri Android WebView for UI and WebRTC playback.
- Shared TypeScript types live in `frontend/shared/types`.
- Shared Rust types live in `rust/src/domain`.

Do not move core audio or session approval logic into React.

## Pairing Rules

Only two pairing methods are allowed:

- QR pairing
- LAN discovery

Manual IP entry is not allowed.

Scanning a QR code or finding a LAN host must not grant access by itself. The desktop user must approve every device before it can receive audio.

Never allow:

- Open WebSocket joins
- Open WebRTC joins
- Automatic LAN joins
- Streaming before desktop approval

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

The Android app must stay simple.

It must show only:

- Scan QR Code
- Find Nearby Host
- Connection status
- Waiting for desktop approval
- Connected or denied state

Manual IP entry must not be added.

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
rust/
  src/
    audio/
    discovery/
    domain/
    signaling/
    session/
    webrtc/
```

## Reporting After Work

After completing a change, list:

- What changed
- Files changed
- Why each file changed
- Setup steps, only when needed
- What is next, only for larger changes

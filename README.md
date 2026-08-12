# Eko

[![License: AGPL v3+](https://img.shields.io/badge/License-AGPL%20v3%2B-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/Noelithub77/eko?display_name=tag&sort=semver)](https://github.com/Noelithub77/eko/releases)
[![Open issues](https://img.shields.io/github/issues/Noelithub77/eko)](https://github.com/Noelithub77/eko/issues)
[![Last commit](https://img.shields.io/github/last-commit/Noelithub77/eko)](https://github.com/Noelithub77/eko/commits/main)

# Eko


Eko is a local desktop-to-device audio relay designed for group listening. It captures system audio on the desktop and streams it to multiple approved devices over the  network.

Bluetooth Classic audio commonly supports a single active audio output, while multi-device support varies by platform and manufacturer. Bluetooth LE Audio and Auracast can provide one-to-many broadcast audio, but only when all participating devices support the required hardware, profiles, and operating-system features and is generally not available and has 

Eko bypasses the Bluetooth concurrency problem by using local-network WebRTC sessions. This allows the desktop to manage multiple receivers independently, with practical scaling determined by network bandwidth, device count, and desktop processing capacity.
Each device joins through QR pairing or nearby discovery and must be approved by the desktop before receiving audio.

The Android app is the preferred client. A desktop-served browser client is available as an iOS and browser fallback. Eko is designed to work without accounts, cloud audio relays, or manual IP entry.

> Eko is in active early development. Pairing and streaming work is still being tested on real devices, and latency results may change between releases.

## What Eko does

- Captures desktop audio and sends it over the local network.
- Lets the desktop user approve each receiving device.
- Supports QR pairing and nearby-host discovery.
- Uses native Android playback for the Android client.
- Serves a browser fallback from the desktop for iOS and modern browsers.
- Keeps the desktop as the authority for sessions and device access.

Scanning a QR code or finding a host does not grant access by itself. The desktop user must approve a device before it can receive audio.

## Architecture

```text
Desktop app
  Rust core: capture, discovery, approval, signaling, WebRTC sender
  React UI: controls, pairing, devices, settings, updates
       |
       +--> Approved Android device: native receiver and Media3 playback
       |
       +--> Browser client: WebRTC playback fallback
```

The optional hosted signaling service helps peers find and negotiate a connection. Eko does not use a cloud service to relay the audio stream.

## Current platform status

| Platform | Role | Status |
| --- | --- | --- |
| Windows | Desktop capture and authority | Primary development target |
| Android 8+ | Native receiver | Preferred client target |
| iOS / modern browsers | Browser receiver | Fallback client |
| Linux | Desktop development | Experimental |

## Quick start

### Requirements

- Node.js and pnpm.
- Rust and Cargo.
- For Android: Android Studio, an Android SDK, and either an emulator or a device.
- A desktop and receiver device on the same local network.

See [.github/SETUP.md](.github/SETUP.md) for the complete Windows, Android, and development setup.

### Install and run the desktop app

```powershell
corepack enable
pnpm install
pnpm dev:desktop
```

### Run the Android client

```powershell
pnpm dev:android
```

Keep the desktop development process running while Android Studio or the Android device connects to it.

### Preview the web clients

```powershell
pnpm dev:web:mobile
pnpm dev:web:client
```

## Checks for contributors

Run the narrowest checks that match your change. The usual baseline is:

```powershell
pnpm test:types
pnpm lint
pnpm test:core
cd rust
cargo check
```

The complete test and device flow is documented in [.github/SETUP.md](.github/SETUP.md).

## Project layout

```text
frontend/
  desktop/       Desktop controls and settings
  mobile/        Android-facing pairing and status UI
  web/client/    Browser playback fallback
  shared/        Shared TypeScript types and UI pieces
rust/src/
  audio/         Desktop audio capture
  discovery/     LAN discovery
  domain/        Shared Rust data types
  session/       Approval and session lifecycle
  signaling/     Local signaling
  web_client/    Desktop-served browser client
  webrtc_core/   WebRTC media flow
rust/plugins/    Native Android media integration
tests/            Core, desktop, Android, and latency tests
scripts/          Development and release helpers
```

## Privacy and security

Eko is built for local-network use. It does not require an Eko account, and it does not send the audio stream through a cloud relay. Keep in mind that local-network security still matters: only pair devices you trust, keep the desktop and Android app updated, and avoid sharing pairing links.

Read the [privacy policy](docs/Privacy_Policy.md) and [security policy](.github/SECURITY.md) before deploying Eko beyond a development network.

## Updates and releases

Desktop releases are published through [GitHub Releases](https://github.com/Noelithub77/eko/releases). Release assets and updater metadata are produced by the release workflow. Do not use an unofficial binary or replace the updater signing key without checking the release instructions.

## Contributing

Contributions are welcome. Please use the fork workflow: fork Eko into your account, create a branch on your fork, and open a pull request back to this repository. New contributors should not create working branches on the upstream repository.

Read [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md), [.github/CODE_OF_CONDUCT.md](.github/CODE_OF_CONDUCT.md), and [.github/SUPPORT.md](.github/SUPPORT.md) before opening a pull request or issue.

## Roadmap

The active work list is in [.github/TODO.md](.github/TODO.md). It includes real-device latency measurement, wider platform testing, and release hardening.

## License

Eko is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). If you distribute a modified version or make it available for users to interact with over a network, the AGPL's corresponding-source requirements apply.

Forks and modifications must keep the same AGPL license terms. See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for the collaboration rules.

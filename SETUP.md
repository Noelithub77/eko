# Eko Setup

## Requirements

- Rust and Cargo
- Node.js and npm
- Android Studio
- Android SDK
- Android NDK
- Android emulator or real Android phone

## Install Dependencies

```powershell
npm install
```

## Start Desktop Dev App

Runs the desktop UI through Vite. This is useful for quick UI preview only; native audio, signaling, and Tauri commands need the Tauri app.

```powershell
npm run dev:desktop
```

In another terminal, start the Tauri desktop app:

```powershell
npm run tauri -- dev
```

## Start Mobile Dev UI

Runs the Android/mobile UI through Vite.

```powershell
npm run dev:mobile
```

## Build Desktop UI

```powershell
npm run build:desktop
```

Output:

```text
dist/desktop/
```

## Build Desktop App

Builds the Windows desktop app and installer bundles.

```powershell
npm run tauri -- build --debug
```

Outputs:

```text
rust/target/debug/eko.exe
rust/target/debug/bundle/msi/eko_0.1.0_x64_en-US.msi
rust/target/debug/bundle/nsis/eko_0.1.0_x64-setup.exe
```

## Build Mobile UI

```powershell
npm run build:mobile
```

Output:

```text
dist/mobile/
```

## Build Android APK

Build x86_64 debug APK for emulator:

```powershell
npm run tauri -- android build --debug --apk --target x86_64
```

Output:

```text
rust/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

## Run Checks

TypeScript:

```powershell
node .\node_modules\typescript\bin\tsc --noEmit --pretty false
```

Rust desktop:

```powershell
cd rust
cargo check
```

Rust Android target:

```powershell
cd rust
cargo check --target x86_64-linux-android
```

Core session tests:

```powershell
npm run test:core
```

## Normal Manual Test Flow

1. Start the desktop app.
2. Click `Start Stream`.
3. Enable LAN discovery or show the QR code.
4. Install/open the Android app.
5. Scan QR or find the nearby host.
6. Approve the phone on desktop.
7. Confirm Android receives audio.

## Notes

- Final latency acceptance needs real Windows hardware plus a real Android phone.
- Emulator builds are useful for app wiring, but not for the under-100 ms latency target.
- Android playback is native Rust WebRTC receive, Rust Opus decode, and Oboe output.

# Eko — Audio Share for Chrome (Manifest V3)

> **One tab, every headphone.** Echo your browser tab or computer audio to any phone nearby over Wi-Fi. Watch movies or listen to music together while everyone listens on their own headphones with zero cables.

---

## Features

- **No Desktop Software Required**: Unlike the Tauri desktop app, friends can broadcast their YouTube, Netflix, Disney+, Spotify, or Twitch audio directly from Google Chrome!
- **Universal Phone Compatibility**:
  - **iPhones & Web Browsers**: Scan the QR code with the camera app and listen in Safari via Eko's web receiver (`https://eko.allpyq.in/client`).
  - **Android**: Listen via the native Eko Android APK or via Chrome.
- **Dynamic QR Pairing**: Generates an instant QR code and clickable pairing link in the popup.
- **Audio Visualizer**: Live real-time spectrum visualizer dancing to the active tab's audio.
- **Speaker Routing**: Keeps computer speakers active while broadcasting, with a one-click local mute toggle.
- **Device Approval Security**: The host decides who listens. Approve or deny incoming device requests or enable Auto-Approve.
- **Listen Mode**: Can also act as an Eko receiver inside Chrome to listen to any nearby Eko broadcast.
- **Persistent Offscreen Streaming**: Uses Chrome's `chrome.offscreen` API so streaming continues smoothly even when the popup closes or you switch tabs.

---

## How to Install and Test Locally in Chrome

1. Open Google Chrome.
2. Navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left toolbar.
5. Select the `eko-extension` directory:
   ```text
   C:\Users\Govindh Reddy\Documents\chrome\eko-extension
   ```
6. The **Eko — Audio Share** icon will now appear in your Chrome toolbar! (Click the puzzle piece icon to pin it).

---

## How to Broadcast Audio

1. Open a tab playing audio (e.g., [YouTube](https://youtube.com), Spotify Web, or Netflix).
2. Click the **Eko** extension icon in your toolbar.
3. Click **Start Broadcast**.
4. A pairing QR code will appear:
   - On an **iPhone**: Open the default Camera app, point it at the QR code, and tap the link to open the Eko web player in Safari.
   - On **Android**: Open the Eko APK scanner or open the pairing link in Chrome.
   - On another **Laptop**: Open the copied pairing link or paste it into Eko's Listen tab.
5. Tap **Approve** on the popup (or keep **Auto-Approve** enabled).
6. Listen through headphones!

---

## Architecture

```text
Chrome Active Tab (YouTube, Netflix)
          │
          ▼
Chrome tabCapture API / getUserMedia
          │
          ▼
Offscreen Document (AudioContext + Analyser + WebRTC Host)
          │                                  │
          ▼                                  ▼
Eko Cloudflare Relay                  WebRTC Data & Media Track
(https://eko.allpyq.in/v1/rooms)      (Direct P2P or Cloudflare TURN)
          │                                  │
          ▼                                  ▼
QR Pairing Link & Socket               Approved Phone / Headphones
```

---

## Packaging for Chrome Web Store

To build the release `.zip` file for the Chrome Web Store:

```powershell
powershell -ExecutionPolicy Bypass -File .\package.ps1
```

The resulting zip file is generated at:
```text
dist\eko-chrome-extension.zip
```

For publishing instructions and store review guidelines, see [PUBLISHING.md](file:///c:/Users/Govindh%20Reddy/Documents/chrome/eko-extension/PUBLISHING.md).

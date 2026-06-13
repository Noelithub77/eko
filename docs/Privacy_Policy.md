# Privacy Policy

**Last updated:** June 13, 2026

## Overview

Eko ("the App") is a local desktop-to-device audio relay application developed by **Codialo**. The App captures computer audio and streams it to approved devices on the same local network.

Eko is designed to work entirely **without accounts, cloud services, or internet access**. Your data stays on your local network and your devices.

## Data Collection

### Personal Information

Eko **does not collect, store, or transmit any personal information**. This includes:

- No names, email addresses, phone numbers, or postal addresses
- No account registration or login
- No user profiles or identity data
- No payment or financial information
- No IP addresses are logged or transmitted off the local network

### Analytics & Telemetry

Eko **does not include any analytics, telemetry, or crash reporting services** (e.g., Google Analytics, Sentry, Firebase, PostHog, or similar). No usage data, diagnostics, or error reports are sent to any remote server.

### Audio Content

Audio captured from your computer is streamed exclusively over your local LAN using WebRTC with DTLS-SRTP encryption. The audio content:

- Is never transmitted over the internet
- Is never recorded or stored
- Is never sent to any remote server
- Is only sent to devices you have explicitly approved via the desktop interface

## Data Stored Locally

The App stores the following data locally on your computer using standard OS application storage:

| Data | Purpose |
|------|---------|
| Developer mode setting | Persists your dev mode preference |
| Device labels (nicknames) | Stores custom names you assign to connected devices |
| Monitor event logs | Temporary operational logs for in-app monitoring |
| Update cache | Stores latest version info when you check for updates |

This data is stored in JSON files within the app's local data directory and is never uploaded anywhere. You can clear this data at any time by uninstalling the App or clearing its local storage.

## Network Communications

### Local Network Only

All audio streaming and device signaling happens exclusively over your local LAN:

- **WebRTC** (DTLS-SRTP encrypted) for audio streaming
- **WebSocket** (plaintext JSON over TCP) for signaling messages (join requests, permission approvals, WebRTC handshake)
- **mDNS** for local network device discovery

### QR Code Pairing

When you initiate a stream, the App generates a QR code containing a local network URL with a randomly generated session token. This token is used solely to scope the current session and is not associated with any user identity.

### Update Checks

The App can optionally check for updates by making a request to `github.com/rider-vader/eko/releases`. This is only performed when you explicitly click "Check for Updates" in the UI. The request reveals only standard HTTP information (your IP address, user agent) to GitHub's servers for the sole purpose of determining if a newer version is available.

### Cookies

The web client (served by the desktop app for browser fallback) uses a single cookie to persist the sidebar open/closed state. This cookie contains no tracking or personal data and is not used for any analytics purpose.

## Data Sharing

Eko **does not share any data with third parties**. There are no third-party SDKs, analytics providers, advertising networks, or data brokers integrated into the App.

## Data Security

- Audio streams use mandatory WebRTC encryption (DTLS-SRTP)
- All network communication stays within your local LAN
- Session access requires both physical QR code scanning or LAN proximity and explicit desktop approval
- There are no cloud servers, databases, or remote services involved in the App's core functionality

## Children's Privacy

Eko does not knowingly collect any personal information from children. The App is not directed at children under the age of 13.

## Changes to This Policy

If this privacy policy changes, the updated date at the top of this document will be revised. Since the App does not collect data, material changes would only reflect new functionality or regulatory requirements.

## Contact

For questions about this privacy policy or the App's data practices:

- **Developer:** Codialo
- **App identifier:** com.codialo.eko
- **Project website:** https://github.com/rider-vader/eko
- **Issues & inquiries:** https://github.com/rider-vader/eko/issues

## Microsoft Store Compliance

This privacy policy is provided in compliance with the Microsoft Store Policies regarding data collection and usage. As of the last updated date above, Eko collects no personal data, telemetry, or analytics, and transmits no user data off the local network except for optional user-initiated update checks.

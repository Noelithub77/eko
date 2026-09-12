# Privacy Policy

**Last updated:** September 13, 2026

## Overview

Eko ("the App") is a local desktop-to-device audio relay application developed by **Codialo**. The App captures computer audio and streams it to approved devices on the same local network.

Eko works without accounts. Local pairing and streaming can work without
internet access; the hosted browser path uses the Eko Cloudflare Worker for
signaling and Cloudflare TURN when direct WebRTC media cannot connect.

## Data Collection

### Personal Information

Eko **does not collect, store, or transmit any personal information**. This includes:

- No names, email addresses, phone numbers, or postal addresses
- No account registration or login
- No user profiles or identity data
- No payment or financial information
- Hosted signaling and TURN providers receive normal connection metadata needed
  to route the session, such as IP address and connection timing

### Analytics & Telemetry

Eko **does not include any analytics, telemetry, or crash reporting services** (e.g., Google Analytics, Sentry, Firebase, PostHog, or similar). No usage data, diagnostics, or error reports are sent to any remote server.

### Audio Content

Audio captured from your computer is streamed to approved devices using WebRTC
with DTLS-SRTP encryption. When direct ICE is unavailable, packets may pass
through Cloudflare TURN; the TURN service forwards encrypted WebRTC traffic and
does not receive the WebRTC media keys. The audio content:

- May be transmitted through an encrypted Cloudflare TURN path when direct LAN
  or peer-to-peer connectivity is unavailable
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

### Network Communications

When using local pairing, audio streaming and device signaling happen over the
local LAN. When using the hosted browser QR, the following services are used:

- **WebRTC** (DTLS-SRTP encrypted) for audio streaming
- **WebSocket** (plaintext JSON over TCP) for signaling messages (join requests, permission approvals, WebRTC handshake)
- **mDNS** for local network device discovery
- **Cloudflare Worker and Durable Object** for hosted room approval and WebRTC
  signaling
- **Cloudflare TURN** as an optional encrypted media relay when direct ICE fails

### QR Code Pairing

When you initiate a stream, the App generates a QR code containing a hosted
browser URL with a randomly generated room join token. This token scopes the
current session and is not associated with a user identity. Short-lived TURN
credentials are fetched after the browser authenticates to that room; they are
not embedded in the QR code.

### Update Checks

The App can optionally check for updates by making a request to `github.com/Noelithub77/eko/releases`. This is only performed when you explicitly click "Check for Updates" in the UI. The request reveals only standard HTTP information (your IP address, user agent) to GitHub's servers for the sole purpose of determining if a newer version is available.

### Cookies

The web client (served by the desktop app for browser fallback) uses a single cookie to persist the sidebar open/closed state. This cookie contains no tracking or personal data and is not used for any analytics purpose.

## Data Sharing

Eko does not sell or share data for advertising. The hosted browser path uses
Cloudflare as the configured signaling and TURN infrastructure provider.

## Data Security

- Audio streams use mandatory WebRTC encryption (DTLS-SRTP)
- Hosted WebRTC media remains DTLS-SRTP encrypted end-to-end between the Eko
  peers, including when Cloudflare TURN forwards the packets
- Session access requires both physical QR code scanning or LAN proximity and explicit desktop approval
- Hosted rooms and ephemeral TURN credentials are remote services used only by
  the hosted browser path

## Children's Privacy

Eko does not knowingly collect any personal information from children. The App is not directed at children under the age of 13.

## Changes to This Policy

If this privacy policy changes, the updated date at the top of this document will be revised. Since the App does not collect data, material changes would only reflect new functionality or regulatory requirements.

## Contact

For questions about this privacy policy or the App's data practices:

- **Developer:** Codialo
- **App identifier:** com.codialo.eko
- **Project website:** https://github.com/Noelithub77/eko
- **Issues & inquiries:** https://github.com/Noelithub77/eko/issues

## Microsoft Store Compliance

This privacy policy is provided in compliance with the Microsoft Store Policies
regarding data collection and usage. Eko collects no account profile data,
telemetry, or analytics. The hosted browser path necessarily sends connection
metadata and encrypted signaling/media packets through the configured
Cloudflare infrastructure.

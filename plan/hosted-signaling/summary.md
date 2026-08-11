# Hosted signaling

Eko uses a Cloudflare Worker and one Durable Object per active stream to exchange approval and WebRTC signaling messages. Audio remains a direct WebRTC connection and TURN is not configured.

The hosted QR is the normal browser path. Android races the local and hosted signaling handshakes, while LAN discovery and the desktop-served client remain available offline.

Production relay: `https://eko.noelmcv7.workers.dev`

Verified with relay tests, a public host/receiver WebSocket smoke test, desktop Cargo check, and an arm64 Android debug APK build.

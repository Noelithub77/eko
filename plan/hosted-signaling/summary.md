# Hosted signaling

Eko uses a Cloudflare Worker and one Durable Object per active stream to exchange approval and WebRTC signaling messages. Audio remains a direct WebRTC connection and TURN is not configured.

The desktop QR now defaults the browser to the local desktop-served client. The
browser tries local signaling first and falls back to hosted signaling when the
local socket cannot be reached. A hosted HTTPS page uses hosted signaling
directly because browsers block insecure local `ws://` connections from secure
pages. Android keeps its existing LAN-first selection. In every case, audio
remains a direct WebRTC connection.

Production relay: `https://eko.noelmcv7.workers.dev`

Verified with relay tests, a public host/receiver WebSocket smoke test, desktop Cargo check, and an arm64 Android debug APK build.

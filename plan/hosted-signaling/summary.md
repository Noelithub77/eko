# Hosted signaling

Eko uses a Cloudflare Worker and one Durable Object per active stream to
exchange approval and WebRTC signaling messages. The Worker generates
short-lived Cloudflare TURN credentials for the authenticated host and
receiver. WebRTC keeps `iceTransportPolicy: all`, so direct media is preferred
and TURN is selected when direct ICE cannot connect.

The desktop QR now points only to the hosted HTTPS browser client. The browser
authenticates to the room with its join token and fetches fresh TURN
credentials before creating its peer. The desktop authenticates with its host
token and fetches its own credentials. Android keeps its existing LAN-first
selection and is outside this web-client change.

Production relay: `https://eko.noelmcv7.workers.dev`

Verified with relay tests, the Cloudflare TURN credential endpoint, desktop
Cargo check, and the hosted web-client production build.

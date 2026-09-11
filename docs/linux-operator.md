# Linux operator diagnostics

The operator CLI is the fastest way to inspect a running Eko desktop process.
It is read-only and is intended for local debugging and agent automation.

Start the Linux desktop app first:

```bash
pnpm dev:desktop
```

Then use these commands from the repository root:

```bash
# Running app session, audio pipeline counters, peer states, and profiler
pnpm operator status

# In-memory browser/Android quality samples
pnpm operator profiler

# Last 120 lines of the Tauri log
pnpm operator logs

# Follow new lines while reproducing a connection
pnpm operator logs --follow

# Full JSON bundle for an agent or bug report
pnpm operator diagnostics > /tmp/eko-diagnostics.json

# Poll status; add --logs to include newly appended log lines
pnpm operator watch --logs
```

`status`, `profiler`, `diagnostics`, and `watch` emit JSON. This keeps the
output easy to parse without screen scraping. Use `EKO_LOG_PATH` when the log
is from an AppImage or a non-default Tauri data directory:

```bash
EKO_LOG_PATH=/path/to/eko.log pnpm operator logs --lines 300
```

The status response keeps the latest 20 session events and metrics. Use
`pnpm operator logs --lines 300` or the JSON diagnostics bundle for the full
disk log.

## What to look for

Audio must progress through these stages:

```text
audioFramesReceived -> audioFramesEncoded -> audioSamplesWritten
```

If `audioFramesReceived` stays at zero, inspect `pactl info`, the default sink,
and the monitor source in `diagnostics`. If received frames increase but
encoded or written samples do not, inspect the log for an Opus or WebRTC track
error.

For a connected receiver, `webrtc.peers[*]` should show:

- `peerConnectionState: "connected"`
- `iceConnectionState: "connected"`
- increasing `outboundAudioPackets` and `outboundAudioBytes`
- a non-empty `selectedCandidateType`, normally `host` on the local network

`checking` followed by `closed`, especially with “no candidate pairs”, means
ICE did not find a usable path. The host now gathers all ICE candidates rather
than restricting candidates to the address used in the QR code. The QR address
still selects the initial signaling/discovery path.

For the browser client, the desktop QR defaults to a local-network link. The
local web client tries local signaling first and falls back to hosted signaling
when the local socket cannot be reached. A QR opened from the hosted HTTPS page
uses hosted signaling directly because browsers block insecure `ws://` sockets
from secure pages. In both cases, audio remains direct WebRTC.

The browser shows a Sonner error toast when signaling, ICE, or browser audio
playback fails. The toast contains the short reason; the browser console and
the desktop operator log contain the detailed sequence. An ICE failure after
signaling means the relay exchanged negotiation messages successfully but no
direct media path was reachable.

## Log and system locations

On Linux, the default Tauri log is:

```text
~/.local/share/com.codialo.eko/logs/eko.log
```

The app also writes to stdout while running from `pnpm dev:desktop`. Recent
user-service messages are available with:

```bash
journalctl --user --since "24 hours ago" --no-pager -o short-precise
coredumpctl list --no-pager --reverse -n 10 eko
```

`pnpm operator diagnostics` collects these along with PipeWire/PulseAudio
state, network addresses/routes, listening sockets, app session state, and the
last log lines. It does not collect raw audio, SDP bodies, full ICE candidate
strings, tokens, or user-agent strings. ICE logs include candidate type,
address, port, and protocol so interface selection can be diagnosed.

The operator HTTP endpoint is `http://127.0.0.1:13370/__eko_operator`. It is
loopback-only; it is not a LAN debugging API. The existing
`/__eko_profiler` endpoint remains available to the web receiver for posting
and reading session profiler samples.

# Eko: Building a Desktop-to-Device Audio Relay with Rust, WebRTC, and Android

> Draft template for a Medium technical blog post. Replace bracketed prompts with your own story, screenshots, measurements, and links before publishing.

## Working title

**Eko: Building a Desktop-to-Device Audio Relay with Rust, WebRTC, and Android**

### Possible subtitle

How I turned a Bluetooth limitation into a local audio system, learned to treat pairing as an authorization problem, and debugged the difference between “audio is captured” and “audio can actually reach the receiver.”

### One-sentence promise to the reader

By the end of this post, the reader should understand how Eko moves audio from a desktop to approved devices, why the system is split across Rust, React, Android, and a hosted fallback, and what the project taught me about real-time systems.

---

## Index

1. [The short version](#1-the-short-version)
2. [The problem that started Eko](#2-the-problem-that-started-eko)
3. [What Eko is](#3-what-eko-is)
4. [The constraints I chose](#4-the-constraints-i-chose)
5. [The architecture](#5-the-architecture)
6. [Designing the audio path](#6-designing-the-audio-path)
7. [Pairing is not permission](#7-pairing-is-not-permission)
8. [Why the Android client is native](#8-why-the-android-client-is-native)
9. [The browser fallback and hosted networking](#9-the-browser-fallback-and-hosted-networking)
10. [The debugging story: when the audio pipeline was healthy but nothing played](#10-the-debugging-story-when-the-audio-pipeline-was-healthy-but-nothing-played)
11. [What I learned](#11-what-i-learned)
12. [Current status and honest limitations](#12-current-status-and-honest-limitations)
13. [What I would build next](#13-what-i-would-build-next)
14. [Closing](#14-closing)
15. [Medium publishing checklist](#15-medium-publishing-checklist)

### Diagram plan

Use approximately **nine diagrams** in the final article. That is enough to make the architecture and debugging story visual without turning the post into a slide deck.

1. Problem: one desktop source, several listeners.
2. Eko's user journey from pairing to playback.
3. High-level system architecture.
4. Audio pipeline from capture to speaker.
5. Session and approval state machine.
6. QR/LAN pairing and signaling sequence.
7. Native Android playback boundary.
8. Direct WebRTC path versus TURN fallback.
9. Debugging pipeline and evidence checkpoints.

Keep diagrams simple: boxes, arrows, short labels, and one idea per diagram. Draw them in Excalidraw and export them as PNG or SVG with readable text at Medium's inline width.

---

## 1. The short version

Open with the outcome in two or three paragraphs. This is the part a hiring manager should understand even if they only read the first screen.

**Draft prompt:**

> Eko is a local desktop-to-device audio relay. It captures computer audio on one desktop and streams it to multiple approved devices over WebRTC. The desktop remains the authority: discovering or scanning a device does not grant access until the desktop user approves it.
>
> I built Eko because [describe the moment or limitation that made the problem feel real]. The interesting part was not just sending bytes from A to B. I had to make audio capture, real-time transport, device discovery, authorization, native Android playback, and network failure handling work as one understandable system.

Add a compact project card here:

- Repository: `[GitHub link]`
- Status: `[current status]`
- Desktop: Tauri 2 + React UI + Rust core
- Receiver: native Android path, with browser fallback for iOS and modern browsers
- Transport: WebRTC audio, WebSocket signaling
- Pairing: QR code or LAN discovery, followed by desktop approval
- Current measured latency: `[measurement and test setup]`

### Optional hero visual

`[HERO IMAGE PLACEHOLDER]`

Show the desktop Eko window beside an Android phone playing the same source. If you do not have a good photo, use a clean Excalidraw-style illustration of one desktop sending to two devices.

---

## 2. The problem that started Eko

Explain the user problem before introducing implementation details.

### 2.1 The practical problem

**Draft prompts:**

- What were you trying to listen to?
- Why was one Bluetooth output not enough?
- What did existing solutions require that you did not want: special hardware, accounts, manual IP addresses, or platform-specific setup?
- Who is Eko for: a group in the same room, a personal multi-device setup, or both?

Be specific and personal. A strong opening sounds like a real engineering motivation, not a product requirements document.

### 2.2 The first version of the problem statement

> Given one desktop audio source, let trusted nearby devices join quickly and receive the same live audio with low enough delay to feel usable.

Then state the non-goals:

- Not a general-purpose music streaming service.
- Not an account-based cloud product.
- Not an attempt to replace Bluetooth LE Audio or Auracast where those are available.
- Not a browser-only Android experience.

### Excalidraw placeholder 01 — The problem space

**Draw:** One desktop audio source on the left, one Bluetooth speaker in the middle, and several phones/speakers on the right. Mark the single-output limitation in red, then show Eko as a local-network path that fans out to multiple approved receivers.

**Caption:** “Eko moves the fan-out problem from Bluetooth hardware constraints into software-managed local-network sessions.”

**Do not draw:** A claim that every network or every device will have identical latency.

---

## 3. What Eko is

Define the product in plain language before the architecture.

### 3.1 The user experience

Describe the happy path as a short numbered flow:

1. The desktop starts a stream.
2. Eko displays a QR code and can advertise the host on the LAN.
3. A receiver scans the code or finds the nearby host.
4. The desktop sees a pending device and approves it.
5. Eko establishes signaling and a WebRTC media connection.
6. The receiver plays the live audio.
7. The desktop can stop sharing, disconnect a device, or disable sharing for one device.

### 3.2 The important security boundary

Make this sentence prominent:

> Pairing identifies a device. Approval authorizes it.

This distinction is one of the strongest technical/product ideas in the project. Explain that a QR code or LAN discovery result is not enough to start receiving audio.

### Excalidraw placeholder 02 — From discovery to playback

**Draw:** A horizontal five-stage journey: `Discover → Request access → Desktop approves → WebRTC connects → Audio plays`. Put a lock icon between “Request access” and “Desktop approves.”

**Caption:** “The connection is not complete when the device is discovered; it is complete only after explicit approval and media setup.”

---

## 4. The constraints I chose

This section shows design judgment. Explain what you deliberately refused to build.

### 4.1 Product constraints

- No accounts for local use.
- No manual IP entry.
- Only QR pairing and LAN discovery.
- Desktop is the authority for approval and sharing.
- Android uses native playback instead of being redirected to the browser.
- Hosted services are a fallback for browser pairing and blocked direct media, not the default media path.

For each constraint, add one sentence explaining the user or engineering reason.

### 4.2 Technical constraints

- Audio must remain live rather than becoming a large buffered file transfer.
- Multiple receivers must be independent: one bad connection should not stop the others.
- The system must tell the difference between capture failure, encoding failure, signaling failure, ICE failure, and playback failure.
- The design must leave room for real-device measurements instead of treating a passing build as proof of a working stream.

### 4.3 The trade-off table

Fill in this table with your final reasoning. Keep it short.

| Decision | Why it fit Eko | Cost or limitation |
| --- | --- | --- |
| Tauri 2 for desktop and Android shell | `[fill in]` | `[fill in]` |
| Rust for audio, sessions, signaling, and WebRTC core | `[fill in]` | `[fill in]` |
| React for surface-specific UI | `[fill in]` | `[fill in]` |
| WebRTC for media transport | `[fill in]` | `[fill in]` |
| WebSocket for signaling | `[fill in]` | `[fill in]` |
| mDNS for LAN discovery | `[fill in]` | `[fill in]` |

Avoid turning this section into a package list. Explain the decisions in terms of the problem.

---

## 5. The architecture

Start with the simplest system diagram, then explain each boundary.

### 5.1 High-level structure

Use this as the first architecture paragraph:

> The desktop owns the session. Rust captures and prepares audio, manages discovery and approval, and creates one sender path per approved receiver. React renders the desktop and Android-facing screens. Android uses a native receiver path for playback. The browser client remains a fallback for iOS and modern browsers.

### Excalidraw placeholder 03 — High-level architecture

**Draw:**

```text
Desktop React UI
        ↓ typed commands/events
Rust core: capture · session · approval · signaling · WebRTC
        ├── approved Android receiver → native decode/playback
        └── browser fallback → browser WebRTC/audio
```

Add the hosted Worker and TURN service to the side, with a dashed boundary labelled “only for hosted browser path / direct media fallback.”

**Caption:** “Eko keeps authority and media orchestration in the desktop core while adapting playback to the receiver platform.”

### 5.2 Why Rust owns the core

Explain the ownership boundary:

- React handles screens, buttons, status, and user feedback.
- Rust owns the state that must remain authoritative: sessions, approval, signaling, capture, and transport.
- Native Android code owns the lifecycle and playback details that a browser UI cannot reliably own.

Mention the benefit of a typed command/event boundary and link to one representative file or commit: `[link]`.

### 5.3 One peer connection per approved receiver

Explain that multi-device streaming is not one magic broadcast socket. Eko creates an independent WebRTC path per approved receiver, which makes device-level control possible but increases desktop/network work as the receiver count grows.

Add your current tested receiver count and planned scale, without implying a benchmark you have not run.

---

## 6. Designing the audio path

This is the first deeply technical section. Keep the pipeline linear and explain what each stage guarantees.

### 6.1 The pipeline

Describe the path:

`Desktop output → OS loopback capture → PCM frames → Opus encoding → WebRTC audio track → receiver decode → native audio output`

Current implementation anchors to verify before publishing:

- Windows system-output capture uses WASAPI loopback.
- Audio is encoded as Opus at 48 kHz stereo with 20 ms packets.
- Rust feeds the WebRTC sender track.
- The Android receiver decodes natively and writes to Oboe audio output.

If any of these change before publication, update this section rather than describing the intended architecture.

### Excalidraw placeholder 04 — Audio pipeline

**Draw:** Seven boxes in a left-to-right flow. Under each box add one small “failure signal,” for example `frames = 0`, `encode error`, `ICE not connected`, or `samples not written`.

**Caption:** “A live audio system is a chain of independently failing stages; observability must follow the same chain.”

### 6.2 Why packet size and buffering matter

Explain, in your own words:

- Smaller packets can reduce waiting time but increase overhead and sensitivity to scheduling.
- Larger buffers can hide jitter but make controls feel delayed.
- A receiver that pauses should stop local playback and clear stale samples, then resume from the live edge instead of playing old buffered audio.

Add your actual target and measurement method:

- Target end-to-end latency: `[target]`
- Measurement method: `[how you measured source-to-device delay]`
- Test hardware and network: `[desktop, phone, Wi-Fi, OS versions]`
- Result: `[median / p95 / range]`

Do not publish a latency number until the test can be repeated.

### 6.3 The first useful proof

Describe the smallest milestone that proved the media path was real: `[for example, a known test tone or increasing encoded packet count]`.

Explain why that proof was stronger than “the button worked.”

---

## 7. Pairing is not permission

This section is where the product model and distributed-systems model meet.

### 7.1 Two ways to find a host

Explain the two entry points:

- QR pairing carries the compact room/host information needed to begin joining.
- LAN discovery lets a nearby client find an advertised Eko host.

Both paths converge on the same approval flow. Discovery is intentionally not authorization.

### 7.2 Session state

List the states you actually expose or intend to expose:

`Unknown → Join requested → Waiting for approval → Approved → Negotiating → Connected`

Also show the important exits:

`Denied`, `Disconnected`, `Stopped`, and `Retry required`.

### Excalidraw placeholder 05 — Approval state machine

**Draw:** A state diagram with `Join requested` and `Waiting for approval` on the left, `Approved` and `Denied` branching from the desktop decision, then `Negotiating → Connected`. Add `Stop stream` returning every active state to `Stopped`.

**Caption:** “Approval is a first-class session state, not a side effect of networking.”

### 7.3 The signaling sequence

Explain that WebSocket carries coordination rather than audio:

- receiver joins
- desktop receives a request
- desktop approves or denies
- host and receiver exchange SDP
- host and receiver exchange ICE candidates
- media begins only after approval and successful negotiation

### Excalidraw placeholder 06 — Pairing and signaling sequence

**Draw:** A sequence diagram with four vertical lanes: `Receiver UI`, `Desktop UI`, `Rust session`, and `Signaling server`. Add a separate WebRTC media arrow below the signaling arrows and label it “audio does not travel through WebSocket.”

**Caption:** “Signaling sets up the path; WebRTC carries the audio.”

### 7.4 Failure cases worth showing

Include one short example for each:

- A device is discovered but denied.
- A previously denied device remains blocked until explicitly unblocked.
- The desktop stops the stream while a receiver is connected.
- One receiver disconnects while another remains healthy.

Link to the relevant session test or code: `[link]`.

---

## 8. Why the Android client is native

Explain this as a platform decision, not a preference.

### 8.1 The browser temptation

It would have been easier to make every phone open a browser page. That is useful for a fallback, but it makes Android playback lifecycle, background behavior, audio focus, media controls, and stale buffering harder to control.

### 8.2 The Android boundary

Describe the split:

- React shows scan, discovery, approval, connection, and error states.
- Native Android/Rust receives the media and owns playback.
- Media controls and background behavior are anchored to the native media service where supported.

Be precise about what has been tested. Do not claim durable background playback unless it has been tested under Android background limits.

### Excalidraw placeholder 07 — Android playback boundary

**Draw:** Three layers: `React/Tauri UI`, `native bridge + media service`, and `Rust receiver → decoder → Oboe output`. Mark UI events such as `pause`, `resume`, and `stop` crossing the bridge, and mark the audio stream bypassing the React UI.

**Caption:** “The UI controls playback, but it is not the playback engine.”

### 8.3 What I learned from mobile startup failures

Use this as a learning-story slot. Explain the actual failure, not just the fix:

> `[Describe the Android startup failure caused by work that was safe on desktop but unsafe during mobile startup. Explain how moving code generation/export out of the mobile runtime changed the failure boundary.]`

Include a small before/after table:

| Before | After |
| --- | --- |
| `[startup behavior]` | `[startup behavior]` |
| `[why it failed]` | `[why it is safer]` |

---

## 9. The browser fallback and hosted networking

Keep this section focused: the hosted path exists to extend reach, not to obscure the local-first design.

### 9.1 Why a fallback exists

The Android app is the preferred receiver. A hosted browser client gives iOS and modern browsers a way to participate without installing the Android app.

### 9.2 Direct media first, relay when needed

Explain the network layers:

- Hosted signaling exchanges room and WebRTC setup messages.
- WebRTC first attempts a direct path.
- When direct ICE cannot connect, a TURN relay can forward encrypted WebRTC packets.
- The relay sees connection metadata and encrypted traffic, not the WebRTC media keys or readable audio content.

### Excalidraw placeholder 08 — Direct path versus TURN fallback

**Draw:** Two parallel paths from `Desktop` to `Browser receiver`:

1. Solid green path: `direct ICE → encrypted WebRTC audio`.
2. Dashed amber path: `Cloudflare signaling → short-lived TURN credentials → TURN relay → encrypted WebRTC audio`.

Label signaling and media separately. Put the phrase “direct preferred; relay only when needed” in the center.

**Caption:** “Cloud infrastructure helps establish or relay the connection; it is not the default audio destination.”

### 9.3 The privacy and cost trade-off

Write plainly about the trade-off:

- Local direct media is the preferred path for low latency and fewer external dependencies.
- TURN improves connectivity when networks block direct media.
- TURN introduces relay bandwidth, operational cost, and provider metadata.
- Credentials are short-lived and should never be placed in QR payloads, browser bundles, logs, or screenshots.

Link the privacy policy and hosted signaling code: `[links]`.

---

## 10. The debugging story: when the audio pipeline was healthy but nothing played

This should be the strongest section in the article. Readers remember a concrete incident more than a list of technologies.

### 10.1 The misleading symptom

Open with the observed symptom:

> `[Example: the connection looked like it started, but the receiver produced no audio.]`

Then state the tempting wrong conclusion: `[for example, “capture must be broken”]`.

### 10.2 Follow the evidence through the pipeline

Use the project’s counters as a causal chain:

`audioFramesReceived → audioFramesEncoded → audioSamplesWritten`

Interpret them explicitly:

- If received frames stay at zero, inspect the OS capture source.
- If received frames increase but encoded or written samples do not, inspect the encoder or WebRTC track.
- If the audio counters are healthy but ICE has no usable pair, the problem is connectivity rather than capture.
- If ICE connects and outbound bytes increase but the receiver is silent, inspect receiver decode, playback state, and audio output.

### Excalidraw placeholder 09 — Debugging evidence checkpoints

**Draw:** A pipeline with checkpoints under every stage. Put green counters under healthy stages and a red break at the actual failure point from your incident. Beside the break, write the evidence that proved it: `[exact state/log/metric]`.

**Caption:** “The fastest diagnosis came from identifying the first stage that stopped making progress.”

### 10.3 The ICE lesson

Explain the key insight in accessible language:

> Signaling can succeed while media connectivity fails. A WebSocket connection proves that the peers exchanged setup messages; it does not prove that WebRTC found a usable media path.

If you use the real incident, include the state transition and its meaning:

`checking → no candidate pairs → closed`

Explain what changed: `[for example, broader candidate gathering, firewall/interface investigation, or TURN fallback]`.

### 10.4 Better diagnostics changed the development loop

Describe why structured operator diagnostics were useful. Mention only the fields that help the reader reason about the stream:

- peer and ICE state
- selected connection path
- outbound packets and bytes
- latency, jitter, buffer, and packet loss samples
- audio pipeline counters

State what you deliberately do not log: raw audio, SDP bodies, ICE candidate strings, tokens, or full user-agent strings.

### 10.5 The lesson about proof

Add a short “what did not count as proof” list:

- A successful build did not prove playback.
- A visible QR code did not prove authorization.
- A connected WebSocket did not prove media connectivity.
- Available TURN credentials did not prove that TURN was selected.
- An emulator result did not prove real-phone latency.

This is excellent resume material because it demonstrates how you validate systems rather than only assemble them.

---

## 11. What I learned

Turn implementation details into transferable lessons. Aim for five to seven lessons, each with a concrete Eko example.

### Lesson 1: Real-time systems are chains, not features

`[Explain how capture, encoding, signaling, ICE, decoding, and playback can fail independently.]`

### Lesson 2: Authorization should be modeled explicitly

`[Explain why discovery and approval became separate states.]`

### Lesson 3: Native boundaries are product decisions

`[Explain why Android playback needed native ownership while the UI could stay shared.]`

### Lesson 4: Prefer evidence that follows causality

`[Explain why stage counters and selected ICE stats beat vague “connected” labels.]`

### Lesson 5: Direct networking and hosted fallback can coexist

`[Explain how local-first behavior and TURN fallback serve different failure modes.]`

### Lesson 6: Type safety is most valuable at boundaries

`[Explain the Rust/TypeScript command and event boundary, and any bug it prevented.]`

### Lesson 7: “Works on my machine” is not a measurement

`[Explain the difference between desktop/Linux/emulator validation and real target-device proof.]`

For each lesson, use this mini-format:

1. What happened.
2. What I initially assumed.
3. What the evidence showed.
4. What I changed in the design or workflow.
5. What I would do earlier next time.

---

## 12. Current status and honest limitations

Do not hide unfinished work. A resume blog is stronger when it clearly separates shipped behavior from pending validation.

### Working today

- `[confirmed feature]`
- `[confirmed feature]`
- `[confirmed feature]`

### Still being validated

- First real setup-time measurement.
- Repeatable end-to-end latency measurement on real Windows hardware and a real Android phone.
- Final Windows capture backend choice after comparing the tested options.
- Multi-device scaling limits.
- Background playback behavior under Android limits.

### Validation table

| Claim | Evidence | Confidence / next test |
| --- | --- | --- |
| Desktop captures system audio | `[test/log/video]` | `[high/medium/low]` |
| Approved Android device receives audio | `[real-device evidence]` | `[next test]` |
| Direct LAN path works | `[selected candidate evidence]` | `[next test]` |
| TURN fallback works | `[relay test / selected relay evidence]` | `[next test]` |
| Latency is under target | `[repeatable measurement]` | `[next test]` |

This table prevents accidental overclaiming and gives readers a credible view of the project.

---

## 13. What I would build next

Keep this roadmap short and technically meaningful.

1. Add repeatable real-device latency and setup-time measurements.
2. Add clearer development graphs for latency, jitter, buffer, packet loss, state changes, and errors.
3. Expand automated coverage for approval, denial, unblock, disconnect, and stop-stream cleanup.
4. Test multi-device behavior under realistic Wi-Fi conditions.
5. Harden release and update flows after the media path is stable.

For each item, add why it matters and how you would measure success.

---

## 14. Closing

End with a concise reflection rather than a generic “thanks for reading.”

**Draft prompt:**

> Eko started as a way to make one desktop audio source useful across several nearby devices. It became a lesson in where real-time systems actually break: not only in the audio code, but at the boundaries between platforms, permissions, signaling, network paths, and evidence.
>
> The most important result was not a single framework choice. It was learning to ask which stage had actually made progress, which device was truly authorized, and which test had really proved the user-facing behavior.
>
> `[Add your final personal sentence: what Eko changed about how you build software.]`

End links:

- Source code: `[GitHub repository]`
- Demo video: `[link]`
- Architecture notes: `[link]`
- Relevant issue or write-up: `[link]`

---

## 15. Medium publishing checklist

### Drafting order

Write in this order, even if the final article is read from the top:

1. Debugging story.
2. Architecture and audio path.
3. Motivation and product constraints.
4. Lessons learned.
5. Current status and conclusion.

This keeps the article grounded in a real problem instead of becoming a technology tour.

### Recommended final shape

- Target length: `[1,800–2,800 words]` for one focused article; split into a series if the debugging story needs more room.
- One clear title and subtitle.
- A strong first-screen hook.
- Nine diagrams maximum unless each one earns its place.
- Short paragraphs, usually two to four lines on desktop.
- Code only when it explains a design choice; link to the full implementation.
- Use captions under every diagram.
- Put the repository and demo near the beginning and end.
- Mention unfinished validation directly instead of burying it in a footnote.

### Diagram export checklist

- Use a consistent color meaning: blue for components, green for healthy flow, amber for fallback, red for failure, purple for authority/security.
- Use the same names in diagrams and prose: `Desktop`, `Rust core`, `Android receiver`, `Browser client`, `Signaling`, and `TURN`.
- Keep text large enough to read in Medium's inline image view.
- Export both the editable Excalidraw source and a web image.
- Name files in article order, for example:

```text
blog/diagrams/
├── 01-problem-space.excalidraw
├── 02-discovery-to-playback.excalidraw
├── 03-high-level-architecture.excalidraw
├── 04-audio-pipeline.excalidraw
├── 05-approval-state-machine.excalidraw
├── 06-pairing-signaling-sequence.excalidraw
├── 07-android-playback-boundary.excalidraw
├── 08-direct-vs-turn.excalidraw
└── 09-debugging-checkpoints.excalidraw
```

### Final fact check before publishing

- [ ] Every latency or setup-time number includes hardware, network, and measurement method.
- [ ] “Connected” means media was actually verified, not only that signaling succeeded.
- [ ] Android claims distinguish emulator tests from real-device tests.
- [ ] TURN claims distinguish configured fallback from a relay path observed in selected ICE stats.
- [ ] No secrets, pairing tokens, private IPs, raw audio, or sensitive logs appear in screenshots.
- [ ] The repository link, demo link, and license are correct.
- [ ] The final article says what is complete, what is experimental, and what is next.

### Suggested Medium tags

`Rust`, `WebRTC`, `Android Development`, `Tauri`, `Real-Time Systems`

Use tags that match the final article, not every technology in the repository.

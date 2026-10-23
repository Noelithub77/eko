# eko Chrome extension privacy policy

Last updated: October 23, 2026

The eko Chrome extension shares this tab or system audio with listeners you
approve. It is developed by Codialo and is open source at
https://github.com/Noelithub77/eko. It has no eko account system, advertising
trackers or product analytics.

## Tab access and audio

After you choose Start sharing, eko captures audio from the selected tab. It
reads the tab identifier, title and URL to select a supported tab and display
the title locally. If you choose system audio instead,
Chrome's own share picker asks which screen to share; eko sends only its audio
and discards the picture immediately. The extension does not read your browsing
history, inject scripts into page content or capture your microphone.

Captured audio is transmitted to listeners only after you explicitly approve
them. WebRTC encrypts the audio between the sending and receiving peers using
DTLS-SRTP. When a direct connection cannot be established, Cloudflare TURN may
relay the encrypted packets. The TURN relay does not receive the peers' media
decryption keys. eko does not record or persist captured audio.

## Hosted pairing and signaling

The extension contacts https://eko.allpyq.in/ to create a room, exchange session
and connection messages over HTTPS and secure WebSockets, and obtain short-lived
TURN credentials. Signaling includes temporary room and receiver identifiers,
receiver display names, approval state and WebRTC connection descriptions.
Connection descriptions can contain network addresses.

The hosted eko service and Cloudflare process network information needed to
operate these connections, including IP addresses, session timing and relay
traffic volume. These are infrastructure operations, not eko product analytics.
Hosted room state is temporary and expires after the session ends or its room
expiry period is reached. Infrastructure providers may retain operational
records under their own policies.

Sharing a pairing link or QR code shares the room's temporary join capability.
It does not approve a listener; approval still happens in the host popup.

## Local state and controls

The extension stores its light/dark theme preference in local extension storage.
Active capture, session credentials and peer state are held in memory rather
than written to persistent extension storage. The popup can display the pairing
link and current listener names and approval states while sharing is active.

You can deny listener requests, disconnect listeners or stop sharing. Stopping
releases the captured audio track and ends the extension's session connections.
Muting the computer affects its local output; it does not stop an approved
listener's stream. Uninstalling removes the extension's local settings.

## Use and disclosure

Audio and session information are used to provide the sharing session you
request. Approved receivers receive the audio, and the hosted service processes
signaling and connection metadata as described above. eko does not sell user
data, use it for advertising, or use it to determine creditworthiness or lending
eligibility. eko's use and transfer of information received through Chrome APIs
follows the Chrome Web Store User Data Policy, including its Limited Use
requirements.

## Contact and changes

Questions and requests can be submitted at
https://github.com/Noelithub77/eko/issues. Updates to this policy will be published
with a revised date. This policy covers the Chrome extension; the project's
general privacy policy describes the native desktop and Android applications.

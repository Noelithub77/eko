# Chrome Web Store draft

Item: `ahgbjnbhopbkifeopefgmfjckbbafndm` (eko). This file prepares the listing;
it does not establish that console fields are saved or the item is published.

## Listing fields

- Name: eko
- Summary: Share this tab or system audio from Chrome with approved eko listeners.
- Language: English
- Suggested category: Entertainment (confirm the available console category).
- Website: https://eko.allpyq.in/
- Support: https://github.com/Noelithub77/eko/issues
- Privacy: use a publicly reachable copy of [privacy.md](privacy.md). The upstream
  `main` URL becomes valid only after this file is merged; verify it before saving.

## Description

Share the sound from Chrome with listeners you approve.

Start sharing from a music, video or other audio tab. Open eko, share the pairing
code or link, then allow each listener before they receive audio.

• Share this tab, or choose an entire screen with system audio in Chrome's picker.
• Approve or deny each listener.
• Keep listening on your computer, or mute its local playback.
• Stop sharing from the popup.
• Choose a light or dark theme.

eko uses encrypted WebRTC audio. Connections use a direct path when available;
Cloudflare TURN can relay encrypted audio when a direct connection cannot be
established. The extension uses the hosted eko service for pairing and signaling,
so an internet connection is required.

Requires Chrome 116 or later and a compatible eko receiver. Protected pages and
some protected media may not support tab capture. System audio depends
on your operating system and Chrome version. Chrome on Linux supports tab audio;
use the eko desktop app for system audio there. eko does not capture your
microphone or record your audio.

## Assets

Regenerate with `pnpm ops extension:assets --json`. It uses the installed
Playwright browser and an isolated local Vite preview; it does not drive the
user's browser or contact the hosted room service.

| Console field | File | Dimensions |
| --- | --- | --- |
| Icon | `assets/icon-128.png` | 128 × 128 |
| Small promo | `assets/promo-small.png` | 440 × 280 |
| Marquee promo | `assets/promo-marquee.png` | 1400 × 560 |
| Screenshot 1 | `assets/01-share.png` | 1280 × 800 |
| Screenshot 2 | `assets/02-approve.png` | 1280 × 800 |
| Screenshot 3 | `assets/03-controls.png` | 1280 × 800 |

Screenshots render the actual popup with sample session data. The QR encodes an
inactive sample room. They show interface states, not proof of physical audio
playback, Android compatibility, Safari or forced TURN.

## Privacy practices

Single purpose: Share this Chrome tab's audio or system audio from a selected screen
with eko listeners after explicit host approval.

Permission justifications:

- `tabCapture`: Capture the selected tab's audio only after the user chooses
  Start sharing. The captured track supplies the encrypted WebRTC stream.
- `offscreen`: Maintain the audio stream, local playback and WebRTC connections
  in an offscreen document while the popup is closed. Chrome's service worker
  cannot own these document-based audio APIs. For system audio,
  this document opens Chrome's own share picker; only
  the audio of the source the user selects there is sent, and the picture is
  discarded immediately.
- `activeTab`: Identify the tab selected when the user invokes eko, check whether
  it is a supported web tab and show its title in the popup. No browsing-history
  collection or page-content injection is used.
- `https://eko.allpyq.in/*`: Create and authenticate the sharing room, exchange
  session and WebRTC signaling with approved listeners, and request short-lived
  TURN credentials from the hosted eko service.

Remote code: The extension executes bundled scripts only. The hosted receiver
opens in an ordinary browser tab; it is not downloaded code executed inside the
extension. Network signaling messages and TURN credentials are data.

Data disclosures must reflect audio transferred to approved listeners, receiver
names and identifiers in session signaling, and normal network metadata processed
by the hosted infrastructure. Do not declare that no data is transmitted merely
because eko has no accounts or analytics. Match the console's actual data-type
definitions before selecting checkboxes; ask Noel about any unresolved
publisher-level declaration.

Reviewer instructions: Open a normal web tab with audio, click eko and choose
Start sharing. Open its pairing link in a second browser/device with a compatible
receiver, request access and allow that listener in the host popup. Verify that
audio is unavailable before approval and that Stop ends sharing. No login or
paid account is required. Sample store screenshot QR codes are inactive.

## References

- [Image requirements](https://developer.chrome.com/docs/webstore/images)
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)

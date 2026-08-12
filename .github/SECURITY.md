# Security policy

## Supported versions

Eko is in early development. Security fixes are made against the latest release and the `main` branch when practical.

| Version | Support |
| --- | --- |
| Latest release | Supported |
| Older releases | Best effort only |
| Development builds | Use with care |

## Reporting a vulnerability

Please do not open a public issue for a security vulnerability. Use GitHub's private security advisory form in the repository's **Security** tab. If private advisories are not available, contact the maintainers privately through GitHub and include only the minimum details needed to reproduce the problem.

Please include:

- The affected release or commit.
- The platform and device involved.
- A short description of the impact.
- Safe reproduction steps or a minimal proof of concept.
- Any mitigation you already know.

Never include passwords, tokens, private keys, pairing links, personal data, or real audio in a report.

We will acknowledge a report when possible, investigate it, and coordinate a fix or mitigation before public disclosure. Please allow maintainers reasonable time to respond.

## Security boundaries

- Pairing is not approval. The desktop must approve a receiving device.
- Keep pairing links private.
- Do not run untrusted binaries or replace release signing material.
- The optional hosted signaling service is not intended to carry the audio stream.

# File structure

- `extension/`: React popup and receiver entry points, extension background/offscreen code and manifest assets.
- `frontend/desktop/features/pairing/QrPairingCard.tsx`: reusable desktop pairing UI with platform-specific link opening supplied by the caller.
- `vite.config.ts`: extension entries alongside existing platforms, using one dependency installation.
- `tests/extension/`: protocol regressions and popup interaction coverage.
- `docs/chrome-extension.md`: setup, audit findings and verification boundaries.

# File ownership

- `frontend/shared/components/receiver/`: shared card, waveform and quality view.
- `frontend/shared/types/connection-quality.ts`: quality fields used by both clients.
- `frontend/web/client/`: browser media lifecycle and browser quality collection.
- `frontend/mobile/`: native events, pairing flow and native command calls.
- `rust/src/mobile_receiver/`: native signaling commands, playback and UI telemetry.
- `rust/src/domain/receiver.rs`: generated native receiver event contract.
- `rust/src/eko_media.rs` and `rust/plugins/eko-media/android/`: media-session controls.
- `frontend/desktop/features/pairing/`: startup placeholder and QR rendering state.
- `tests/desktop/`: headless receiver and QR interaction fixtures.

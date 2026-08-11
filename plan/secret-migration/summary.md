# Release secret migration

## Decision

Move release credentials from tracked files into GitHub Actions Secrets and
Variables. Remove secret-bearing generated Android files and rewrite Git
history to remove them from every ref.

## Secret storage

- `TAURI_SIGNING_PRIVATE_KEY` -> GitHub Actions Secret
- `ANDROID_KEY_PASSWORD` -> GitHub Actions Secret
- `ANDROID_KEYSTORE_BASE64` -> GitHub Actions Secret
- `PUBLIC_UPDATE_BASE_URL` -> GitHub Actions Variable
- `ANDROID_KEY_ALIAS` -> GitHub Actions Variable

The Worker has no configured secrets and does not need changes for this task.

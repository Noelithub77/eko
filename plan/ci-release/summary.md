# CI release summary

Eko uses a manual release workflow with separate target checkboxes. Build-only validation is described in `docs/platform-builds.md`.

Targets:

- `windows-exe`
- `linux-appimage`
- `android-apk`
- `android-aab`

`package.json` is the release version source. The workflow can minor bump it, sync derived Tauri and Cargo versions, commit the bump, create `eko-v<version>`, and upload the selected build output.

Android setup requests `platform-tools` explicitly; the setup action's old default also requests Google's removed `tools` package and fails before compilation.

Desktop updater files are signed by Tauri and served from GitHub Releases through `latest.json`. Android APK and AAB files are uploaded as release assets, but Android app updating is not handled by the Tauri desktop updater.

Release credentials live in GitHub Actions secrets and variables. The Android keystore is stored as a base64 secret because the real keystore is a binary file and Actions secrets are text.

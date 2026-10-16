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

## Background audio release and macOS beta

**[chosen]** Noel approved a signed public release after the receiver fixes, plus a macOS-only ScreenCaptureKit 11 dependency. Use the existing minor-release convention for v0.5.0; sync package, Cargo, lockfile and Tauri versions before creating the exact isolated build snapshot. Dispatch the signed Windows/Linux/Android release from that snapshot with automatic version bump disabled so the tag and built source agree.

**[chosen]** Build macOS separately through `build/macos/…` and retain it as an unsigned beta DMG. No Apple signing/notarization credentials are configured. A build is not permission or physical audio proof. `docs/macos-beta.md` records implementation and acceptance boundaries.

Keep pnpm, Rust and Gradle caches; use distinct platform keys, allow Gradle cache writes on the build reference, and request APK/AAB together so Android compilation is shared. Do not clean caches or publish the local branch's unrelated older history.

Release preparation keeps the new version as a draft until every selected target succeeds. Finalization verifies expected nonempty packages/signatures and writes one combined Windows/Linux updater manifest before publication. This removes the prior race where platform jobs could overwrite `latest.json` with only one platform.

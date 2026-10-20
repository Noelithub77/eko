# CI release summary

Eko uses a manual release workflow with separate target checkboxes. Build-only validation is described in `docs/platform-builds.md`.

Targets:

- `windows-exe`
- `linux-appimage`
- `macos-dmg` (unsigned Apple Silicon beta)
- `android-apk`
- `android-aab`

`package.json` is the release version source. The workflow can minor bump it, sync derived Tauri and Cargo versions, commit the bump, create `eko-v<version>`, and upload the selected build output.

Android setup requests `platform-tools` explicitly; the setup action's old default also requests Google's removed `tools` package and fails before compilation.

Windows/Linux updater files are signed by Tauri and served from GitHub Releases through `latest.json`. The unsigned macOS beta DMG and Android APK/AAB files are release assets without Tauri updater targets.

Release credentials live in GitHub Actions secrets and variables. The Android keystore is stored as a base64 secret because the real keystore is a binary file and Actions secrets are text.

## Background audio release and macOS beta

**[chosen]** Noel approved a signed public release after the receiver fixes, plus a macOS-only ScreenCaptureKit 11 dependency. Use the existing minor-release convention for v0.5.0; sync package, Cargo, lockfile and Tauri versions before creating the exact isolated build snapshot. Dispatch the signed Windows/Linux/Android release from that snapshot with automatic version bump disabled so the tag and built source agree.

**[chosen]** Include macOS in public releases through the optional `macos_dmg` input, default false. Reuse the existing macOS build pattern and approved ScreenCaptureKit dependency on `macos-latest`, with the explicit `aarch64-apple-darwin` target. Upload `eko_<version>_aarch64.dmg` to the same draft release. No Apple signing/notarization credentials or dependencies are added. Only this unsigned beta build disables updater artifacts; Windows/Linux signing stays unchanged. Build-only `build/macos/…` validation remains available. A build is not permission or physical audio proof. `docs/macos-beta.md` records implementation and acceptance boundaries.

Keep pnpm, Rust and Gradle caches; use distinct platform keys, allow Gradle cache writes on the build reference, and request APK/AAB together so Android compilation is shared. Do not clean caches or publish the local branch's unrelated older history.

Release preparation keeps the new version as a draft until every selected target succeeds. Finalization verifies expected nonempty packages/signatures and writes one combined Windows/Linux updater manifest before publication. This removes the prior race where platform jobs could overwrite `latest.json` with only one platform. Selected macOS requires a nonempty DMG, without a signature or updater target. Finalization preserves existing notes and adds one macOS beta download link before publication, without marking the whole release as a prerelease. macOS-only releases do not upload an updater manifest. Missing/empty assets or failed selected builds prevent publication; existing empty-release cleanup also includes macOS build failures.

## Snapshot branch cleanup

**[chosen]** Share one guarded cleanup implementation between `pnpm ops platforms cleanup --ref build/NAME [--dry-run] --json` and a default-branch `workflow_run` listener for successful `Platform builds`/`Release` completion. Keep failed/running refs for diagnosis, reject protected or moved refs, page all branch workflows, delete only with an explicit SHA lease, and read back absence. This avoids duplicating safety logic; it needs Git deletion credentials as well as Actions read access. The REST delete endpoint has no expected-SHA parameter.

Automatic cleanup uses default-branch code and the event file, with no triggering-branch checkout, artifact download or build cache restore. Tags, releases, artifacts and caches remain untouched. Use the manual command to remove older completed snapshot branches. See `docs/platform-builds.md` for outcomes, pagination bounds and the workflow-dispatch race between the last read and deletion.

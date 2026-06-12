# CI Release Summary

Eko uses one manual GitHub Actions workflow with a target dropdown.

Targets:

- `windows-exe`
- `linux-appimage`
- `android-apk`
- `android-aab`

`package.json` is the release version source. The workflow can patch bump it, sync derived Tauri and Cargo versions, commit the bump, create `eko-v<version>`, and upload the selected build output.

Desktop updater files are signed by Tauri and served from GitHub Releases through `latest.json`. Android APK and AAB files are uploaded as release assets, but Android app updating is not handled by the Tauri desktop updater.

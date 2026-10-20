# Android build verification

Build an arm64 debug APK locally from the repository root. This compiles the
mobile frontend, native Rust receiver and Kotlin media plugin, then packages the
app. It does not install the app or publish a release.

On this Linux setup, use the installed Java 17 and the Android SDK's CMake 3.22.1:

```sh
rustup target add aarch64-linux-android

export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006"
export ANDROID_NDK_HOME="$NDK_HOME"
export ANDROID_NDK_ROOT="$NDK_HOME"
export CMAKE="$ANDROID_HOME/cmake/3.22.1/bin/cmake"

CARGO_TARGET_DIR="$PWD/rust/target/android-dev" CARGO_BUILD_JOBS=2 \
  pnpm tauri android build --apk --debug --target aarch64 --ci
```

Adjust the SDK/NDK paths if they are installed elsewhere. Keep the Android target
cache separate from `rust/target/desktop-dev`. Tauri's native build generates
`rust/gen/android/tauri.settings.gradle` and `app/tauri.build.gradle.kts`; an
existing customized Android project does not need to be reinitialized when these
generated files are missing.

The APK is written to:

```text
rust/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

Two local toolchain failures were encountered during receiver UI verification:

- System CMake 4.4.3 rejected the bundled Opus project's old minimum policy version.
  Selecting the SDK's CMake 3.22.1 lets the existing dependency compile.
- Android Studio's bundled Java 25 failed in Gradle 8.14.3 with
  `Unsupported class file major version 69`. The installed Java 17 is used instead.

These variables affect the current terminal/build only. No global Java or CMake
configuration needs to change. Preserve Cargo and Gradle caches between attempts.

An APK build proves compilation and packaging. Native audio, notification controls,
background lifecycle and physical output still require a device test. Debug-signed
validation packages are separate from production-signed public releases.

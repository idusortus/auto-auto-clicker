#!/usr/bin/env bash
#
# build-apk.sh — build an installable Android APK from the mobile/ Expo workspace.
#
# Primary, account-free path (design D1):
#   1. `expo prebuild --platform android` regenerates the native project from app.json
#      (Expo CNG; no `--clean`, so the existing debug keystore is preserved — design D5).
#   2. Gradle `assembleRelease` builds a release APK, signed with the auto-generated
#      debug keystore. The generated android/app/build.gradle already wires
#      `signingConfigs.debug` into the release build type, so no generated-file edits
#      and no `-Pandroid.injected.signing.*` flags are required (see docs below).
#   3. The APK is copied to mobile/dist/auto-auto-clicker.apk.
#
# No Expo account and no EXPO_TOKEN are needed for this path. `eas.json` is an
# optional alternative and is NOT used here.
#
# Required toolchain (see docs/android-setup-todo.md):
#   - JDK 17            (JAVA_HOME, default $HOME/jdk-17)
#   - Android SDK       (ANDROID_HOME, default $HOME/android-sdk) with
#                       platforms;android-36, build-tools;36.0.0, platform-tools
#
set -euo pipefail

# --- Resolve paths -----------------------------------------------------------
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$MOBILE_DIR"

OUTPUT_DIR="$MOBILE_DIR/dist"
OUTPUT_APK="$OUTPUT_DIR/auto-auto-clicker.apk"
GRADLE_APK="$MOBILE_DIR/android/app/build/outputs/apk/release/app-release.apk"

# --- Resolve JAVA_HOME / ANDROID_HOME ----------------------------------------
# Prefer already-exported env; fall back to the documented user-space locations.
if [ -z "${JAVA_HOME:-}" ]; then
  if [ -x "$HOME/jdk-17/bin/java" ]; then
    export JAVA_HOME="$HOME/jdk-17"
    echo "[build-apk] JAVA_HOME not set; using $JAVA_HOME"
  else
    echo "[build-apk] WARNING: JAVA_HOME is not set and $HOME/jdk-17/bin/java was not found." >&2
    echo "[build-apk] Install a JDK 17 (see docs/android-setup-todo.md) or export JAVA_HOME." >&2
  fi
fi

if [ -n "${JAVA_HOME:-}" ]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -d "$HOME/android-sdk" ]; then
    export ANDROID_HOME="$HOME/android-sdk"
    echo "[build-apk] ANDROID_HOME not set; using $ANDROID_HOME"
  else
    echo "[build-apk] WARNING: ANDROID_HOME is not set and $HOME/android-sdk was not found." >&2
    echo "[build-apk] Install the Android SDK (see docs/android-setup-todo.md) or export ANDROID_HOME." >&2
  fi
fi

if [ -n "${ANDROID_HOME:-}" ]; then
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
fi

# --- Preflight checks --------------------------------------------------------
if ! command -v java >/dev/null 2>&1; then
  echo "[build-apk] ERROR: 'java' not found on PATH. Set JAVA_HOME or install JDK 17." >&2
  exit 1
fi
if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "$ANDROID_HOME" ]; then
  echo "[build-apk] ERROR: Android SDK not found. Set ANDROID_HOME or install the SDK." >&2
  exit 1
fi

if command -v node >/dev/null 2>&1; then
  echo "[build-apk] node:   $(node --version)"
fi
echo "[build-apk] java:    $(java -version 2>&1 | head -1)"
echo "[build-apk] ANDROID_HOME: $ANDROID_HOME"

# --- Step 1: prebuild (regenerate native project from app.json) --------------
# No --clean: preserve the existing debug keystore (design D5).
echo "[build-apk] Step 1/3: expo prebuild --platform android"
npx expo prebuild --platform android

# --- Step 2: Gradle release build --------------------------------------------
# The generated android/app/build.gradle signs the release build with the
# auto-generated debug keystore, so a plain `assembleRelease` produces an
# installable, debug-key-signed APK (design D5). No injected signing flags needed.
echo "[build-apk] Step 2/3: ./gradlew assembleRelease"
(
  cd "$MOBILE_DIR/android"
  ./gradlew assembleRelease
)

# --- Step 3: copy the APK to a stable output path ----------------------------
echo "[build-apk] Step 3/3: copy APK -> $OUTPUT_APK"
if [ ! -f "$GRADLE_APK" ]; then
  echo "[build-apk] ERROR: expected Gradle output not found: $GRADLE_APK" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
cp "$GRADLE_APK" "$OUTPUT_APK"

APK_SIZE_BYTES="$(stat -c '%s' "$OUTPUT_APK")"
APK_SIZE_HUMAN="$(du -h "$OUTPUT_APK" | cut -f1)"
echo "[build-apk] SUCCESS"
echo "[build-apk] APK:  $OUTPUT_APK"
echo "[build-apk] Size: ${APK_SIZE_HUMAN} (${APK_SIZE_BYTES} bytes)"

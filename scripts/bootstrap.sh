#!/bin/bash
# macOS /bin/bash 3.2 compatible. No sudo, force quit, profile copying or quarantine bypass.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP=""
DSH_DIRECTORY="${DSH_HOME:-$HOME/Library/Application Support/dsh-desktop/harness}"
DOCTOR=0
ONLY_PLUGIN=""
MINIMUM_MACOS_MAJOR=12
while [ "$#" -gt 0 ]; do
  case "$1" in
    --app) APP="$2"; shift 2 ;;
    --dsh-home) DSH_DIRECTORY="$2"; shift 2 ;;
    --doctor) DOCTOR=1; shift ;;
    --only) ONLY_PLUGIN="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
[ "$(uname -s)" = Darwin ] || { echo 'This release installs on macOS only.' >&2; exit 2; }
[ "$(sw_vers -productVersion | cut -d . -f 1)" -ge "$MINIMUM_MACOS_MAJOR" ] || { echo "macOS $MINIMUM_MACOS_MAJOR or newer is required." >&2; exit 2; }
if [ -z "$APP" ]; then
  if [ -d '/Applications/DSH Desktop.app' ]; then APP='/Applications/DSH Desktop.app';
  elif [ -d "$HOME/Applications/DSH Desktop.app" ]; then APP="$HOME/Applications/DSH Desktop.app";
  else APP="$HOME/Applications/DSH Desktop.app"; fi
fi
TEMP_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/dsh-classroom.XXXXXX")"
trap 'rm -rf "$TEMP_DIRECTORY"' EXIT
if [ ! -e "$APP" ]; then
  [ "$DOCTOR" = 0 ] || { echo 'Desktop not installed.' >&2; exit 2; }
  # These lines are generated from classroom.json by scripts/refresh.mjs.
  # BEGIN DESKTOP PINS
  VERSION='0.11.1'
  ARM64_SHA='a0a3eb7d5638c1e61ab1bba8f00101f6871d71a0a943a18c1d769a5febee58cd'
  X64_SHA='7d24210b82d6d67844ded006c7b47185e5237649a31e94013243c27e263f22d4'
  # END DESKTOP PINS
  case "$(uname -m)" in
    arm64) ARCH=arm64; EXPECTED="$ARM64_SHA" ;;
    x86_64) ARCH=x64; EXPECTED="$X64_SHA" ;;
    *) echo 'Unsupported architecture.' >&2; exit 2 ;;
  esac
  URL="https://github.com/dataelement/dsh-desktop/releases/download/v$VERSION/dsh-desktop-mac-$ARCH.zip"
  CACHE_DIRECTORY="${DSH_CLASSROOM_CACHE:-$HOME/Library/Caches/dsh-desktop-classroom}"
  mkdir -p "$CACHE_DIRECTORY"
  ARCHIVE="$CACHE_DIRECTORY/$VERSION-$ARCH.zip"
  if [ ! -f "$ARCHIVE" ]; then
    echo "Downloading Desktop $VERSION ($ARCH); the original archive is a few hundred MB."
    curl --fail --location --silent --show-error --retry 3 --proto '=https' --tlsv1.2 "$URL" -o "$ARCHIVE.part"
    mv "$ARCHIVE.part" "$ARCHIVE"
  fi
  ACTUAL="$(/usr/bin/openssl dgst -sha256 "$ARCHIVE" | awk '{print $NF}')"
  [ "$ACTUAL" = "$EXPECTED" ] || { echo 'Desktop download SHA256 mismatch.' >&2; exit 1; }
  ditto -x -k "$ARCHIVE" "$TEMP_DIRECTORY/unpacked"
  SOURCE_APP="$TEMP_DIRECTORY/unpacked/DSH Desktop.app"
  [ -d "$SOURCE_APP" ] || { echo 'Unexpected Desktop archive layout.' >&2; exit 1; }
  [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$SOURCE_APP/Contents/Info.plist")" = io.dsh.desktop ] || exit 1
  [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$SOURCE_APP/Contents/Info.plist")" = "$VERSION" ] || exit 1
  codesign --verify --deep --strict "$SOURCE_APP"
  mkdir -p "$(dirname "$APP")"
  # Never replace an installed/running app. Upgrades are a separate, user-controlled step.
  [ ! -e "$APP" ] || { echo 'App appeared during download; refusing to overwrite.' >&2; exit 1; }
  mv "$SOURCE_APP" "$APP"
fi
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")"
[ "$BUNDLE_ID" = io.dsh.desktop ] || { echo 'The selected app is not DSH Desktop.' >&2; exit 1; }
NODE="$APP/Contents/MacOS/DSH Desktop"
export ELECTRON_RUN_AS_NODE=1
INSTALL_ARGS=(--app "$APP" --dsh-home "$DSH_DIRECTORY")
if [ "$DOCTOR" = 1 ]; then INSTALL_ARGS+=(--doctor); fi
if [ -n "$ONLY_PLUGIN" ]; then INSTALL_ARGS+=(--only "$ONLY_PLUGIN"); fi
"$NODE" "$ROOT/scripts/install-pack.mjs" "${INSTALL_ARGS[@]}"

#!/bin/sh
# Generates config.js from the ARC_APP_KEY environment variable. Netlify runs this as the
# build command (see netlify.toml); set ARC_APP_KEY under Site configuration → Environment
# variables.
#
# Locally, ARC_APP_KEY can also come from a .env file. Pass --package to also build a
# drag-and-drop deploy in dist/:
#
#   sh build-config.sh --package
#
# Windows equivalent: build-config.ps1
set -eu

cd "$(dirname "$0")"

package=false
for arg in "$@"; do
  case "$arg" in
    --package) package=true ;;
    *)
      echo "usage: sh build-config.sh [--package]" >&2
      exit 2
      ;;
  esac
done

key="${ARC_APP_KEY:-}"
if [ -z "$key" ] && [ -f .env ]; then
  key=$(sed -n 's/^[[:space:]]*ARC_APP_KEY[[:space:]]*=[[:space:]]*//p' .env | tail -n 1 | tr -d "\"'\r")
fi

case "$key" in
  *[!A-Za-z0-9_-]*)
    echo "build-config: ARC_APP_KEY contains unexpected characters" >&2
    exit 1
    ;;
esac

if [ -z "$key" ]; then
  if [ "$package" = true ]; then
    echo "build-config: ARC_APP_KEY is not set (set it in the environment or .env)" >&2
    exit 1
  fi
  echo "build-config: warning: ARC_APP_KEY is not set; the app won't be able to load user data" >&2
fi

printf 'window.ARC_CONFIG = { appKey: "%s" };\n' "$key" > config.js
echo "build-config: wrote config.js"

[ "$package" = true ] || exit 0

# Files the deployed site needs. Keep in sync with build-config.ps1. netlify.toml is left
# out on purpose: with it, a signed-in drag-and-drop deploy runs this script again on
# Netlify and overwrites config.js with an empty key.
files="index.html styles.css app.js config.js sw.js manifest.webmanifest _redirects _headers
  icons/icon.svg icons/icon-192.png icons/icon-512.png icons/apple-touch-icon.png icons/favicon-32.png"

rm -rf dist
mkdir -p dist/site/icons
for f in $files; do
  cp "$f" "dist/site/$f"
done

if command -v zip >/dev/null 2>&1; then
  (cd dist/site && zip -qrX ../arc-quests.zip .)
  echo "build-config: wrote dist/site/ (drag this folder to Netlify) and dist/arc-quests.zip"
else
  echo "build-config: wrote dist/site/ (drag this folder to Netlify); 'zip' not found, skipped dist/arc-quests.zip"
fi

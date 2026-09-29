#!/bin/sh
# Generates config.js from environment variables. Netlify runs this as the build
# command (see netlify.toml); set ARC_APP_KEY under Site configuration → Environment variables.
set -eu

key="${ARC_APP_KEY:-}"

case "$key" in
  *[!A-Za-z0-9_-]*)
    echo "build-config: ARC_APP_KEY contains unexpected characters" >&2
    exit 1
    ;;
esac

if [ -z "$key" ]; then
  echo "build-config: warning: ARC_APP_KEY is not set; the app won't be able to load user data" >&2
fi

printf 'window.ARC_CONFIG = { appKey: "%s" };\n' "$key" > config.js
echo "build-config: wrote config.js"

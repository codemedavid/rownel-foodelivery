#!/usr/bin/env bash
# One-time interactive bootstrap of iOS signing credentials on EAS.
#
# EAS cannot create a distribution certificate non-interactively, so this step
# needs a human terminal exactly once. The App Store Connect API key is passed
# in below, so Apple authentication needs no Apple ID password and no 2FA code.
#
# At the prompts choose:
#   1. Build credentials: "All: Set up all the required credentials..."
#   2. When asked how to authenticate, pick the App Store Connect API Key
#      (it should already be detected from the environment).
#
# Then re-run ./scripts/deploy-ios.sh — everything after this is unattended.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export EXPO_ASC_API_KEY_PATH="$REPO_ROOT/credentials/AuthKey_ASC.p8"
export EXPO_ASC_KEY_ID="25BKAS88C3"
export EXPO_ASC_ISSUER_ID="c3473b07-3f04-4634-8fd3-50d960e8afd8"
export EAS_BUILD_NO_EXPO_GO_WARNING=true

[ -f "$EXPO_ASC_API_KEY_PATH" ] || { echo "missing $EXPO_ASC_API_KEY_PATH" >&2; exit 1; }

cd "$REPO_ROOT/mobile"
exec npx eas-cli credentials --platform ios

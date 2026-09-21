#!/usr/bin/env bash
# Build and submit the Rownel mobile app to App Store Connect.
#
# Prerequisites (see credentials/README.md):
#   credentials/AuthKey_ASC.p8   App Store Connect API key (App Manager role)
#   ASC_KEY_ID                   Key ID from that page
#   ASC_ISSUER_ID                Issuer ID from that page
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY_PATH="$REPO_ROOT/credentials/AuthKey_ASC.p8"

fail() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

[ -f "$KEY_PATH" ] || fail "missing $KEY_PATH — see credentials/README.md"
[ -n "${ASC_KEY_ID:-}" ] || fail "ASC_KEY_ID is not set"
[ -n "${ASC_ISSUER_ID:-}" ] || fail "ASC_ISSUER_ID is not set"

# Lets EAS authenticate with Apple non-interactively (no Apple ID / 2FA prompt).
export EXPO_ASC_API_KEY_PATH="$KEY_PATH"
export EXPO_ASC_KEY_ID="$ASC_KEY_ID"
export EXPO_ASC_ISSUER_ID="$ASC_ISSUER_ID"
export EAS_BUILD_NO_EXPO_GO_WARNING=true
# Apple rejects EAS's capability PATCH for this bundle id; capabilities are
# already set correctly in the developer portal, so skip the sync.
export EXPO_NO_CAPABILITY_SYNC=1

# eas submit needs the App Store Connect app id. Apple's API has no CREATE for
# apps (403 FORBIDDEN_ERROR), so the record must be made once in the web UI --
# after that this resolves it automatically.
if [ -z "${ASC_APP_ID:-}" ]; then
  ASC_APP_ID="$(node "$REPO_ROOT/scripts/asc-app-id.mjs" 2>/dev/null || true)"
fi
if [ -z "$ASC_APP_ID" ]; then
  fail "no App Store Connect app record for com.rownel.foodelivery yet.
  Create it at https://appstoreconnect.apple.com/apps (+ > New App), then re-run.
  Name 'Rownel Food Delivery', bundle id com.rownel.foodelivery, SKU rownel-ios-001."
fi
export ASC_APP_ID
echo "==> App Store Connect app id: $ASC_APP_ID"

cd "$REPO_ROOT/mobile"

echo "==> Preflight: typecheck, tests, expo-doctor"
npx tsc --noEmit

# LocationContext.test.tsx has a known ~20% flake: RNTL's `screen` singleton is
# reset by a cleanup() that fires mid-test, so the first test in the file sees
# "`render` function has not been called". render() itself does not throw --
# verified by instrumenting it. A real breakage fails both attempts; the flake
# essentially never does. Tracked in docs/appstore/review-risks.md.
if ! npx jest --silent; then
  printf '\033[33mtests failed - retrying once (known LocationContext flake)\033[0m\n' >&2
  npx jest --silent
fi

# expo-doctor is advisory, not a gate: one of its checks fetches the config
# schema from exp.host, so a network blip fails the whole run. Typecheck and
# the test suite are the real gates. Retried once, then warned past.
if ! npx expo-doctor@latest && ! npx expo-doctor@latest; then
  printf '\033[33mwarning:\033[0m expo-doctor did not pass — continuing anyway (see output above)\n' >&2
fi

echo "==> Building iOS (production)"
npx eas-cli build --platform ios --profile production --non-interactive --wait

echo "==> Submitting to App Store Connect"
npx eas-cli submit --platform ios --profile production --latest --non-interactive

echo "==> Done. Finish the listing at https://appstoreconnect.apple.com"

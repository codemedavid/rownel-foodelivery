# App Store Connect credentials

`eas.json` (`submit.production.ios.ascApiKeyPath`) expects the App Store Connect
API key at:

    credentials/AuthKey_ASC.p8

## How to create it

1. https://appstoreconnect.apple.com/access/integrations/api → **Team Keys**
2. **+** → name it `EAS`, access **App Manager**, Generate
3. Download the `.p8` (one-time download) and save it here as `AuthKey_ASC.p8`
4. Note the **Key ID** and the **Issuer ID** shown on that page

## How to use it

    export ASC_KEY_ID=<key id>
    export ASC_ISSUER_ID=<issuer id>

`eas.json` reads those two as `$ASC_KEY_ID` / `$ASC_ISSUER_ID`.

For non-interactive credential setup during `eas build`, also export:

    export EXPO_ASC_API_KEY_PATH="$PWD/credentials/AuthKey_ASC.p8"
    export EXPO_ASC_KEY_ID=$ASC_KEY_ID
    export EXPO_ASC_ISSUER_ID=$ASC_ISSUER_ID

Never commit the `.p8` — this directory is gitignored except for this README.

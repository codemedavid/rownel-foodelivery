// Verifies the MapKit JS credentials this app signs Maps tokens with.
//
// A misconfigured key looks exactly like a code bug from inside the browser:
// the address box says "address search is not configured" and the map is a
// blank panel. This script checks the credentials directly so the two are never
// confused, and prints the claims so they can be compared with the Apple
// Developer account.
//
//   npm run check:mapkit
//
// Reads MAPKIT_TEAM_ID, MAPKIT_KEY_ID, MAPKIT_PRIVATE_KEY and the optional
// MAPKIT_ORIGIN from .env.local, falling back to the process environment.

import { loadEnv } from './loadEnv.mjs';
// The signing code is shared with the serverless function rather than copied,
// so this checks what actually runs in production. Node strips the types.
import { buildMapkitToken, decodeSegment } from '../api/_lib/mapkitJwt.ts';

const EXIT_FAILURE = 1;
const APPLE_ID_LENGTH = 10;
const TTL_SECONDS = 1800;

// There is no public endpoint that validates a mapkit_js token, so the live
// check signs a second token scoped to server_api and exchanges that instead.
// It proves the team id, key id and .p8 belong together — the failure this
// script exists to catch — but needs Maps Server API enabled on the same key.
const APPLE_TOKEN_ENDPOINT = 'https://maps-api.apple.com/v1/token';
const MAPKIT_JS_SCOPE = 'mapkit_js';
const SERVER_API_SCOPE = 'server_api';

const env = loadEnv();
const failures = [];

const requireVar = (name) => {
  const value = env[name]?.trim();
  if (!value) {
    failures.push(`${name} is not set. Add it to .env.local and the Vercel project environment.`);
    return null;
  }
  return value;
};

const teamId = requireVar('MAPKIT_TEAM_ID');
const keyId = requireVar('MAPKIT_KEY_ID');
const privateKeyPem = requireVar('MAPKIT_PRIVATE_KEY');
const origin = env.MAPKIT_ORIGIN?.trim();

for (const [name, value] of [
  ['MAPKIT_TEAM_ID', teamId],
  ['MAPKIT_KEY_ID', keyId],
]) {
  if (value && value.length !== APPLE_ID_LENGTH) {
    failures.push(
      `${name} is "${value}" (${value.length} characters). Apple identifiers are exactly ${APPLE_ID_LENGTH}.`
    );
  }
}

if (failures.length > 0) {
  console.error('MapKit credentials are incomplete:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    [
      '',
      'To create them:',
      '  1. https://developer.apple.com/account/resources/identifiers  — add a Maps ID.',
      '  2. https://developer.apple.com/account/resources/authkeys     — add a key with',
      '     MapKit JS enabled, pick that Maps ID, and download the .p8 (one chance only).',
      '  3. MAPKIT_TEAM_ID is top-right of the developer account; MAPKIT_KEY_ID is on the key.',
      '  4. MAPKIT_PRIVATE_KEY is the whole .p8 file, BEGIN/END lines included.',
    ].join('\n')
  );
  process.exit(EXIT_FAILURE);
}

let token;
try {
  token = await buildMapkitToken({
    teamId,
    keyId,
    privateKeyPem,
    scope: MAPKIT_JS_SCOPE,
    origin,
    ttlSeconds: TTL_SECONDS,
  });
} catch (error) {
  console.error(`Could not sign a token: ${error.message}`);
  process.exit(EXIT_FAILURE);
}

const header = decodeSegment(token.split('.')[0]);
const claims = decodeSegment(token.split('.')[1]);

console.log('Signed a Maps token successfully.\n');
console.log(`  key id (kid)   ${header.kid}`);
console.log(`  team id (iss)  ${claims.iss}`);
console.log(`  scope          ${claims.scope}`);
console.log(`  expires in     ${TTL_SECONDS / 60} minutes`);
console.log(
  `  origin         ${claims.origin ?? '(none — any site with this token can use your quota)'}`
);

if (!claims.origin) {
  console.log(
    '\n  Warning: MAPKIT_ORIGIN is unset. Apple requires an origin on a signed\n' +
      '  MapKit JS token, and without one this token will be refused.'
  );
}

console.log('\nAsking Apple to validate the signature...');

const probeToken = await buildMapkitToken({
  teamId,
  keyId,
  privateKeyPem,
  scope: SERVER_API_SCOPE,
  origin,
  ttlSeconds: TTL_SECONDS,
});

let response;
try {
  response = await fetch(APPLE_TOKEN_ENDPOINT, {
    headers: { Authorization: `Bearer ${probeToken}` },
  });
} catch (error) {
  console.error(`  Could not reach Apple: ${error.message}`);
  process.exit(EXIT_FAILURE);
}

if (response.ok) {
  console.log('  Apple accepted the signature. These credentials are good.');
  process.exit(0);
}

if (response.status === 401) {
  console.error(
    [
      '  Apple rejected the token (401).',
      '',
      '  Most likely the team id, key id, and .p8 do not belong together — check that',
      '  MAPKIT_KEY_ID matches the key the .p8 was downloaded from.',
      '',
      '  One caveat: this check exchanges a server_api-scoped token, so the key needs',
      '  "Maps Server API" ticked alongside MapKit JS. If the credentials are definitely',
      '  right, either tick it on the key or skip this check and load the app — the',
      '  app itself uses a mapkit_js-scoped token, which is not what was tested here.',
    ].join('\n')
  );
  process.exit(EXIT_FAILURE);
}

console.error(`  Apple answered ${response.status}; the token could not be confirmed.`);
process.exit(EXIT_FAILURE);

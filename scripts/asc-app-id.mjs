// Prints the App Store Connect app id for the iOS bundle id, or exits 1.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_ID = 'com.rownel.foodelivery';

const keyPath = process.env.EXPO_ASC_API_KEY_PATH ?? path.join(ROOT, 'credentials/AuthKey_ASC.p8');
const keyId = process.env.ASC_KEY_ID ?? process.env.EXPO_ASC_KEY_ID;
const issuer = process.env.ASC_ISSUER_ID ?? process.env.EXPO_ASC_ISSUER_ID;
if (!keyId || !issuer || !fs.existsSync(keyPath)) process.exit(1);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const signing =
  `${b64({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.` +
  b64({ iss: issuer, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
const jwt =
  `${signing}.` +
  crypto
    .sign('sha256', Buffer.from(signing), {
      key: fs.readFileSync(keyPath, 'utf8'),
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');

const res = await fetch(
  `https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=${BUNDLE_ID}&limit=1`,
  { headers: { Authorization: `Bearer ${jwt}` } }
);
if (!res.ok) process.exit(1);
const { data } = await res.json();
if (!data?.length) process.exit(1);
process.stdout.write(data[0].id);

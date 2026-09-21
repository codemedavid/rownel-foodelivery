// Sets App Review Information (demo account + reviewer notes) for the
// in-progress version. Contact phone must be supplied via ASC_CONTACT_PHONE.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_ID = process.env.ASC_APP_ID;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const signing =
  `${b64({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' })}.` +
  b64({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' });
const JWT =
  `${signing}.` +
  crypto
    .sign('sha256', Buffer.from(signing), {
      key: fs.readFileSync(path.join(ROOT, 'credentials/AuthKey_ASC.p8'), 'utf8'),
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');

const api = async (p, method = 'GET', body) => {
  const res = await fetch(`https://api.appstoreconnect.apple.com${p}`, {
    method,
    headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 204 */ }
  return { status: res.status, json, text };
};
const ok = (r) => r.status >= 200 && r.status < 300;

const NOTES = `Row-Nel is a local delivery service. It operates only in Vigan City, Ilocos Sur, Philippines.

IMPORTANT: when the app asks for location access on first launch, please choose "Don't Allow". The storefront only lists merchants that deliver to your current position, so allowing location from outside Vigan City will correctly - but unhelpfully - show an empty list. Declining the prompt lists every merchant so you can review the app.

If you prefer to test with location enabled, please set a simulated location of 17.5747, 120.3869 (Vigan City).

Sign in with the demo account above to browse merchants, build a cart and reach checkout, where the delivery pin can be dragged.

The build also contains rider and administrative dashboards used only by Row-Nel staff and contracted riders. They are unlocked by a server-side role on the account and are not part of the customer experience.`;

const versions = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=20`);
const version = versions.json.data.find((v) =>
  ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'].includes(v.attributes.appStoreState)
);
if (!version) { console.error('no editable version'); process.exit(1); }

const attributes = {
  demoAccountName: 'appstore.review@row-nel.com',
  demoAccountPassword: 'RownelReview2026!',
  demoAccountRequired: true,
  notes: NOTES,
};
for (const [env, key] of [
  ['ASC_CONTACT_FIRST', 'contactFirstName'],
  ['ASC_CONTACT_LAST', 'contactLastName'],
  ['ASC_CONTACT_PHONE', 'contactPhone'],
  ['ASC_CONTACT_EMAIL', 'contactEmail'],
]) {
  if (process.env[env]) attributes[key] = process.env[env];
}

const existing = await api(`/v1/appStoreVersions/${version.id}/appStoreReviewDetail`);
let res;
if (ok(existing) && existing.json?.data?.id) {
  res = await api(`/v1/appStoreReviewDetails/${existing.json.data.id}`, 'PATCH', {
    data: { type: 'appStoreReviewDetails', id: existing.json.data.id, attributes },
  });
} else {
  res = await api('/v1/appStoreReviewDetails', 'POST', {
    data: {
      type: 'appStoreReviewDetails',
      attributes,
      relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
    },
  });
}
console.log(ok(res) ? 'OK    review details (demo account + notes)' : `FAIL  ${res.text.slice(0, 400)}`);
console.log('      contact fields set:', Object.keys(attributes).filter((k) => k.startsWith('contact')).join(', ') || '(none)');

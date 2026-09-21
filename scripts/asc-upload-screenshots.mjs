// Uploads the 6.9" iPhone screenshots in docs/appstore/screenshots to the
// in-progress App Store version. Apple's upload is a 3-step dance: reserve,
// PUT the bytes to the returned operations, then commit with an MD5.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'docs/appstore/screenshots');
const APP_ID = process.env.ASC_APP_ID;
const DISPLAY_TYPE = process.env.ASC_DISPLAY_TYPE ?? 'APP_IPHONE_67';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const signing =
  `${b64({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' })}.` +
  b64({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' });
const JWT =
  `${signing}.` +
  crypto.sign('sha256', Buffer.from(signing), {
    key: fs.readFileSync(path.join(ROOT, 'credentials/AuthKey_ASC.p8'), 'utf8'),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');

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

const versions = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=20`);
const version = versions.json.data.find((v) =>
  ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'].includes(v.attributes.appStoreState));
if (!version) { console.error('no editable version'); process.exit(1); }

const locs = await api(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
const loc = locs.json.data.find((l) => l.attributes.locale === 'en-US');

const sets = await api(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
let set = sets.json.data?.find((s) => s.attributes.screenshotDisplayType === DISPLAY_TYPE);
if (!set) {
  const created = await api('/v1/appScreenshotSets', 'POST', {
    data: {
      type: 'appScreenshotSets',
      attributes: { screenshotDisplayType: DISPLAY_TYPE },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } },
    },
  });
  if (!ok(created)) { console.error('create set failed:', created.text.slice(0, 400)); process.exit(1); }
  set = created.json.data;
}
console.log(`screenshot set ${set.id} (${DISPLAY_TYPE})`);

const existing = await api(`/v1/appScreenshotSets/${set.id}/appScreenshots`);
const have = new Set((existing.json.data ?? []).map((s) => s.attributes.fileName));

for (const name of fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).sort()) {
  if (have.has(name)) { console.log(`SKIP  ${name} (already uploaded)`); continue; }
  const bytes = fs.readFileSync(path.join(SHOTS, name));

  const reserved = await api('/v1/appScreenshots', 'POST', {
    data: {
      type: 'appScreenshots',
      attributes: { fileName: name, fileSize: bytes.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } },
    },
  });
  if (!ok(reserved)) { console.log(`FAIL  ${name} reserve -> ${reserved.text.slice(0, 300)}`); continue; }

  const shot = reserved.json.data;
  let uploaded = true;
  for (const op of shot.attributes.uploadOperations) {
    const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
    const part = bytes.subarray(op.offset, op.offset + op.length);
    const put = await fetch(op.url, { method: op.method, headers, body: part });
    if (!put.ok) { uploaded = false; console.log(`FAIL  ${name} chunk -> ${put.status}`); break; }
  }
  if (!uploaded) continue;

  const committed = await api(`/v1/appScreenshots/${shot.id}`, 'PATCH', {
    data: {
      type: 'appScreenshots',
      id: shot.id,
      attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(bytes).digest('hex') },
    },
  });
  console.log(ok(committed) ? `OK    ${name} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`
                            : `FAIL  ${name} commit -> ${committed.text.slice(0, 300)}`);
}

#!/usr/bin/env node --experimental-strip-types
// Phase 4 — upload approved images to ImageKit.
//
// ImageKit's upload API accepts a remote URL in the `file` field when
// authenticated with the private key, so this uploads server-side and never
// touches the browser signing flow in the imagekit-auth edge function.
//
// Idempotent: an entry that already has an imagekitUrl is skipped.
//
// Usage:
//   IMAGEKIT_PRIVATE_KEY=private_xxx \
//     node --experimental-strip-types scripts/uploadImagesToImageKit.mjs
//   ... --manifest docs/images/merchant-manifest.json --folder merchants

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv, requireEnv, projectRoot } from './loadEnv.mjs';
import { selectPendingUploads, withUpload } from '../src/lib/imageCatalog.ts';

const UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const MANIFEST_PATH = resolve(projectRoot, flag('manifest', 'docs/images/image-manifest.json'));
const TARGET_FOLDER = flag('folder', 'menu-items');

const env = loadEnv();
const { IMAGEKIT_PRIVATE_KEY } = requireEnv(env, ['IMAGEKIT_PRIVATE_KEY']);
const authHeader = `Basic ${Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString('base64')}`;

const limitIndex = process.argv.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : Infinity;

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const pending = selectPendingUploads(manifest).slice(0, limit);

if (pending.length === 0) {
  console.log('Nothing to upload: no approved entries are awaiting upload.');
  process.exit(0);
}

console.log(`Uploading ${pending.length} image(s) to ImageKit folder "${TARGET_FOLDER}"...\n`);

// Wikimedia (and some other hosts) refuse ImageKit's server-side fetcher, which
// sends no descriptive User-Agent. Their policy wants one, so when the remote
// fetch is rejected we download the bytes ourselves and upload those instead.
const USER_AGENT = 'rownel-foodelivery-image-audit/1.0 (catalog image re-hosting)';

async function postToImageKit(file, entry) {
  const form = new FormData();
  form.append('file', file);
  form.append('fileName', `${entry.key.replace('::', '_')}`);
  form.append('folder', TARGET_FOLDER);
  form.append('useUniqueFileName', 'true');

  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: authHeader },
    body: form,
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? `upload failed with status ${response.status}`);
  }
  return body.url;
}

async function uploadFromUrl(entry) {
  try {
    return await postToImageKit(entry.chosenUrl, entry);
  } catch (error) {
    if (!/not able to download file/i.test(error.message)) throw error;

    const source = await fetch(entry.chosenUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30000),
    });
    if (!source.ok) throw new Error(`${error.message} (re-fetch got ${source.status})`);

    const type = source.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) throw new Error(`${error.message} (re-fetch served ${type})`);

    const blob = new Blob([await source.arrayBuffer()], { type });
    return await postToImageKit(blob, entry);
  }
}

const uploaded = new Map();
const failures = [];

for (const entry of pending) {
  try {
    const url = await uploadFromUrl(entry);
    uploaded.set(entry.key, url);
    console.log(`  ok    ${entry.key}`);
  } catch (error) {
    failures.push({ key: entry.key, message: error.message });
    console.error(`  FAIL  ${entry.key}: ${error.message}`);
  }
}

const next = manifest.map((entry) =>
  uploaded.has(entry.key) ? withUpload(entry, uploaded.get(entry.key)) : entry,
);
writeFileSync(MANIFEST_PATH, `${JSON.stringify(next, null, 2)}\n`);

console.log(`\nuploaded ${uploaded.size}, failed ${failures.length}`);
console.log(`wrote ${MANIFEST_PATH}`);
if (failures.length > 0) process.exit(1);

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

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv, requireEnv, projectRoot } from './loadEnv.mjs';
import { selectPendingUploads, withUpload } from '../src/lib/imageCatalog.ts';

const MANIFEST_PATH = resolve(projectRoot, 'docs/images/image-manifest.json');
const UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const TARGET_FOLDER = 'menu-items';

const env = loadEnv();
const { IMAGEKIT_PRIVATE_KEY } = requireEnv(env, ['IMAGEKIT_PRIVATE_KEY']);
const authHeader = `Basic ${Buffer.from(`${IMAGEKIT_PRIVATE_KEY}:`).toString('base64')}`;

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const pending = selectPendingUploads(manifest);

if (pending.length === 0) {
  console.log('Nothing to upload: no approved entries are awaiting upload.');
  process.exit(0);
}

console.log(`Uploading ${pending.length} image(s) to ImageKit folder "${TARGET_FOLDER}"...\n`);

async function uploadFromUrl(entry) {
  const form = new FormData();
  form.append('file', entry.chosenUrl);
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

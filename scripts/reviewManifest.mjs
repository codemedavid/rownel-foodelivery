#!/usr/bin/env node --experimental-strip-types
// Phase 3 — apply the review policy to the manifest.
//
//   official / likely  -> approved for every row
//   generic            -> approved only for rows with no image yet, else rejected
//
// Plus a hold list: entries whose source is genuinely official but whose photo
// is only the closest available match, not the actual product. Those stay in
// pending-review so a human decides.
//
// Usage:
//   node --experimental-strip-types scripts/reviewManifest.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from './loadEnv.mjs';
import { autoApprove, withholdGeneric, buildRowUpdates } from '../src/lib/imageCatalog.ts';

const IMAGES_DIR = resolve(projectRoot, 'docs/images');
const MANIFEST_PATH = resolve(IMAGES_DIR, 'image-manifest.json');
const CATALOG_PATH = resolve(IMAGES_DIR, 'catalog-snapshot.json');

/** Reported by the sourcing agent as approximate matches — official asset, wrong item. */
const HOLD_FOR_HUMAN = new Set([
  'mcdo::double-quarter-pounder-w-cheese',
  'mcdo::tripple-cheeseburger',
  'mcdo::mcdo-chicken-nuggets-10pcs',
  'mcdo::mc-spaghetti',
  'mcdo::bff-fries',
  'mcdo::mc-shaker-fries',
]);

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const { items } = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));

const held = [];
const reviewed = autoApprove(manifest, items).map((entry) => {
  const isApproximate = HOLD_FOR_HUMAN.has(entry.key) || /lettuce|tomato/i.test(entry.productName);
  if (!isApproximate || entry.status !== 'approved') return entry;
  held.push(entry.key);
  return { ...entry, status: 'pending-review', targetRowIds: undefined };
});

const finalManifest = process.argv.includes('--no-generic') ? withholdGeneric(reviewed) : reviewed;

writeFileSync(MANIFEST_PATH, `${JSON.stringify(finalManifest, null, 2)}\n`);

const counts = finalManifest.reduce((acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }), {});
// Count via the same function the apply step uses, so this can never drift from reality.
const rowsToChange = buildRowUpdates(finalManifest).length;
const pendingUploadRows = finalManifest
  .filter((e) => e.status === 'approved')
  .reduce((n, e) => n + (e.targetRowIds ?? e.rowIds).length, 0);

console.log(`status: ${JSON.stringify(counts)}`);
console.log(`rows the apply step would write: ${rowsToChange}`);
if (pendingUploadRows) console.log(`rows awaiting upload first: ${pendingUploadRows}`);
console.log(`held for human review: ${held.length}${held.length ? ` (${held.join(', ')})` : ''}`);
console.log(`wrote ${MANIFEST_PATH}`);

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
import {
  autoApprove,
  withholdGeneric,
  buildRowUpdates,
  reconsiderStranded,
} from '../src/lib/imageCatalog.ts';

const IMAGES_DIR = resolve(projectRoot, 'docs/images');

const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const MANIFEST_PATH = resolve(IMAGES_DIR, flag('manifest', 'image-manifest.json'));
const CATALOG_PATH = resolve(IMAGES_DIR, flag('snapshot', 'catalog-snapshot.json'));

/** Reported by the sourcing agent as approximate matches — official asset, wrong item. */
const HOLD_FOR_HUMAN = new Set([
  'mcdo::double-quarter-pounder-w-cheese',
  'mcdo::tripple-cheeseburger',
  'mcdo::mcdo-chicken-nuggets-10pcs',
  'mcdo::mc-spaghetti',
  'mcdo::bff-fries',
  'mcdo::mc-shaker-fries',
  // Chain-item pass: sourced, but the photo is knowingly not the exact SKU.
  'mcdo::ebi-burger', //                       no solo pack shot exists; hero sits in a multi-product poster
  'mcdo::sulit-busog', //                      a meal range, not one SKU
  'mcdo::large-shake-shake-fries-n-medium-mcfloat', // component only, no bundle artwork
  'mcdo::medium-shake-shake-fries-n-medium-mcfloat', // component only, no bundle artwork
  'mcdo::large-fries-n-mcfloat', //            component only, no bundle artwork
  'jollibee::super-meal-d', //                 Jollibee does not label Super Meals A-D; the mapping is inferred
  'big-brew::fruit-tea-22oz', //               no generic Fruit Tea SKU; candidates are single flavours
  'red-ribbon::mango-blossom-petite-cake', //  Regular-size hero shot, not the Petite variant
]);

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const { items } = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));

// --reconsider reopens entries that were set aside back when their rows still
// had a rendering photo. Run it after the host outage to recover held candidates.
const reopened = process.argv.includes('--reconsider') ? reconsiderStranded(manifest, items) : manifest;
const reopenedCount = reopened.filter((entry, index) => entry.status !== manifest[index].status).length;

const held = [];
const reviewed = autoApprove(reopened, items).map((entry) => {
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

if (reopenedCount) console.log(`reopened for review: ${reopenedCount}`);
console.log(`status: ${JSON.stringify(counts)}`);
console.log(`rows the apply step would write: ${rowsToChange}`);
if (pendingUploadRows) console.log(`rows awaiting upload first: ${pendingUploadRows}`);
console.log(`held for human review: ${held.length}${held.length ? ` (${held.join(', ')})` : ''}`);
console.log(`wrote ${MANIFEST_PATH}`);

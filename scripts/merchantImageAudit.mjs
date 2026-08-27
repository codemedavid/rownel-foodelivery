#!/usr/bin/env node --experimental-strip-types
// Merchant phase 1 — audit logos and cover images.
//
// A logo belongs to a brand, not a branch: Jollibee Bangued and Jollibee Candon
// share one. So each merchant contributes two pseudo-products, "Logo" and
// "Cover Image", and the existing manifest builder groups them by brand for
// free — one asset sourced per brand, fanned back out to every branch.
//
// Usage:
//   node --experimental-strip-types scripts/merchantImageAudit.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, requireEnv, projectRoot } from './loadEnv.mjs';
import { buildManifest } from '../src/lib/imageCatalog.ts';

const OUTPUT_DIR = resolve(projectRoot, 'docs/images');
const MANIFEST_PATH = resolve(OUTPUT_DIR, 'merchant-manifest.json');
const SNAPSHOT_PATH = resolve(OUTPUT_DIR, 'merchant-snapshot.json');

/** Suffix encodes which column an entry writes back to. */
export const LOGO_LABEL = 'Logo';
export const COVER_LABEL = 'Cover Image';

const env = loadEnv();
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = requireEnv(env, [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]);

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
const { data, error } = await supabase.from('merchants').select('id, name, logo_url, cover_image_url');
if (error) {
  console.error(`Failed to read merchants: ${error.message}`);
  process.exit(1);
}

const merchants = data.map((row) => ({ id: row.id, name: row.name ?? '' }));

// Two pseudo-items per merchant; the row id carries the column it belongs to.
const items = data.flatMap((row) => [
  { id: `${row.id}::logo`, name: LOGO_LABEL, merchantId: row.id, imageUrl: row.logo_url ?? null },
  { id: `${row.id}::cover`, name: COVER_LABEL, merchantId: row.id, imageUrl: row.cover_image_url ?? null },
]);

const manifest = buildManifest(merchants, items);

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(SNAPSHOT_PATH, `${JSON.stringify({ merchants, items }, null, 2)}\n`);
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

const withLogo = data.filter((r) => r.logo_url).length;
const withCover = data.filter((r) => r.cover_image_url).length;
console.log(`merchants        ${merchants.length}`);
console.log(`with logo        ${withLogo} (${merchants.length - withLogo} missing)`);
console.log(`with cover       ${withCover} (${merchants.length - withCover} missing)`);
console.log(`manifest entries ${manifest.length} (one Logo + one Cover per brand)`);
console.log(`\nwrote ${SNAPSHOT_PATH}`);
console.log(`wrote ${MANIFEST_PATH}`);

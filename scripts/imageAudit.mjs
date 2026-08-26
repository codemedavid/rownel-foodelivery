#!/usr/bin/env node --experimental-strip-types
// Phase 1 — read-only audit.
//
// Reads every merchant and menu item from Supabase, collapses them into one
// manifest entry per brand + product, and writes the scaffold that the image
// search phase fills in.
//
// Usage:
//   node --experimental-strip-types scripts/imageAudit.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, requireEnv, projectRoot } from './loadEnv.mjs';
import { buildManifest } from '../src/lib/imageCatalog.ts';

const OUTPUT_DIR = resolve(projectRoot, 'docs/images');
const MANIFEST_PATH = resolve(OUTPUT_DIR, 'image-manifest.json');
const CATALOG_PATH = resolve(OUTPUT_DIR, 'catalog-snapshot.json');

const env = loadEnv();
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = requireEnv(env, [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]);

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

/** Supabase caps a single select at 1000 rows; page until the table is drained. */
async function fetchAll(table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

const merchantRows = await fetchAll('merchants', 'id, name');
const itemRows = await fetchAll('menu_items', 'id, name, merchant_id, image_url');

const merchants = merchantRows.map((row) => ({ id: row.id, name: row.name ?? '' }));
const items = itemRows.map((row) => ({
  id: row.id,
  name: row.name ?? '',
  merchantId: row.merchant_id,
  imageUrl: row.image_url ?? null,
}));

const manifest = buildManifest(merchants, items);

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(CATALOG_PATH, `${JSON.stringify({ merchants, items }, null, 2)}\n`);
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

const withImage = items.filter((item) => item.imageUrl).length;
console.log(`merchants          ${merchants.length}`);
console.log(`menu items         ${items.length} (${withImage} with an image, ${items.length - withImage} without)`);
console.log(`distinct products  ${manifest.length}`);
console.log(`\nwrote ${CATALOG_PATH}`);
console.log(`wrote ${MANIFEST_PATH}`);

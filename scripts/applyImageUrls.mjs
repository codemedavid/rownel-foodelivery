#!/usr/bin/env node --experimental-strip-types
// Phase 5 — write uploaded ImageKit URLs back to menu_items.
//
// Dry-run by default. Pass --commit to actually write. Every run captures the
// previous URL of each affected row to docs/images/rollback-<stamp>.json first,
// so the whole batch can be undone.
//
// Usage:
//   node --experimental-strip-types scripts/applyImageUrls.mjs           # dry run
//   node --experimental-strip-types scripts/applyImageUrls.mjs --commit  # write
//   node --experimental-strip-types scripts/applyImageUrls.mjs --rollback <file>
//
// --only-missing re-checks the live table and keeps just the rows whose photo
// is still absent. The manifest's targets were decided against a snapshot, and
// a merchant may have uploaded their own photo since; without this guard a
// re-run would quietly replace it with the catalog asset.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, requireEnv, projectRoot } from './loadEnv.mjs';
import { buildRowUpdates, buildRollback, isLiveImageUrl } from '../src/lib/imageCatalog.ts';

const IMAGES_DIR = resolve(projectRoot, 'docs/images');
const MANIFEST_PATH = resolve(IMAGES_DIR, 'image-manifest.json');
const CATALOG_PATH = resolve(IMAGES_DIR, 'catalog-snapshot.json');

const args = process.argv.slice(2);
const isCommit = args.includes('--commit');
const isOnlyMissing = args.includes('--only-missing');
const rollbackIndex = args.indexOf('--rollback');
const rollbackFile = rollbackIndex >= 0 ? args[rollbackIndex + 1] : null;

const env = loadEnv();
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = requireEnv(env, [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
]);

const planned = rollbackFile
  ? JSON.parse(readFileSync(resolve(process.cwd(), rollbackFile), 'utf8'))
  : buildRowUpdates(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')));

// Signing in early: --only-missing has to read the live table before deciding.
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
const { error: authError } = await supabase.auth.signInWithPassword({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
});
if (authError) {
  console.error(`Admin sign-in failed: ${authError.message}`);
  process.exit(1);
}

/** Current image_url of every row, straight from the table. */
async function fetchLiveImageUrls() {
  const byRowId = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('menu_items').select('id, image_url').range(from, from + 999);
    if (error) throw new Error(`Failed to read menu_items: ${error.message}`);
    for (const row of data) byRowId.set(row.id, row.image_url ?? null);
    if (data.length < 1000) return byRowId;
  }
}

let updates = planned;
if (isOnlyMissing && !rollbackFile) {
  const liveByRowId = await fetchLiveImageUrls();
  updates = planned.filter((update) => !isLiveImageUrl(liveByRowId.get(update.rowId)));
  console.log(`--only-missing: ${planned.length} planned -> ${updates.length} row(s) still without a photo.`);
}

if (updates.length === 0) {
  console.log('Nothing to apply: no uploaded manifest entries.');
  process.exit(0);
}

console.log(`${rollbackFile ? 'Rolling back' : 'Applying'} ${updates.length} row update(s).`);

if (!isCommit) {
  for (const update of updates.slice(0, 10)) {
    console.log(`  ${update.rowId} -> ${update.imageUrl ?? 'null'}`);
  }
  if (updates.length > 10) console.log(`  ... and ${updates.length - 10} more`);
  console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.');
  process.exit(0);
}

if (!rollbackFile) {
  const { items } = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackPath = resolve(IMAGES_DIR, `rollback-${stamp}.json`);
  writeFileSync(rollbackPath, `${JSON.stringify(buildRollback(updates, items), null, 2)}\n`);
  console.log(`rollback snapshot written to ${rollbackPath}`);
}

let applied = 0;
const failures = [];

for (const update of updates) {
  const { error } = await supabase
    .from('menu_items')
    .update({ image_url: update.imageUrl })
    .eq('id', update.rowId);
  if (error) {
    failures.push({ rowId: update.rowId, message: error.message });
    console.error(`  FAIL  ${update.rowId}: ${error.message}`);
    continue;
  }
  applied += 1;
}

console.log(`\napplied ${applied}, failed ${failures.length}`);
if (failures.length > 0) process.exit(1);

#!/usr/bin/env node --experimental-strip-types
// Merchant phase 5 — write uploaded ImageKit URLs back to the merchants table.
//
// The merchant manifest carries pseudo-rows keyed `<merchantId>::logo` and
// `<merchantId>::cover`; the suffix selects which column the write targets.
//
// Dry-run by default. Pass --commit to actually write. Every run captures the
// previous URL of each affected column to docs/images/merchant-rollback-<stamp>.json
// first, so the whole batch can be undone.
//
// Usage:
//   node --experimental-strip-types scripts/applyMerchantImageUrls.mjs           # dry run
//   node --experimental-strip-types scripts/applyMerchantImageUrls.mjs --commit  # write
//   node --experimental-strip-types scripts/applyMerchantImageUrls.mjs --rollback <file>

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, requireEnv, projectRoot } from './loadEnv.mjs';
import { buildMerchantRowUpdates, parseMerchantRowId } from '../src/lib/imageCatalog.ts';

const IMAGES_DIR = resolve(projectRoot, 'docs/images');
const MANIFEST_PATH = resolve(IMAGES_DIR, 'merchant-manifest.json');
const SNAPSHOT_PATH = resolve(IMAGES_DIR, 'merchant-snapshot.json');

const args = process.argv.slice(2);
const isCommit = args.includes('--commit');
const rollbackIndex = args.indexOf('--rollback');
const rollbackFile = rollbackIndex >= 0 ? args[rollbackIndex + 1] : null;

const env = loadEnv();
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = requireEnv(env, [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
]);

const updates = rollbackFile
  ? JSON.parse(readFileSync(resolve(process.cwd(), rollbackFile), 'utf8'))
  : buildMerchantRowUpdates(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')));

if (updates.length === 0) {
  console.log('Nothing to apply: no uploaded merchant manifest entries.');
  process.exit(0);
}

console.log(`${rollbackFile ? 'Rolling back' : 'Applying'} ${updates.length} merchant column update(s).`);

if (!isCommit) {
  for (const update of updates.slice(0, 10)) {
    console.log(`  ${update.merchantId}.${update.column} -> ${update.imageUrl ?? 'null'}`);
  }
  if (updates.length > 10) console.log(`  ... and ${updates.length - 10} more`);
  console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.');
  process.exit(0);
}

if (!rollbackFile) {
  // The snapshot stores the same `<id>::<suffix>` pseudo-rows the manifest uses,
  // so the previous value of each targeted column is recoverable by key.
  const { items } = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  const previousByTarget = new Map();
  for (const item of items) {
    const target = parseMerchantRowId(item.id);
    if (target) previousByTarget.set(`${target.merchantId}:${target.column}`, item.imageUrl ?? null);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rollbackPath = resolve(IMAGES_DIR, `merchant-rollback-${stamp}.json`);
  const rollback = updates
    .filter((update) => previousByTarget.has(`${update.merchantId}:${update.column}`))
    .map((update) => ({
      merchantId: update.merchantId,
      column: update.column,
      imageUrl: previousByTarget.get(`${update.merchantId}:${update.column}`),
    }));
  writeFileSync(rollbackPath, `${JSON.stringify(rollback, null, 2)}\n`);
  console.log(`rollback snapshot written to ${rollbackPath}`);
}

// merchants writes require an authenticated session (RLS).
const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
const { error: authError } = await supabase.auth.signInWithPassword({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
});
if (authError) {
  console.error(`Admin sign-in failed: ${authError.message}`);
  process.exit(1);
}

let applied = 0;
const failures = [];

for (const update of updates) {
  const { error } = await supabase
    .from('merchants')
    .update({ [update.column]: update.imageUrl })
    .eq('id', update.merchantId);
  if (error) {
    failures.push({ merchantId: update.merchantId, message: error.message });
    console.error(`  FAIL  ${update.merchantId}.${update.column}: ${error.message}`);
    continue;
  }
  applied += 1;
}

console.log(`\napplied ${applied}, failed ${failures.length}`);
if (failures.length > 0) process.exit(1);

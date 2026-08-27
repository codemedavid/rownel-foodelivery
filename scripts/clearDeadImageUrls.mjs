#!/usr/bin/env node --experimental-strip-types
// Phase 6 — null out image URLs whose host is disabled.
//
// A row still pointing at the dead cloud renders a broken-image icon, because
// the UI only checks that the URL is non-empty. Nulling it lets the same UI fall
// through to its proper empty state. Nothing is sourced or replaced here — this
// only clears references that can no longer resolve.
//
// Dry-run by default. Pass --commit to write. Every run captures the previous
// values to docs/images/dead-url-rollback-<stamp>.json first.
//
// Usage:
//   node --experimental-strip-types scripts/clearDeadImageUrls.mjs           # dry run
//   node --experimental-strip-types scripts/clearDeadImageUrls.mjs --commit  # write

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnv, requireEnv, projectRoot } from './loadEnv.mjs';
import { isLiveImageUrl } from '../src/lib/imageCatalog.ts';

const IMAGES_DIR = resolve(projectRoot, 'docs/images');

/** Every column that holds an image reference, and the table it lives on. */
const TARGETS = [
  { table: 'merchants', columns: ['logo_url', 'cover_image_url'] },
  { table: 'menu_items', columns: ['image_url'] },
];

const isCommit = process.argv.includes('--commit');

const env = loadEnv();
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = requireEnv(env, [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
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

const dead = [];

for (const { table, columns } of TARGETS) {
  const rows = await fetchAll(table, ['id', ...columns].join(', '));
  for (const row of rows) {
    for (const column of columns) {
      const value = row[column];
      if (value && !isLiveImageUrl(value)) dead.push({ table, id: row.id, column, previous: value });
    }
  }
}

if (dead.length === 0) {
  console.log('Nothing to clear: no row points at a disabled host.');
  process.exit(0);
}

const byTarget = dead.reduce((acc, d) => {
  const k = `${d.table}.${d.column}`;
  return { ...acc, [k]: (acc[k] ?? 0) + 1 };
}, {});
console.log(`Clearing ${dead.length} dead reference(s): ${JSON.stringify(byTarget)}`);

if (!isCommit) {
  for (const d of dead.slice(0, 10)) console.log(`  ${d.table}.${d.column} ${d.id}`);
  if (dead.length > 10) console.log(`  ... and ${dead.length - 10} more`);
  console.log('\nDRY RUN — nothing written. Re-run with --commit to apply.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rollbackPath = resolve(IMAGES_DIR, `dead-url-rollback-${stamp}.json`);
writeFileSync(rollbackPath, `${JSON.stringify(dead, null, 2)}\n`);
console.log(`rollback snapshot written to ${rollbackPath}`);

const { error: authError } = await supabase.auth.signInWithPassword({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
});
if (authError) {
  console.error(`Admin sign-in failed: ${authError.message}`);
  process.exit(1);
}

let cleared = 0;
const failures = [];

for (const d of dead) {
  const { error } = await supabase.from(d.table).update({ [d.column]: null }).eq('id', d.id);
  if (error) {
    failures.push({ id: d.id, message: error.message });
    console.error(`  FAIL  ${d.table}.${d.column} ${d.id}: ${error.message}`);
    continue;
  }
  cleared += 1;
}

console.log(`\ncleared ${cleared}, failed ${failures.length}`);
if (failures.length > 0) process.exit(1);

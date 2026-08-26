#!/usr/bin/env node --experimental-strip-types
// Phase 2b — fold agent search results into the manifest.
//
// Reads every result-*.json produced by the search agents, attaches their
// candidates to the matching manifest entry, and verifies each chosen URL is
// actually fetchable before it is ever offered for review. Unreachable or
// non-image URLs are dropped, so a dead hotlink never reaches ImageKit.
//
// Usage:
//   node --experimental-strip-types scripts/mergeSearchResults.mjs <results-dir>

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from './loadEnv.mjs';
import { withCandidates } from '../src/lib/imageCatalog.ts';

const MANIFEST_PATH = resolve(projectRoot, 'docs/images/image-manifest.json');
const REACHABILITY_TIMEOUT_MS = 15000;
const MAX_CONCURRENT_CHECKS = 12;

const resultsDir = process.argv[2];
if (!resultsDir) {
  console.error('Usage: mergeSearchResults.mjs <results-dir>');
  process.exit(1);
}

const candidatesByKey = new Map();
let filesRead = 0;

for (const file of readdirSync(resultsDir).filter((f) => /^result-\d+\.json$/.test(f))) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolve(resultsDir, file), 'utf8'));
  } catch (error) {
    console.error(`  skipped ${file}: ${error.message}`);
    continue;
  }
  filesRead += 1;
  for (const entry of parsed) {
    const existing = candidatesByKey.get(entry.key) ?? [];
    candidatesByKey.set(entry.key, [...existing, ...(entry.candidates ?? [])]);
  }
}

console.log(`read ${filesRead} result file(s), ${candidatesByKey.size} product(s) with candidates`);

/** A candidate is only usable if the URL responds and actually serves an image. */
async function isReachableImage(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(REACHABILITY_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    return (response.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}

const allCandidates = [...candidatesByKey.values()].flat();
const verdicts = new Map();

for (let i = 0; i < allCandidates.length; i += MAX_CONCURRENT_CHECKS) {
  const batch = allCandidates.slice(i, i + MAX_CONCURRENT_CHECKS);
  const results = await Promise.all(batch.map((c) => isReachableImage(c.url)));
  batch.forEach((c, index) => verdicts.set(c.url, results[index]));
  process.stdout.write(`\r  verified ${Math.min(i + batch.length, allCandidates.length)}/${allCandidates.length}`);
}
console.log();

const dead = [...verdicts.values()].filter((ok) => !ok).length;
console.log(`  ${verdicts.size - dead} reachable, ${dead} dropped as unreachable or non-image`);

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const next = manifest.map((entry) => {
  if (entry.status === 'uploaded') return entry;
  const found = (candidatesByKey.get(entry.key) ?? []).filter((c) => verdicts.get(c.url));
  return withCandidates(entry, found);
});

writeFileSync(MANIFEST_PATH, `${JSON.stringify(next, null, 2)}\n`);

const counts = next.reduce((acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }), {});
console.log(`\nmanifest status: ${JSON.stringify(counts)}`);
console.log(`wrote ${MANIFEST_PATH}`);

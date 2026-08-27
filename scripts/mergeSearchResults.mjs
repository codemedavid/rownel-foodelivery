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
//   node --experimental-strip-types scripts/mergeSearchResults.mjs <results-dir> \
//     --manifest docs/images/merchant-manifest.json

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from './loadEnv.mjs';
import { withCandidates } from '../src/lib/imageCatalog.ts';

const manifestIndex = process.argv.indexOf('--manifest');
const MANIFEST_PATH = resolve(
  projectRoot,
  manifestIndex >= 0 ? process.argv[manifestIndex + 1] : 'docs/images/image-manifest.json',
);
const REACHABILITY_TIMEOUT_MS = 20000;
// Wikimedia throttles aggressively; verify one host at a time, paced and retried,
// so a 429 is never mistaken for a dead image.
const MAX_CONCURRENT_CHECKS = 3;
const PER_REQUEST_DELAY_MS = 200;
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 1500;
const USER_AGENT = 'rownel-foodelivery-image-audit/1.0 (catalog image verification)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * A candidate is only usable if the URL responds and actually serves an image.
 * Retries on 429/5xx: a throttled request means "ask again later", not "dead".
 */
async function isReachableImage(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REACHABILITY_TIMEOUT_MS),
      });
      if (response.status === 429 || response.status >= 500) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      if (!response.ok) return false;
      return (response.headers.get('content-type') ?? '').startsWith('image/');
    } catch {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  return false;
}

// Verification is advisory only. Some hosts (Wikimedia among them) block this
// network but serve ImageKit fine, so a failed check annotates the candidate
// rather than discarding it. The upload step is the real gate: it fails loudly
// per item without aborting the batch.
const verdicts = new Map();

if (process.argv.includes('--verify')) {
  const allCandidates = [...candidatesByKey.values()].flat();
  const unique = [...new Map(allCandidates.map((c) => [c.url, c])).values()];

  for (let i = 0; i < unique.length; i += MAX_CONCURRENT_CHECKS) {
    const batch = unique.slice(i, i + MAX_CONCURRENT_CHECKS);
    const results = await Promise.all(batch.map((c) => isReachableImage(c.url)));
    batch.forEach((c, index) => verdicts.set(c.url, results[index]));
    process.stdout.write(`\r  checked ${Math.min(i + batch.length, unique.length)}/${unique.length}`);
    await sleep(PER_REQUEST_DELAY_MS);
  }
  console.log();
  const unreachable = [...verdicts.values()].filter((ok) => !ok).length;
  console.log(`  ${verdicts.size - unreachable} confirmed reachable, ${unreachable} unverified (kept)`);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const next = manifest.map((entry) => {
  if (entry.status === 'uploaded') return entry;
  const found = (candidatesByKey.get(entry.key) ?? []).map((c) => ({
    ...c,
    ...(verdicts.has(c.url) ? { verified: verdicts.get(c.url) } : {}),
  }));
  return withCandidates(entry, found);
});

writeFileSync(MANIFEST_PATH, `${JSON.stringify(next, null, 2)}\n`);

const counts = next.reduce((acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }), {});
console.log(`\nmanifest status: ${JSON.stringify(counts)}`);
console.log(`wrote ${MANIFEST_PATH}`);

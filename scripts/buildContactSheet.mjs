#!/usr/bin/env node --experimental-strip-types
// Phase 3 helper — render the manifest as a local HTML contact sheet.
//
// Reviewing 362 entries as raw JSON is not realistic; this shows the actual
// image next to the product name so a wrong photo is obvious at a glance.
// Written as a local file (not a published artifact) because the images are
// remote URLs that a sandboxed page would refuse to load.
//
// Usage:
//   node --experimental-strip-types scripts/buildContactSheet.mjs
//   open docs/images/review.html

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from './loadEnv.mjs';

const MANIFEST_PATH = resolve(projectRoot, 'docs/images/image-manifest.json');
const OUTPUT_PATH = resolve(projectRoot, 'docs/images/review.html');

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

const THUMBNAIL_TRANSFORM = '?tr=w-300,q-75,f-auto';

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
// Only entries that would actually be written, plus those held back for a decision.
const reviewable = manifest.filter((e) => e.imagekitUrl || e.status === 'pending-review');

const ORDER = { official: 0, likely: 1, generic: 2 };
const sorted = [...reviewable].sort((a, b) => {
  const byConfidence = ORDER[a.candidates[0]?.confidence] - ORDER[b.candidates[0]?.confidence];
  return byConfidence !== 0 ? byConfidence : a.key.localeCompare(b.key);
});

const card = (entry) => {
  const confidence = entry.candidates[0]?.confidence ?? 'none';
  const rowCount = (entry.targetRowIds ?? entry.rowIds).length;
  // Prefer the uploaded asset: it is what customers will actually see, and some
  // original hosts refuse requests that ImageKit itself handles fine.
  const src = entry.imagekitUrl ? `${entry.imagekitUrl}${THUMBNAIL_TRANSFORM}` : entry.chosenUrl;
  const held = entry.status === 'pending-review' ? '<span class="held">HELD — needs your call</span>' : '';
  return `<figure class="card ${confidence}" data-key="${escapeHtml(entry.key)}">
  <img src="${escapeHtml(src)}" alt="${escapeHtml(entry.productName)}" loading="lazy">
  <figcaption>
    <strong>${escapeHtml(entry.productName)}</strong>
    <span class="brand">${escapeHtml(entry.brand)}</span>
    <span class="meta"><em class="tag">${confidence}</em> · ${rowCount} row(s)</span>
    ${held}
    <a class="key" href="${escapeHtml(entry.chosenUrl ?? '#')}" target="_blank" rel="noreferrer">${escapeHtml(entry.key)}</a>
  </figcaption>
</figure>`;
};

const counts = sorted.reduce((acc, e) => {
  const c = e.candidates[0]?.confidence ?? 'none';
  return { ...acc, [c]: (acc[c] ?? 0) + 1 };
}, {});

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Catalog image review</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #fafafa; color: #111; }
  h1 { margin-bottom: .25rem; }
  .summary { color: #555; margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
  .card { margin: 0; background: #fff; border: 1px solid #e2e2e2; border-radius: 8px; overflow: hidden; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: cover; background: #f0f0f0; display: block; }
  figcaption { padding: .6rem; font-size: .8rem; line-height: 1.4; }
  .brand { display: block; color: #666; }
  .meta { display: block; color: #888; margin-top: .3rem; }
  .tag { font-style: normal; font-weight: 600; padding: .1rem .35rem; border-radius: 4px; }
  .official .tag { background: #d8f5dd; color: #16643a; }
  .likely   .tag { background: #fff2cc; color: #7a5b00; }
  .generic  .tag { background: #ffe0e0; color: #8a1f1f; }
  .held { display: block; margin-top: .3rem; font-weight: 700; color: #8a1f1f; font-size: .72rem; }
  .key { display: block; margin-top: .3rem; color: #aaa; font-size: .68rem; text-decoration: none; word-break: break-all; }
  .key:hover { color: #555; text-decoration: underline; }
</style></head>
<body>
<h1>Catalog image review</h1>
<p class="summary">${sorted.length} entries — ${JSON.stringify(counts)} — covering
${sorted.reduce((n, e) => n + (e.targetRowIds ?? e.rowIds).length, 0)} catalog rows.
Thumbnails are served from ImageKit, so this is exactly what customers would see.
Green is brand-official, red is generic stock. Scan for any photo that does not match its label;
click the grey key under a card to open the original source image.</p>
<div class="grid">
${sorted.map(card).join('\n')}
</div>
</body></html>
`;

writeFileSync(OUTPUT_PATH, html);
console.log(`wrote ${OUTPUT_PATH} (${sorted.length} entries: ${JSON.stringify(counts)})`);

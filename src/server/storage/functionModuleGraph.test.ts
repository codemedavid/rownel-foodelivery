import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The package is `"type": "module"`, so Vercel's Node.js runtime loads the transpiled
// functions through Node's ESM resolver. That resolver does no extension guessing: it
// resolves a relative specifier to exactly the path written. Vercel transpiles each
// file in place rather than bundling the graph into one artifact, and it copies the
// specifiers through untouched, so an extensionless `'./authorization'` that every
// bundler here resolves happily becomes a hard ERR_MODULE_NOT_FOUND in production the
// first time the function is invoked.
//
// Nothing else in the toolchain catches this. Vitest, Vite and `tsc` all resolve the
// extensionless form, and the deploy itself succeeds — the crash only appears at
// runtime. So walk the real graph from the `api/` entry points and require every
// relative hop to carry the extension Node will look for.

const REPO_ROOT = resolve(__dirname, '../../..');
const API_DIR = resolve(REPO_ROOT, 'api');

/** Matches `from '...'` and bare `import '...'`, the only specifier forms in use here. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g;

/** Unreadable files yield nothing: the missing-file assertion below reports them. */
function readSpecifiers(file: string): string[] {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return [...source.matchAll(SPECIFIER)].map(([, specifier]) => specifier);
}

/** Resolves a `.js` specifier back to the TypeScript source that produces it. */
function sourceFileFor(specifier: string, importer: string): string {
  const target = resolve(dirname(importer), specifier);
  return target.replace(/\.js$/, '.ts');
}

function entryPoints(): string[] {
  return readdirSync(API_DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => resolve(API_DIR, name));
}

/** Every module Vercel deploys alongside the functions, entry points included. */
function collectGraph(): { file: string; specifier: string; importer: string }[] {
  const hops: { file: string; specifier: string; importer: string }[] = [];
  const seen = new Set<string>();
  const queue = entryPoints();

  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of readSpecifiers(file)) {
      if (!specifier.startsWith('.')) continue; // bare specifiers resolve via node_modules
      hops.push({ file: sourceFileFor(specifier, file), specifier, importer: file });
      queue.push(sourceFileFor(specifier, file));
    }
  }
  return hops;
}

describe('serverless function module graph', () => {
  const hops = collectGraph();

  it('walks a non-trivial graph, so a passing run means something', () => {
    expect(hops.length).toBeGreaterThan(5);
  });

  it('gives every relative import the explicit extension Node ESM requires', () => {
    const extensionless = hops
      .filter((hop) => !hop.specifier.endsWith('.js'))
      .map((hop) => `${relative(REPO_ROOT, hop.importer)} imports '${hop.specifier}'`);

    expect(extensionless).toEqual([]);
  });

  it('points every relative import at a file that exists', () => {
    const missing = hops
      .filter((hop) => {
        try {
          readFileSync(hop.file);
          return false;
        } catch {
          return true;
        }
      })
      .map((hop) => `${relative(REPO_ROOT, hop.importer)} imports '${hop.specifier}'`);

    expect(missing).toEqual([]);
  });
});

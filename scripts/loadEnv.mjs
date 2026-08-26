import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(scriptsDir, '..');

/** Reads .env.local, falling back to process.env so secrets can be passed inline. */
export function loadEnv() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(resolve(projectRoot, '.env.local'), 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (!match) continue;
      let value = match[2];
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (!out[match[1]]) out[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return out;
}

export function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  return Object.fromEntries(keys.map((key) => [key, env[key]]));
}

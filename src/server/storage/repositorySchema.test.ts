import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The storage repository reaches Supabase through PostgREST, which resolves column names
// at request time. A column the migrations never created is not a type error and not a
// test failure anywhere else in this repo — it is a 42703 at runtime, which the repository
// turns into a thrown error and the handler turns into a blanket 500. So the first time
// anyone uploads a receipt, the endpoint fails with a message that names nothing.
//
// Nothing else can catch this. The Supabase client is faked in every other suite, so the
// column list is never compared against the schema that ships beside it. This test reads
// the real SELECTs out of api/storage.ts and requires every column to exist in the
// migrations, so the two stay in step.

const REPO_ROOT = resolve(__dirname, '../../..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'supabase/migrations');
const API_STORAGE = resolve(REPO_ROOT, 'api/storage.ts');

/** `.from('orders')` followed by `.select('a,b,c')`, across the intervening newlines. */
const QUERY = /\.from\(\s*'([^']+)'\s*\)\s*\.select\(\s*'([^']+)'\s*\)([\s\S]{0,200}?);/g;
/** `.eq('column', …)` filters, which PostgREST resolves the same way a select does. */
const FILTER = /\.eq\(\s*'([^']+)'/g;

function migrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8'))
    .join('\n');
}

/** Body of every `CREATE TABLE <table> ( … )`, paren-balanced so CHECK and numeric(…) survive. */
function createTableBodies(sql: string, table: string): string[] {
  const opener = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:public\\.)?${table}\\s*\\(`,
    'gi',
  );
  const bodies: string[] = [];
  for (const match of sql.matchAll(opener)) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < sql.length && depth > 0) {
      if (sql[index] === '(') depth += 1;
      if (sql[index] === ')') depth -= 1;
      index += 1;
    }
    bodies.push(sql.slice(start, index - 1));
  }
  return bodies;
}

function declaredColumns(sql: string, table: string): Set<string> {
  const columns = new Set<string>();

  for (const body of createTableBodies(sql, table)) {
    let depth = 0;
    let current = '';
    const parts: string[] = [];
    for (const character of body) {
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      if (character === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += character;
    }
    parts.push(current);
    for (const part of parts) {
      const name = part.trim().split(/\s+/)[0]?.toLowerCase();
      // Table-level constraints share the comma list with real columns.
      if (name && /^[a-z_][a-z0-9_]*$/.test(name)) columns.add(name);
    }
  }

  const alter = new RegExp(
    `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${table}\\b([\\s\\S]*?);`,
    'gi',
  );
  for (const statement of sql.matchAll(alter)) {
    const adds = statement[1].matchAll(
      /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi,
    );
    for (const add of adds) columns.add(add[1].toLowerCase());
  }

  return columns;
}

/** Every (table, column) pair api/storage.ts asks PostgREST to resolve. */
function requiredColumns(): { table: string; column: string }[] {
  const source = readFileSync(API_STORAGE, 'utf8');
  const required: { table: string; column: string }[] = [];
  for (const [, table, selected, trailing] of source.matchAll(QUERY)) {
    for (const column of selected.split(',')) {
      required.push({ table, column: column.trim().toLowerCase() });
    }
    for (const [, column] of trailing.matchAll(FILTER)) {
      required.push({ table, column: column.toLowerCase() });
    }
  }
  return required;
}

describe('storage repository schema contract', () => {
  const required = requiredColumns();

  it('finds the repository queries, so a passing run means something', () => {
    expect(new Set(required.map((entry) => entry.table))).toEqual(
      new Set(['staff', 'orders', 'riders']),
    );
    expect(required.length).toBeGreaterThan(8);
  });

  it('has a migration for every column the repository selects or filters on', () => {
    const sql = migrationSql();
    const byTable = new Map<string, Set<string>>();
    const missing = required
      .filter(({ table, column }) => {
        if (!byTable.has(table)) byTable.set(table, declaredColumns(sql, table));
        return !byTable.get(table)?.has(column);
      })
      .map(({ table, column }) => `${table}.${column}`);

    expect([...new Set(missing)]).toEqual([]);
  });
});

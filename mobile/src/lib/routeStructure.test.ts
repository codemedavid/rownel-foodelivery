// Structural guard for Expo Router. Names in parentheses are *route groups*:
// they add no path segment, so `app/(a)/index.tsx` and `app/(b)/index.tsx`
// both resolve to "/" and the router picks one non-deterministically. That
// silently serves the wrong group's screen to everyone, signed in or not —
// which is exactly how (rider)/index.tsx once shadowed the storefront.

// Declared locally so the guard needs no @types/node dependency.
declare const require: (moduleName: string) => any;
declare const __dirname: string;

interface DirEntry {
  name: string;
  isDirectory: () => boolean;
}

const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..', '..', 'app');
const INDEX_FILES = ['index.tsx', 'index.ts', 'index.jsx', 'index.js'];

const routeGroups = (): string[] =>
  (fs.readdirSync(APP_DIR, { withFileTypes: true }) as DirEntry[])
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('(') && entry.name.endsWith(')'))
    .map((entry) => entry.name)
    .sort();

const ownsRootRoute = (group: string): boolean =>
  INDEX_FILES.some((file) => fs.existsSync(path.join(APP_DIR, group, file)));

describe('expo-router route groups', () => {
  it('finds the app route groups', () => {
    expect(routeGroups().length).toBeGreaterThan(1);
  });

  it('lets only the customer storefront own the root "/" route', () => {
    expect(routeGroups().filter(ownsRootRoute)).toEqual(['(tabs)']);
  });
});

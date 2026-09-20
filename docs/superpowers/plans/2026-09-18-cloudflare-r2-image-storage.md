# Cloudflare R2 Image Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ImageKit and third-party image references with secure Cloudflare R2 storage, optimized public delivery, authorized private delivery, and a reversible migration pipeline.

**Architecture:** A Vercel API route authenticates Supabase sessions and issues short-lived, operation-specific R2 URLs signed with `aws4fetch`; clients upload directly to R2. Public assets use `images.row-nel.com` and Cloudflare Image Transformations, while receipts and rider photos store private object keys and resolve temporary read URLs after record-level authorization.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Vercel Node.js Functions, Supabase Auth/Postgres, Cloudflare R2 S3 API, Cloudflare Images transformations, `aws4fetch`, `undici`, Wrangler, Node migration scripts.

> **Revision 2026-09-19.** Tasks 1–4 are accepted (see `2026-09-19-cloudflare-r2-handoff.md` for commits). This revision corrects the plan where the accepted code or the Task 5 security review diverged from the original text: scoped object keys, the Node.js runtime for `api/storage.ts`, the Task 5 remediation steps, the Task 9 key-shape constraints, the migration key rules in Task 12, and the mobile scope. Where an earlier task's text is now stale, a **Revision note** says what the accepted code actually does; do not re-do accepted tasks to match old text.

---

## File Map

New focused modules:

- `src/lib/storageTypes.ts` — shared categories, contexts, upload/download response types, limits, and public/private category metadata.
- `src/lib/storage.ts` — browser-safe validation, API calls, direct PUT upload, delete request, private URL request, and R2 transformation URL construction.
- `src/server/storage/r2.ts` — server-only R2 configuration, generated keys, S3 URLs, and signing.
- `src/server/storage/authorization.ts` — pure role/resource authorization decisions over a small repository interface.
- `src/server/storage/remoteImport.ts` — HTTPS redirect, address, MIME signature, byte-limit, and timeout enforcement; hands validated addresses to the transport.
- `src/server/storage/storageNetwork.ts` — Node-only Cloudflare DoH resolver and `undici`-based pinned fetch transport. Lives under `src/server/`, **not** `api/`: every file in `api/` is deployed as a Vercel route.
- `src/server/storage/handler.ts` — testable request dispatcher for upload, download, delete, and URL import.
- `api/storage.ts` — production dependency wiring for Supabase and environment variables (Node.js runtime; see Task 5).
- `src/hooks/usePrivateImageUrl.ts` — fetches and refreshes temporary private URLs without persisting them.
- `src/lib/storageMigration.ts` — pure provider-neutral manifest transitions and database update generation.
- `scripts/imageStorageAudit.mjs` — inventories all public/private image fields into a provider-neutral manifest.
- `scripts/uploadImagesToR2.mjs` — uploads, checksums, verifies, and checkpoints migration entries.
- `scripts/applyR2ImageUrls.mjs` — dry-run/commit/rollback application across all image-bearing tables.
- `infra/r2-cors.json` — direct-browser upload CORS policy.
- `docs/deployment/cloudflare-r2.md` — beginner-safe Cloudflare, DNS, buckets, token, Vercel, smoke-test, and rollback runbook.

Provider-specific files removed only after their replacements are green:

- `src/lib/imagekit.ts`
- `src/lib/imagekit.test.ts`
- `api/imagekit-auth.ts`
- `supabase/functions/imagekit-auth/index.ts`
- `scripts/uploadImagesToImageKit.mjs`

Existing files modified:

- `package.json`, `package-lock.json`, `.env.example`, `vitest.config.ts`
- `src/hooks/useImageUpload.ts`, `src/hooks/useImageUpload.test.ts`
- `src/components/ImageUpload.tsx`, `src/components/OptimizedImage.tsx`, and their tests
- public upload call sites in `AdminDashboard.tsx`, `MerchantManager.tsx`, `PromotionManager.tsx`, `PaymentMethodManager.tsx`, and `SiteSettingsManager.tsx`
- rider/private rendering call sites in `RiderProfilePage.tsx`, `RiderDashboard.tsx`, `CustomerRiderPanel.tsx`, `OrdersManager.tsx`, and `StaffOrdersPanel.tsx`
- `src/lib/supabase.ts`, `src/lib/deliveryApi.ts`, `src/lib/deliveryTypes.ts`, `src/hooks/useOrders.ts`, `src/hooks/useRiderProfile.ts`
- `src/lib/imageCatalog.ts`, `src/lib/imageCatalog.test.ts`, `scripts/buildContactSheet.mjs`, `scripts/applyImageUrls.mjs`, and `scripts/applyMerchantImageUrls.mjs` for manifest compatibility
- mobile mappers/types/tests so private object keys do not masquerade as public URLs

## Task 1: Establish shared storage vocabulary and R2 URL behavior

**Files:**
- Create: `src/lib/storageTypes.ts`
- Create: `src/lib/storage.test.ts`
- Create: `src/lib/storage.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write a failing test for validation, category metadata, URL extraction, and transformations**

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildPublicImageUrl,
  extractPublicObjectKey,
  validateImageFile,
} from './storage';
import { ASSET_CATEGORIES, MAX_IMAGE_BYTES } from './storageTypes';

beforeEach(() => {
  (import.meta.env as Record<string, unknown>).VITE_R2_PUBLIC_URL = 'https://images.row-nel.com';
});

describe('R2 public image behavior', () => {
  it('classifies public and private categories', () => {
    expect(ASSET_CATEGORIES['menu-item'].visibility).toBe('public');
    expect(ASSET_CATEGORIES.receipt.visibility).toBe('private');
    expect(ASSET_CATEGORIES['rider-photo'].visibility).toBe('private');
  });

  it('builds a Cloudflare transform with original fallback only for our public host', () => {
    const source = 'https://images.row-nel.com/menu-items/a.jpg';
    expect(buildPublicImageUrl(source, { width: 400, quality: 80, format: 'auto' }))
      .toBe('https://images.row-nel.com/cdn-cgi/image/width=400,quality=80,format=auto,onerror=redirect/menu-items/a.jpg');
    expect(buildPublicImageUrl('https://ik.imagekit.io/legacy/a.jpg', { width: 400 }))
      .toBe('https://ik.imagekit.io/legacy/a.jpg');
  });

  it('extracts only R2 public object keys', () => {
    expect(extractPublicObjectKey('https://images.row-nel.com/merchants/logos/a.png?x=1'))
      .toBe('merchants/logos/a.png');
    expect(extractPublicObjectKey('https://example.com/a.png')).toBeNull();
  });

  it('rejects unsupported and oversized files', () => {
    const pdf = new File(['x'], 'receipt.pdf', { type: 'application/pdf' });
    expect(() => validateImageFile(pdf)).toThrow(/JPEG, PNG, WebP, GIF/);
    const large = new File(['x'], 'large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(large, 'size', { value: MAX_IMAGE_BYTES + 1 });
    expect(() => validateImageFile(large)).toThrow(/10MB/);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- src/lib/storage.test.ts`

Expected: FAIL because `./storage` and `./storageTypes` do not exist.

- [ ] **Step 3: Implement the shared types and pure browser helpers**

```ts
// src/lib/storageTypes.ts
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'] as const;

export type AssetCategory =
  | 'menu-item' | 'merchant-logo' | 'merchant-cover' | 'site-logo'
  | 'promotion' | 'payment-qr' | 'receipt' | 'rider-photo';
export type AssetVisibility = 'public' | 'private';

export const ASSET_CATEGORIES: Record<AssetCategory, { visibility: AssetVisibility; prefix: string }> = {
  'menu-item': { visibility: 'public', prefix: 'menu-items' },
  'merchant-logo': { visibility: 'public', prefix: 'merchants/logos' },
  'merchant-cover': { visibility: 'public', prefix: 'merchants/covers' },
  'site-logo': { visibility: 'public', prefix: 'site/logo' },
  promotion: { visibility: 'public', prefix: 'promotions' },
  'payment-qr': { visibility: 'public', prefix: 'payment-methods' },
  receipt: { visibility: 'private', prefix: 'receipts' },
  'rider-photo': { visibility: 'private', prefix: 'rider-photos' },
};

export interface StorageContext { merchantId?: string; orderId?: string; riderId?: string }
export interface ImageTransform {
  width?: number; height?: number; quality?: number; format?: 'auto' | 'webp' | 'jpg' | 'png';
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad'; dpr?: number;
}
export interface UploadGrant { uploadUrl: string; objectKey: string; publicUrl?: string; expiresAt: number }
```

```ts
// pure portion of src/lib/storage.ts
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, type ImageTransform } from './storageTypes';

const publicOrigin = () => {
  const value = import.meta.env.VITE_R2_PUBLIC_URL as string | undefined;
  if (!value) throw new Error('R2 is not configured. Set VITE_R2_PUBLIC_URL.');
  return value.replace(/\/$/, '');
};

export function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase() as typeof ALLOWED_IMAGE_TYPES[number])) {
    throw new Error('Please upload a valid image file (JPEG, PNG, WebP, GIF)');
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image size must be less than 10MB');
}

export function extractPublicObjectKey(src: string | null | undefined): string | null {
  if (!src) return null;
  try {
    const base = new URL(publicOrigin());
    const url = new URL(src);
    return url.origin === base.origin ? decodeURIComponent(url.pathname.replace(/^\//, '')) : null;
  } catch { return null; }
}

export function buildPublicImageUrl(src: string | null | undefined, t?: ImageTransform): string {
  if (!src) return '';
  const key = extractPublicObjectKey(src);
  if (!key || !t) return src;
  const options = [
    t.width && t.width > 0 ? `width=${Math.round(t.width)}` : '',
    t.height && t.height > 0 ? `height=${Math.round(t.height)}` : '',
    t.fit ? `fit=${t.fit}` : '',
    t.quality && t.quality > 0 ? `quality=${Math.round(t.quality)}` : '',
    t.format ? `format=${t.format}` : '',
    t.dpr && t.dpr > 0 ? `dpr=${t.dpr}` : '',
    'onerror=redirect',
  ].filter(Boolean).join(',');
  return `${publicOrigin()}/cdn-cgi/image/${options}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
```

Also replace the `imagekit.ts` coverage entry with `storage.ts` and `storageTypes.ts` in `vitest.config.ts`.

- [ ] **Step 4: Run the test and confirm GREEN**

Run: `npm test -- src/lib/storage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the slice**

```bash
git add src/lib/storageTypes.ts src/lib/storage.ts src/lib/storage.test.ts vitest.config.ts
git commit -m "feat: define provider-neutral image storage"
```

## Task 2: Add server-only R2 signing

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/server/storage/r2.test.ts`
- Create: `src/server/storage/r2.ts`

- [ ] **Step 1: Install the Edge-compatible signer**

Run: `npm install aws4fetch`

Expected: `aws4fetch` appears under `dependencies` and the lockfile changes.

- [ ] **Step 2: Write a failing signer test**

```ts
import { describe, expect, it } from 'vitest';
import { createR2Store } from './r2';

const store = createR2Store({
  accountId: 'account', accessKeyId: 'access', secretAccessKey: 'secret',
  publicBucket: 'rownel-public-images', privateBucket: 'rownel-private-images',
  publicUrl: 'https://images.row-nel.com',
});

describe('R2 signing', () => {
  it('generates opaque keys under the server-owned category prefix', () => {
    const key = store.createObjectKey('menu-item', 'image/jpeg', {}, '00000000-0000-4000-8000-000000000000');
    expect(key).toBe('menu-items/00000000-0000-4000-8000-000000000000.jpg');
  });

  it('includes content-type in a short-lived PUT signature', async () => {
    const signed = await store.signPut('rownel-public-images', 'menu-items/a.jpg', 'image/jpeg', 300);
    expect(signed).toContain('X-Amz-Expires=300');
    expect(signed).toContain('X-Amz-SignedHeaders=content-type%3Bhost');
    expect(signed).not.toContain('secret');
  });
});
```

- [ ] **Step 3: Run the test and confirm RED**

Run: `npm test -- src/server/storage/r2.test.ts`

Expected: FAIL because `r2.ts` does not exist.

- [ ] **Step 4: Implement configuration, keys, and GET/PUT/DELETE/HEAD signing**

Use `AwsClient` with `service: 's3'`, `region: 'auto'`, percent-encode each key segment, and sign query URLs with `X-Amz-Expires`. Map MIME types to `jpg`, `png`, `webp`, and `gif`. For private categories insert the authenticated owner segment between the prefix and UUID; reject a missing owner. Export:

```ts
export interface R2Config {
  accountId: string; accessKeyId: string; secretAccessKey: string;
  publicBucket: string; privateBucket: string; publicUrl: string;
}

export function createR2Store(config: R2Config) {
  return {
    createObjectKey(category: AssetCategory, mimeType: string, context: StorageContext, id?: string): string,
    publicUrl(key: string): string,
    signPut(bucket: string, key: string, mimeType: string, expiresSeconds?: number): Promise<string>,
    signGet(bucket: string, key: string, expiresSeconds?: number): Promise<string>,
    deleteObject(bucket: string, key: string): Promise<boolean>,
    headObject(bucket: string, key: string): Promise<boolean>,
    putObject(bucket: string, key: string, mimeType: string, bytes: Uint8Array): Promise<void>,
  };
}
```

Default presigned lifetime: 300 seconds. Ensure returned errors name the R2 operation and status but never include credentials or a full signed query string.

- [ ] **Step 5: Run the signer tests and commit**

Run: `npm test -- src/server/storage/r2.test.ts`

Expected: PASS.

```bash
git add package.json package-lock.json src/server/storage/r2.ts src/server/storage/r2.test.ts
git commit -m "feat: sign scoped Cloudflare R2 operations"
```

## Task 3: Implement resource-level storage authorization

**Files:**
- Create: `src/server/storage/authorization.test.ts`
- Create: `src/server/storage/authorization.ts`

- [ ] **Step 1: Write table-driven failing authorization tests**

```ts
import { describe, expect, it } from 'vitest';
import { authorizeStorageAction } from './authorization';

const repo = {
  getStaff: async (id: string) => id === 'staff' ? { active: true, allMerchants: false, merchantIds: ['m1'] } : null,
  getOrder: async () => ({ id: 'o1', merchantId: 'm1', customerUserId: 'customer', assignedRiderId: 'rider', receiptObjectKey: 'receipts/customer/a.jpg' }),
  getRider: async () => ({ id: 'rider', photoObjectKey: 'rider-photos/rider/a.jpg' }),
};

describe('storage authorization', () => {
  it.each([
    ['admin public upload', { id: 'admin', role: 'admin' }, 'create-upload', 'site-logo', {}, true],
    ['scoped staff merchant upload', { id: 'staff', role: 'staff' }, 'create-upload', 'menu-item', { merchantId: 'm1' }, true],
    ['wrong merchant staff upload', { id: 'staff', role: 'staff' }, 'create-upload', 'menu-item', { merchantId: 'm2' }, false],
    ['rider own photo', { id: 'rider', role: 'rider' }, 'create-upload', 'rider-photo', { riderId: 'rider' }, true],
    ['rider other photo', { id: 'rider', role: 'rider' }, 'create-upload', 'rider-photo', { riderId: 'other' }, false],
    ['customer own receipt read', { id: 'customer', role: 'customer' }, 'create-download', 'receipt', { orderId: 'o1' }, true],
    ['rider receipt read', { id: 'rider', role: 'rider' }, 'create-download', 'receipt', { orderId: 'o1' }, false],
  ])('%s', async (_name, actor, action, category, context, allowed) => {
    await expect(authorizeStorageAction(repo, actor, action, category, context))
      .resolves.toMatchObject({ allowed });
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- src/server/storage/authorization.test.ts`

Expected: FAIL because the authorization module is absent.

- [ ] **Step 3: Implement the policy as a deep module**

Define `StorageActor`, `StorageAction`, `StorageRepository`, and an `AuthorizationResult` union. The implementation must derive private keys from repository records, never from client context. Apply these exact rules:

```ts
const GLOBAL_ADMIN_CATEGORIES = new Set(['site-logo', 'promotion']);
const MERCHANT_CATEGORIES = new Set(['menu-item', 'merchant-logo', 'merchant-cover', 'payment-qr']);

// admin: all actions/categories
// active staff: merchant categories and receipts only when allMerchants or merchantIds includes record/context merchant
// rider: create/delete own rider-photo; read own photo
// customer: create/read/delete receipt only when order.customerUserId matches actor.id
// customer: read rider-photo only when an order owned by that customer is assigned to that rider
// everyone else: denied
```

Return `{ allowed: true, objectKey? }` for success and `{ allowed: false }` for denial. Download authorization returns the object key loaded from the repository. Delete authorization approves only the resource/category context; Task 4 separately validates the supplied old reference against the configured R2 host, category prefix, and authenticated private-owner prefix. Do not distinguish nonexistent from forbidden private resources in the handler response.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/server/storage/authorization.test.ts`

Expected: PASS.

```bash
git add src/server/storage/authorization.ts src/server/storage/authorization.test.ts
git commit -m "feat: authorize image storage by resource scope"
```

## Task 4: Build the authenticated storage API for direct uploads and private reads

**Files:**
- Create: `src/server/storage/handler.test.ts`
- Create: `src/server/storage/handler.ts`
- Create: `api/storage.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write one failing handler test for a direct public upload grant**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createStorageHandler } from './handler';

it('returns a scoped PUT grant without exposing credentials', async () => {
  const deps = makeStorageDeps({
    actor: { id: 'admin', role: 'admin' },
    authorize: vi.fn().mockResolvedValue({ allowed: true }),
    createObjectKey: vi.fn().mockReturnValue('menu-items/a.jpg'),
    signPut: vi.fn().mockResolvedValue('https://signed.example/put'),
    publicUrl: vi.fn().mockReturnValue('https://images.row-nel.com/menu-items/a.jpg'),
  });
  const handler = createStorageHandler(deps);
  const response = await handler(new Request('https://app.test/api/storage', {
    method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create-upload', category: 'menu-item', mimeType: 'image/jpeg', size: 1024, context: { merchantId: 'm1' } }),
  }));
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload).toEqual(expect.objectContaining({
    uploadUrl: 'https://signed.example/put', objectKey: 'menu-items/a.jpg',
    publicUrl: 'https://images.row-nel.com/menu-items/a.jpg',
  }));
  expect(JSON.stringify(payload)).not.toContain('secret');
});
```

The test helper must provide explicit defaults for session lookup, repository, clock, and R2 methods so each later behavior can override only its public boundary.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- src/server/storage/handler.test.ts`

Expected: FAIL because `handler.ts` does not exist.

- [ ] **Step 3: Implement `create-upload`, `create-download`, and `delete` vertical slices one test at a time**

For each behavior below, first add the named test, run it RED, implement the minimum dispatch branch, then run GREEN:

```ts
it('returns 401 without a valid Supabase bearer session')
it('returns 400 for unknown category, MIME type, excessive size, or incomplete context')
it('returns 403 when authorizeStorageAction denies the resource')
it('signs PUT for the correct public/private bucket and binds Content-Type')
it('looks up a private resource and signs GET for its trusted object key')
it('deletes only an authorized old reference in the expected category/owner prefix and treats a missing object as success')
it('never includes account ID, access key, secret, or bucket names in JSON errors')
```

The handler response contract is:

```ts
type StorageRequest =
  | { action: 'create-upload'; category: AssetCategory; mimeType: string; size: number; context: StorageContext }
  | { action: 'create-download'; category: 'receipt' | 'rider-photo'; context: StorageContext }
  | { action: 'delete'; category: AssetCategory; reference: string; context: StorageContext };

// create-upload -> UploadGrant
// create-download -> { downloadUrl: string; expiresAt: number }
// delete -> { ok: true; deleted: boolean }
```

Use a five-minute expiry. Return JSON with `Cache-Control: no-store`. Keep `createStorageHandler(deps)` platform-neutral and inject session/repository/R2 methods. For public deletion, extract the key from the configured public hostname and require its category prefix; for private deletion, require the authenticated owner prefix (`receipts/<customer-id>/` or `rider-photos/<rider-id>/`). Authorization must pass before the supplied reference is parsed or deleted.

- [ ] **Step 4: Wire production dependencies in `api/storage.ts`**

> **Revision note (2026-09-19):** the accepted commit exports `config = { runtime: 'edge' }`. Task 5 replaces that with the Node.js runtime because connection pinning is impossible on Edge. Do not add Edge-only assumptions elsewhere.

Read these server variables and fail with a generic configuration error when any are missing:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_PUBLIC_BUCKET
R2_PRIVATE_BUCKET
R2_PUBLIC_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Use the Supabase service client only after validating the caller JWT with `auth.getUser(jwt)`. Map `app_metadata.role`, the legacy admin email, and active staff rows into `StorageActor`. Repository queries must select only the authorization columns needed by Task 3.

> **Revision note (2026-09-19):** the accepted key layout is scoped, and the key is an authorization boundary: `menu-items/<merchantId>/<uuid>.<ext>`, `merchants/logos|covers/<merchantId>/…`, `payment-methods/<merchantId|global>/…`, `site/logo/<uuid>.<ext>`, `promotions/<uuid>.<ext>`, `receipts/<ownerUserId>/<orderId>/<uuid>.<ext>`, `rider-photos/<riderId>/<uuid>.<ext>`. Delete requests must match the exact shape for the category and the caller's scope; anything else is treated as foreign and left alone. Later tasks (9, 12) depend on this layout.

- [ ] **Step 5: Replace ImageKit examples in `.env.example`**

```dotenv
# Public and safe for the browser
VITE_R2_PUBLIC_URL=https://images.row-nel.com
VITE_CLOUDFLARE_IMAGE_TRANSFORMATIONS=true

# Server and migration scripts only; configure these in Vercel/local secrets.
# Never add VITE_ or EXPO_PUBLIC_ prefixes.
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_PUBLIC_BUCKET=rownel-public-images
# R2_PRIVATE_BUCKET=rownel-private-images
# R2_PUBLIC_URL=https://images.row-nel.com
```

- [ ] **Step 6: Run focused and full tests, then commit**

Run: `npm test -- src/server/storage/handler.test.ts src/server/storage/authorization.test.ts src/server/storage/r2.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all existing and new tests pass.

```bash
git add api/storage.ts src/server/storage .env.example
git commit -m "feat: add authenticated R2 storage API"
```

## Task 5: Add safe server-side URL imports

**Files:**
- Create: `src/server/storage/remoteImport.test.ts`
- Create: `src/server/storage/remoteImport.ts`
- Modify: `src/server/storage/handler.test.ts`
- Modify: `src/server/storage/handler.ts`

- [ ] **Step 1: Write failing tests for the remote-import threat model**

```ts
it.each([
  'http://example.com/a.jpg',
  'https://127.0.0.1/a.jpg',
  'https://169.254.169.254/latest/meta-data',
  'https://[::1]/a.jpg',
])('rejects unsafe source %s before fetching', async (sourceUrl) => { /* assert no fetch */ });

it('revalidates DNS and destination after every redirect', async () => { /* public -> private redirect is rejected */ });
it('rejects content-length above 10MB before reading')
it('stops a chunked body as soon as it exceeds 10MB')
it('rejects HTML served with an image content-type')
it.each(['jpeg', 'png', 'webp', 'gif'])('accepts a valid %s signature')
it('times out the fetch and returns an actionable import error')
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- src/server/storage/remoteImport.test.ts`

Expected: FAIL because `remoteImport.ts` does not exist.

- [ ] **Step 3: Implement bounded, signature-checked HTTPS fetching** *(done in `30c612e`; superseded details below)*

Export:

```ts
export interface RemoteImage {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  finalUrl: string;
}

export async function fetchRemoteImage(
  sourceUrl: string,
  deps: { fetch: typeof fetch; resolvePublicAddresses(hostname: string): Promise<string[]> },
  options?: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number },
): Promise<RemoteImage>;
```

Require HTTPS, reject credentialed URLs and non-default ports, classify every literal/resolved IPv4 and IPv6 address, use `redirect: 'manual'`, allow at most three redirects, and validate each target before its fetch. Read `ReadableStream` chunks with an early byte ceiling. Detect JPEG/PNG/WebP/GIF by magic bytes and ignore a misleading response header.

Production DNS resolution queries Cloudflare's DNS-over-HTTPS JSON endpoint for both A and AAAA records, fails closed on an empty/failed answer, and validates all returned addresses.

- [ ] **Step 3b: Remediate the four review findings on `30c612e` (separate commit, do not amend)**

Uncommitted WIP already exists for this step (`package.json`/lockfile add `undici`, `remoteImport.ts` returns the validated addresses and attaches them to the request under the `PINNED_REMOTE_ADDRESSES` symbol, and a transport/resolver module with tests). Inspect it with `git diff` and `git status` first; finish it, do not restart it. Then:

1. **Move the transport out of `api/`.** Relocate `api/storageNetwork.ts` to `src/server/storage/storageNetwork.ts` and fix the test import in `src/server/storage/storageNetwork.test.ts`. Vercel deploys every `api/*.ts` file as a route, and this module has no default handler.
2. **Switch the route to the Node.js runtime.** Remove `export const config = { runtime: 'edge' }` from `api/storage.ts`. `undici`'s `Agent({ connect: { lookup } })` needs Node sockets; Edge `fetch` cannot pin an address without breaking SNI/certificate validation.

   **The export shape must change with the runtime.** Vercel's Node.js runtime recognises a Web handler only from the `fetch` Web Standard export:

   ```ts
   async function handleStorageRequest(request: Request): Promise<Response> { /* ... */ }
   export default { fetch: handleStorageRequest };
   ```

   A bare `export default async function handler(request: Request)` is the *Edge* convention. Left in place on the Node runtime it is read as the legacy `(req, res)` Node handler, so the route would receive an `IncomingMessage` whose `headers` is a plain object, and every request would fail on `request.headers.get(...)`. Cover the shape with a test that asserts `typeof route.default.fetch === 'function'` and that no `config.runtime === 'edge'` remains; a deploy-time 500 is an expensive way to learn this.
3. **Use undici's own `fetch` with its `Agent`.** Mixing Node's bundled `fetch` with a dispatcher from the npm `undici` copy is unsupported and can fail at runtime. The WIP already does this; keep it.
4. **Make the transport request-scoped and leak-free.** `api/storage.ts` creates one `createPinnedFetchTransport()` per `import-url` request and calls `transport.abort()` in a `finally` after `fetchRemoteImage` settles. Inside the transport, close a dispatcher once its response body is fully consumed or cancelled, not only on error; today successful requests leak dispatchers until `abort()`.
5. **Replace the inline DoH resolver in `api/storage.ts`** with `createCloudflareDnsResolver()` so the `Status !== 0` fail-closed rule applies in production; the inline copy currently ignores `Status`.
6. **Close the remaining address gaps in `remoteImport.ts`:** reject 6to4 `2002::/16` unless its embedded IPv4 is public, reject Teredo `2001::/32`, and keep the IPv4-mapped check.
7. **Bound cleanup.** In `readBody`, race `reader.cancel()` against the abort signal instead of awaiting it; cancel redirect and rejected (`!ok`, oversized `Content-Length`) response bodies the same way; on timeout, destroy the transport instead of waiting for the reader.
8. **Tests to add** (all in `remoteImport.test.ts` or `storageNetwork.test.ts`):
   - the transport's `lookup` is called with the validated address and the original hostname, and a hostname mismatch is rejected;
   - two concurrent imports to different hosts never see each other's addresses;
   - DoH `Status: 2` on AAAA with a successful A fails the import; NODATA on one family with a public answer on the other succeeds; malformed JSON fails;
   - `2002:7f00:0001::` (loopback embedded), `2002:a9fe:a9fe::` (metadata embedded), `2002:c0a8:0101::` (private embedded) are rejected; a 6to4 address with a public embedded IPv4 is accepted; `2001:0:…` (Teredo) is rejected;
   - a reader whose `cancel()` never resolves does not hold the import past the timeout;
   - a redirect response body is cancelled before the next hop is fetched;
   - the dispatcher is closed after a successful import and after an abort.
9. Commit as `fix: pin remote image imports to validated addresses` (plus `chore: add undici` if you prefer a separate dependency commit). Re-run the focused storage tests, `npm test`, targeted `tsc`, and `npm run build`, then request fresh specification and security reviews before Task 6.

- [ ] **Step 4: Add the `import-url` API action test-first**

Request and response:

```ts
{ action: 'import-url', category, sourceUrl, context }
// -> public: { objectKey, publicUrl }
// -> private: { objectKey }
```

The handler authenticates and authorizes before downloading, calls `fetchRemoteImage`, generates the key from the detected MIME type, uploads bytes server-side, verifies with `HEAD`, and returns only the stable reference. Add tests proving an unauthorized import never fetches the source and a failed `HEAD` never returns a reference.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/server/storage/remoteImport.test.ts src/server/storage/handler.test.ts`

Expected: PASS.

```bash
git add src/server/storage/remoteImport.ts src/server/storage/remoteImport.test.ts src/server/storage/handler.ts src/server/storage/handler.test.ts
git commit -m "feat: import remote images safely into R2"
```

## Task 6: Refactor the browser upload library and hook

**Files:**
- Modify: `src/lib/storage.test.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/hooks/useImageUpload.test.ts`
- Modify: `src/hooks/useImageUpload.ts`

- [ ] **Step 1: Add a failing direct-upload test to `storage.test.ts`**

```ts
it('requests a grant and PUTs the file with the signed content type', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      uploadUrl: 'https://r2.example/signed', objectKey: 'menu-items/a.jpg',
      publicUrl: 'https://images.row-nel.com/menu-items/a.jpg', expiresAt: Date.now() + 300_000,
    }), { status: 200 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const result = await uploadImageToStorage(file, 'menu-item', { merchantId: 'm1' });
  expect(result.reference).toBe('https://images.row-nel.com/menu-items/a.jpg');
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: file, headers: { 'Content-Type': 'image/jpeg' } });
});
```

Also add tests for API errors, PUT errors, one retry after a 403 expired signature, private uploads returning an object key, authenticated delete requests, and `importImageUrl` returning an R2 reference.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- src/lib/storage.test.ts`

Expected: FAIL because network functions are not exported.

- [ ] **Step 3: Implement the browser API**

Export:

```ts
export interface StoredImage { reference: string; objectKey: string; publicUrl?: string }
export async function uploadImageToStorage(file: File, category: AssetCategory, context: StorageContext): Promise<StoredImage>;
export async function importImageUrl(sourceUrl: string, category: AssetCategory, context: StorageContext): Promise<StoredImage>;
export async function deleteStoredImage(reference: string, category: AssetCategory, context: StorageContext): Promise<boolean>;
export async function getPrivateImageUrl(category: 'receipt' | 'rider-photo', context: StorageContext): Promise<{ downloadUrl: string; expiresAt: number }>;
```

All API calls obtain the Supabase session and use `/api/storage`. On an upload PUT `403`, request exactly one new grant and retry. Never log signed URLs.

- [ ] **Step 4: Rewrite the hook test around categories and stored references**

```ts
vi.mock('../lib/storage', () => ({
  uploadImageToStorage: (...args: unknown[]) => uploadMock(...args),
  importImageUrl: (...args: unknown[]) => importMock(...args),
  deleteStoredImage: (...args: unknown[]) => deleteMock(...args),
}));

it('compresses and uploads in the caller-selected category', async () => {
  uploadMock.mockResolvedValue({ reference: 'https://images.row-nel.com/menu-items/a.jpg', objectKey: 'menu-items/a.jpg' });
  const { result } = renderHook(() => useImageUpload('menu-item', { merchantId: 'm1' }));
  await act(async () => expect(await result.current.uploadImage(file)).toBe('https://images.row-nel.com/menu-items/a.jpg'));
  expect(uploadMock).toHaveBeenCalledWith(compressedFile, 'menu-item', { merchantId: 'm1' });
});
```

Retain tests for progress, error propagation, and non-blocking cleanup. Add an import-from-URL test.

- [ ] **Step 5: Implement the category-aware hook and commit**

```ts
export const useImageUpload = (category: AssetCategory, context: StorageContext = {}) => {
  // uploadImage(file), importFromUrl(url), deleteImage(), uploading, uploadProgress
};
```

Run: `npm test -- src/lib/storage.test.ts src/hooks/useImageUpload.test.ts`

Expected: PASS.

```bash
git add src/lib/storage.ts src/lib/storage.test.ts src/hooks/useImageUpload.ts src/hooks/useImageUpload.test.ts
git commit -m "refactor: upload browser images through R2 grants"
```

## Task 7: Make every public upload call site explicit and R2-backed

**Files:**
- Create: `src/components/ImageUpload.test.tsx`
- Modify: `src/components/ImageUpload.tsx`
- Modify: `src/components/AdminDashboard.tsx`
- Modify: `src/components/MerchantManager.tsx`
- Modify: `src/components/PromotionManager.tsx`
- Modify: `src/components/PaymentMethodManager.tsx`
- Modify: `src/components/SiteSettingsManager.tsx`

- [ ] **Step 1: Write failing component tests**

```tsx
it('uploads using its required category and context', async () => {
  render(<ImageUpload category="merchant-logo" context={{ merchantId: 'm1' }} currentImage={undefined} onImageChange={onChange} label="Merchant logo" />);
  await userEvent.upload(screen.getByLabelText(/merchant logo/i), file);
  expect(useImageUploadMock).toHaveBeenCalledWith('merchant-logo', { merchantId: 'm1' });
});

it('imports a pasted URL instead of saving the external URL directly', async () => {
  render(<ImageUpload category="promotion" currentImage={undefined} onImageChange={onChange} label="Promotion banner" />);
  await userEvent.type(screen.getByLabelText(/import image url/i), 'https://example.com/banner.jpg');
  await userEvent.click(screen.getByRole('button', { name: /import/i }));
  expect(importFromUrlMock).toHaveBeenCalledWith('https://example.com/banner.jpg');
  expect(onChange).not.toHaveBeenCalledWith('https://example.com/banner.jpg');
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- src/components/ImageUpload.test.tsx`

Expected: FAIL because `category`, `context`, and `label` are absent and URLs save immediately.

- [ ] **Step 3: Implement the explicit component contract**

```ts
interface ImageUploadProps {
  category: AssetCategory;
  context?: StorageContext;
  label: string;
  currentImage?: string;
  onImageChange: (imageUrl: string | undefined) => void;
  className?: string;
}
```

Make the file input's accessible label use `label`. Replace direct URL `onChange` with local URL state and an Import button calling `importFromUrl`. Show upload/import errors inline rather than with `alert`. Removing or replacing an image only changes the draft reference; `ImageUpload` must not delete storage while the parent record is unsaved.

- [ ] **Step 4: Update every public caller with the correct category/context**

```tsx
// menu item forms
<ImageUpload category="menu-item" context={{ merchantId }} label="Menu item image" ... />
// merchant fields
<ImageUpload category="merchant-logo" context={{ merchantId }} label="Merchant logo" ... />
<ImageUpload category="merchant-cover" context={{ merchantId }} label="Merchant cover image" ... />
// promotion
<ImageUpload category="promotion" label="Promotion banner" ... />
// payment method
<ImageUpload category="payment-qr" context={{ merchantId: formData.merchant_id ?? undefined }} label="Payment QR code" ... />
```

In `SiteSettingsManager`, replace the incorrect two-argument `uploadImage(logoFile, 'site-logo')` call with `useImageUpload('site-logo')` and its one-argument uploader.

In each caller, capture the original stored reference when editing starts. After and only after the database create/update succeeds, compare the saved reference to the original and call:

```ts
if (originalImage && originalImage !== savedImage) {
  await deleteStoredImage(originalImage, category, context).catch(() => {
    console.warn('Image saved; previous object cleanup will be retried later.');
  });
}
```

On cancel or database failure, leave the original object untouched. If a newly uploaded draft was never saved, delete that new draft reference during cancel as best-effort orphan cleanup. Add a test proving delete is not called before the mocked database save resolves and is called with the old reference after it resolves.

- [ ] **Step 5: Run component, type, and build checks; commit**

Run: `npm test -- src/components/ImageUpload.test.tsx src/hooks/useImageUpload.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: no new errors in modified storage/upload files; record any unrelated baseline errors separately.

```bash
git add src/components/ImageUpload.tsx src/components/ImageUpload.test.tsx src/components/AdminDashboard.tsx src/components/MerchantManager.tsx src/components/PromotionManager.tsx src/components/PaymentMethodManager.tsx src/components/SiteSettingsManager.tsx
git commit -m "refactor: route public image inputs by R2 category"
```

## Task 8: Switch optimized rendering from ImageKit to Cloudflare

**Files:**
- Modify: `src/components/OptimizedImage.test.tsx`
- Modify: `src/components/OptimizedImage.tsx`
- Modify: `src/components/MenuItemCard.test.tsx`
- Modify: `src/components/MenuItemCard.tsx`

- [ ] **Step 1: Rewrite the existing rendering tests for R2**

Set `VITE_R2_PUBLIC_URL=https://images.row-nel.com`. Assert R2 sources use `/cdn-cgi/image/width=400,quality=80,format=auto,onerror=redirect/`, the 2x source uses `width=800`, and ImageKit/Cloudinary/data/blob/private signed URLs remain unchanged without `srcSet`.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- src/components/OptimizedImage.test.tsx src/components/MenuItemCard.test.tsx`

Expected: FAIL because the component still calls `buildImageKitUrl`.

- [ ] **Step 3: Replace provider-specific imports and crop vocabulary**

```ts
import { buildPublicImageUrl } from '../lib/storage';
import type { ImageTransform } from '../lib/storageTypes';

const transform: ImageTransform = { width, height, fit, quality, format: 'auto' };
const optimizedSrc = buildPublicImageUrl(src, transform);
```

Rename the component prop from ImageKit `crop` semantics to Cloudflare `fit`, updating callers. Keep missing/error fallbacks, loading priority, and pass-through attributes unchanged.

- [ ] **Step 4: Run and commit**

Run: `npm test -- src/components/OptimizedImage.test.tsx src/components/MenuItemCard.test.tsx`

Expected: PASS.

```bash
git add src/components/OptimizedImage.tsx src/components/OptimizedImage.test.tsx src/components/MenuItemCard.tsx src/components/MenuItemCard.test.tsx
git commit -m "refactor: optimize R2 images through Cloudflare"
```

## Task 9: Add private object-key schema without breaking legacy URLs

**Files:**
- Create: `supabase/migrations/20260918000000_add_private_image_object_keys.sql`
- Create: `src/lib/deliveryApi.test.ts`
- Modify: `src/lib/supabase.ts`
- Modify: `src/lib/deliveryTypes.ts`
- Modify: `src/lib/deliveryApi.ts`
- Modify: `src/hooks/useOrders.ts`
- Modify: `src/hooks/useRiderProfile.ts`
- Modify: `mobile/src/lib/adminTypes.ts`
- Modify: `mobile/src/types.ts`
- Modify: `mobile/src/lib/adminMappers.ts`
- Modify: `mobile/src/lib/adminMappers.test.ts`

- [ ] **Step 1: Add failing mapper tests for key-first compatibility**

```ts
it('maps private object keys separately from legacy URLs', () => {
  const order = mapOrder({ ...row, receipt_object_key: 'receipts/u/a.jpg', receipt_url: 'https://legacy/receipt.jpg' });
  expect(order.receiptObjectKey).toBe('receipts/u/a.jpg');
  expect(order.receiptUrl).toBe('https://legacy/receipt.jpg');
});
```

Add the equivalent rider mapping expectation for `photo_object_key` and `photo_url` in web/mobile mapper tests.

- [ ] **Step 2: Run focused mapper tests and confirm RED**

Run: `npm test -- src/lib/deliveryApi.test.ts`

Run: `(cd mobile && npm test -- src/lib/adminMappers.test.ts --runInBand)`

Expected: both commands FAIL because key properties are not represented. The new web test imports the already-exported `mapOrder` and asserts `receiptObjectKey`; the existing mobile test imports `mapOrder` and `mapRider` and asserts both new fields.

- [ ] **Step 3: Add additive database columns and RPC compatibility**

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_object_key text;
ALTER TABLE riders ADD COLUMN IF NOT EXISTS photo_object_key text;

ALTER TABLE orders ADD CONSTRAINT orders_receipt_object_key_shape
  CHECK (receipt_object_key IS NULL OR receipt_object_key ~ '^receipts/[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp|gif)$');
ALTER TABLE riders ADD CONSTRAINT riders_photo_object_key_shape
  CHECK (photo_object_key IS NULL OR photo_object_key ~ '^rider-photos/[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp|gif)$');
```

> **Revision note (2026-09-19):** the constraints above were written for the flat key layout and would reject every key the accepted server generates. Use these instead. The owner segment allows the literal `guest` for migrated receipts on orders without an account (Task 12).

```sql
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_receipt_object_key_shape;
ALTER TABLE orders ADD CONSTRAINT orders_receipt_object_key_shape
  CHECK (receipt_object_key IS NULL OR receipt_object_key ~ '^receipts/(guest|[0-9a-f-]{36})/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$');
ALTER TABLE riders DROP CONSTRAINT IF EXISTS riders_photo_object_key_shape;
ALTER TABLE riders ADD CONSTRAINT riders_photo_object_key_shape
  CHECK (photo_object_key IS NULL OR photo_object_key ~ '^rider-photos/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$');
```

Before writing the migration, confirm `riders.id` and `orders.id` are UUIDs in the existing schema; if either is not, widen the segment pattern to match the real id format rather than the pattern above.

Recreate the latest `create_order(jsonb)` definition from `20260827000000_add_customer_accounts.sql` with `receipt_object_key` included and `receipt_url` retained for legacy callers. Include `receipt_object_key` in staff/customer order RPC return shapes where the API authorization repository requires it. `api/storage.ts` already selects `receipt_object_key` and `photo_object_key`, so the storage API returns 500 on receipt/rider-photo actions until this migration is applied; apply it before the compatibility release (Task 15 step 3).

- [ ] **Step 4: Update generated/manual types and mappers**

Add `receipt_object_key` and `photo_object_key` to Row/Insert/Update definitions. Add `receiptObjectKey?: string` and `photoObjectKey?: string` domain fields without deleting legacy URL fields.

Mobile has no storage client, so the mobile mappers only need to keep keys and URLs in separate fields. Mobile screens continue to render `photoUrl`/`receiptUrl` and must never put an object key into an `Image` source; a mobile private-URL client is explicitly out of scope for this plan (see the design's Mobile scope section).

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/lib/deliveryApi.test.ts`

Run: `(cd mobile && npm test -- src/lib/adminMappers.test.ts --runInBand)`

Expected: PASS.

```bash
git add supabase/migrations/20260918000000_add_private_image_object_keys.sql src/lib/deliveryApi.test.ts src/lib/supabase.ts src/lib/deliveryTypes.ts src/lib/deliveryApi.ts src/hooks/useOrders.ts src/hooks/useRiderProfile.ts mobile/src/lib/adminTypes.ts mobile/src/types.ts mobile/src/lib/adminMappers.ts mobile/src/lib/adminMappers.test.ts
git commit -m "feat: store private image object keys separately"
```

## Task 10: Upload and render private rider photos and receipts safely

**Files:**
- Create: `src/hooks/usePrivateImageUrl.test.ts`
- Create: `src/hooks/usePrivateImageUrl.ts`
- Modify: `src/components/RiderProfilePage.tsx`
- Modify: `src/components/RiderDashboard.tsx`
- Modify: `src/components/CustomerRiderPanel.tsx`
- Modify: `src/components/OrdersManager.tsx`
- Modify: `src/components/StaffOrdersPanel.tsx`

- [ ] **Step 1: Write a failing temporary-URL lifecycle test**

```ts
it('requests a private URL, refreshes before expiry, and never writes it back', async () => {
  vi.useFakeTimers();
  getPrivateImageUrlMock
    .mockResolvedValueOnce({ downloadUrl: 'https://signed/one', expiresAt: Date.now() + 300_000 })
    .mockResolvedValueOnce({ downloadUrl: 'https://signed/two', expiresAt: Date.now() + 600_000 });
  const { result } = renderHook(() => usePrivateImageUrl('receipt', { orderId: 'o1' }, true));
  await waitFor(() => expect(result.current.url).toBe('https://signed/one'));
  await act(() => vi.advanceTimersByTime(240_000));
  await waitFor(() => expect(result.current.url).toBe('https://signed/two'));
});
```

Also test disabled/missing context, 403 unavailable state, and timer cleanup on unmount.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- src/hooks/usePrivateImageUrl.test.ts`

Expected: FAIL because the hook is absent.

- [ ] **Step 3: Implement the private URL hook**

```ts
export function usePrivateImageUrl(
  category: 'receipt' | 'rider-photo',
  context: StorageContext,
  enabled = true,
): { url: string | null; loading: boolean; unavailable: boolean };
```

Refresh 60 seconds before expiry with a minimum 5-second delay. Store signed URLs only in React state. Clear URL/timer when context changes or the component unmounts.

- [ ] **Step 4: Replace direct private URL rendering**

Rider self-upload flows call:

```ts
const { uploadImage } = useImageUpload('rider-photo', { riderId: user.id });
const previousKey = profile?.photo_object_key;
const objectKey = await uploadImage(file);
await updateProfile({ photo_object_key: objectKey });
if (previousKey && previousKey !== objectKey) {
  await deleteStoredImage(previousKey, 'rider-photo', { riderId: user.id }).catch(() => undefined);
}
```

Customer/staff rider-photo components resolve with `{ riderId }`. Receipt components resolve with `{ orderId }`. During compatibility, use `resolvedPrivateUrl ?? legacyUrl`, but never pass an object key directly to `<img>` or `<a>`.

Receipts are **render-only** in this task. No web or mobile checkout flow uploads a receipt file today (`orders.receipt_url` is only set from the order payload in `useOrders`), and the API only accepts receipt uploads for an existing order owned by the caller. Do not add a checkout-time receipt uploader here; if one is wanted later it is a separate feature that runs after order creation.

- [ ] **Step 5: Add component tests for no key leakage and access failure**

Assert DOM `src`/`href` uses the signed URL, never `receipts/...` or `rider-photos/...`, and shows the existing unavailable fallback when authorization fails.

- [ ] **Step 6: Run and commit**

Run: `npm test -- src/hooks/usePrivateImageUrl.test.ts src/components/CustomerRiderPanel.test.tsx`

Expected: PASS.

```bash
git add src/hooks/usePrivateImageUrl.ts src/hooks/usePrivateImageUrl.test.ts src/components/RiderProfilePage.tsx src/components/RiderDashboard.tsx src/components/CustomerRiderPanel.tsx src/components/OrdersManager.tsx src/components/StaffOrdersPanel.tsx
git commit -m "feat: authorize private image delivery"
```

## Task 11: Generalize the manifest model from ImageKit to R2

**Files:**
- Modify: `src/lib/imageCatalog.test.ts`
- Modify: `src/lib/imageCatalog.ts`
- Create: `src/lib/storageMigration.test.ts`
- Create: `src/lib/storageMigration.ts`

- [ ] **Step 1: Add failing compatibility tests**

```ts
it('reads an old ImageKit upload as a migration source', () => {
  expect(selectMigrationSource({ imagekitUrl: 'https://ik.imagekit.io/x/a.jpg', chosenUrl: 'https://source/a.jpg' }))
    .toBe('https://ik.imagekit.io/x/a.jpg');
});

it('records verified R2 metadata without erasing review history', () => {
  expect(withR2Upload(approved, {
    objectKey: 'menu-items/a.jpg', publicUrl: 'https://images.row-nel.com/menu-items/a.jpg',
    checksum: 'sha256:abc', mimeType: 'image/jpeg', bytes: 123, verifiedAt: '2026-09-18T00:00:00.000Z',
  })).toMatchObject({ status: 'uploaded', r2: { verified: true }, candidates: approved.candidates });
});

it('builds updates only from verified R2 entries')
it('skips a verified entry on a repeated upload run')
it('builds exact multi-table rollback values')
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- src/lib/imageCatalog.test.ts src/lib/storageMigration.test.ts`

Expected: FAIL because R2 manifest fields and helpers are absent.

- [ ] **Step 3: Extend rather than invalidate existing manifests**

```ts
export interface R2UploadRecord {
  bucket: 'public' | 'private'; objectKey: string; publicUrl?: string;
  checksum: string; mimeType: string; bytes: number; verified: boolean; verifiedAt: string;
}

export interface ManifestEntry {
  // retain current fields including imagekitUrl
  r2?: R2UploadRecord;
}
```

Change `buildRowUpdates` and `buildMerchantRowUpdates` to prefer `entry.r2.publicUrl` when `verified`, then fall back to `imagekitUrl` only for legacy operations. Add provider-neutral migration targets shaped as `{ table, rowId, column, visibility, previousValue, nextValue }`.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/lib/imageCatalog.test.ts src/lib/storageMigration.test.ts`

Expected: PASS.

```bash
git add src/lib/imageCatalog.ts src/lib/imageCatalog.test.ts src/lib/storageMigration.ts src/lib/storageMigration.test.ts
git commit -m "refactor: make image manifests R2-aware"
```

## Task 12: Inventory, upload, verify, and apply all existing images

**Files:**
- Create: `scripts/imageStorageAudit.mjs`
- Create: `scripts/uploadImagesToR2.mjs`
- Create: `scripts/applyR2ImageUrls.mjs`
- Create: `scripts/verifyR2Migration.mjs`
- Modify: `scripts/loadEnv.mjs` if server-only R2 variables are not currently returned
- Modify: `package.json`

- [ ] **Step 1: Add fixture-driven CLI tests around exported pure functions**

Create `src/lib/storageMigration.test.ts` fixtures covering every target:

```ts
const targets = [
  ['menu_items', 'image_url', 'public'],
  ['merchants', 'logo_url', 'public'],
  ['merchants', 'cover_image_url', 'public'],
  ['site_settings', 'value', 'public'],
  ['promotions', 'banner_image_url', 'public'],
  ['payment_methods', 'qr_code_url', 'public'],
  ['orders', 'receipt_object_key', 'private'],
  ['riders', 'photo_object_key', 'private'],
];
```

Assert URL deduplication occurs only after equal SHA-256 checksums, legacy ImageKit URL wins over `chosenUrl` as the first migration source, dead source plus valid reviewed fallback is recoverable, and unverified entries produce no updates.

- [ ] **Step 2: Run the fixture tests before each script and confirm RED for its missing exported behavior**

Run: `npm test -- src/lib/storageMigration.test.ts`

Expected: the newly added behavior fails before the corresponding helper is added.

- [ ] **Step 3: Implement the audit script**

`imageStorageAudit.mjs` pages through all listed tables, merges existing menu/merchant review manifests, and writes:

```json
{
  "version": 1,
  "createdAt": "2026-09-18T00:00:00.000Z",
  "entries": [],
  "summary": { "public": 0, "private": 0, "missing": 0 }
}
```

Default output: `docs/images/r2-migration-manifest.json`. Never overwrite an existing migration manifest unless `--refresh` is supplied; refresh preserves successful `r2` records by stable target identity.

- [ ] **Step 4: Implement idempotent R2 upload and verification**

`uploadImagesToR2.mjs` accepts `--manifest`, `--limit`, and `--retry-failed`. It requires all server R2 variables, downloads with the same bounded/signature validation as the API, computes SHA-256, writes to the correct bucket, performs `HEAD`, checkpoints the manifest after each entry, and exits nonzero after reporting all failures. It never prints secret or signed URLs.

Key generation must reuse the server code, not reimplement it: import `createR2Store` from `../src/server/storage/r2.ts` (the scripts already run with `--experimental-strip-types`) and `fetchRemoteImage` from `../src/server/storage/remoteImport.ts` with the Node transport from `storageNetwork.ts`. The audit entry must therefore carry the scope the key needs:

| Target | Context passed to `createObjectKey` |
| --- | --- |
| `menu_items.image_url` | `{ merchantId: menu_items.merchant_id }` |
| `merchants.logo_url`, `merchants.cover_image_url` | `{ merchantId: merchants.id }` |
| `payment_methods.qr_code_url` | `{ merchantId: payment_methods.merchant_id }` or omitted → `global` |
| site logo, `promotions.banner_image_url` | `{}` |
| `orders.receipt_url` | `{ ownerId: orders.customer_user_id ?? 'guest', orderId: orders.id }` |
| `riders.photo_url` | `{ riderId: riders.id }` |

Rows whose scope column is missing (for example a menu item with no merchant) are reported and skipped, never uploaded under a guessed scope. Confirm the actual table and row key that holds the site logo during the audit step rather than assuming `site_settings.value`.

- [ ] **Step 5: Implement dry-run/commit/rollback database application**

`applyR2ImageUrls.mjs` supports:

```text
node scripts/applyR2ImageUrls.mjs
node scripts/applyR2ImageUrls.mjs --commit
node scripts/applyR2ImageUrls.mjs --rollback docs/images/r2-rollback-<stamp>.json --commit
```

Before commit, write exact `{ table, rowId, column, previous, next }` records. Authenticate with the existing admin credentials. Update one target at a time, retain the rollback file even on partial failure, and report applied/failed counts.

- [ ] **Step 6: Implement post-apply verification**

`verifyR2Migration.mjs` reads current database values, checks every expected public object with the public custom domain and every private object with signed `HEAD`, then reports mismatches, unreachable objects, legacy hosts remaining by table/column, and success totals. It is read-only.

- [ ] **Step 7: Add package scripts and commit**

```json
{
  "images:r2:audit": "node --experimental-strip-types scripts/imageStorageAudit.mjs",
  "images:r2:upload": "node --experimental-strip-types scripts/uploadImagesToR2.mjs",
  "images:r2:apply": "node --experimental-strip-types scripts/applyR2ImageUrls.mjs",
  "images:r2:verify": "node --experimental-strip-types scripts/verifyR2Migration.mjs"
}
```

Run: `npm test -- src/lib/storageMigration.test.ts src/lib/imageCatalog.test.ts`

Expected: PASS.

```bash
git add scripts/imageStorageAudit.mjs scripts/uploadImagesToR2.mjs scripts/applyR2ImageUrls.mjs scripts/verifyR2Migration.mjs scripts/loadEnv.mjs src/lib/storageMigration.ts src/lib/storageMigration.test.ts package.json
git commit -m "feat: migrate all image references to R2"
```

## Task 13: Add reproducible Cloudflare and Vercel setup assets

**Files:**
- Create: `infra/r2-cors.json`
- Create: `docs/deployment/cloudflare-r2.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add Wrangler as a development dependency**

Run: `npm install --save-dev wrangler`

Expected: `wrangler` appears in `devDependencies`.

- [ ] **Step 2: Add the explicit CORS policy**

```json
{
  "rules": [
    {
      "allowed": {
        "origins": ["https://row-nel.com", "https://www.row-nel.com", "http://localhost:5173"],
        "methods": ["PUT", "HEAD"],
        "headers": ["Content-Type"]
      },
      "exposeHeaders": ["ETag"],
      "maxAgeSeconds": 3600
    }
  ]
}
```

- [ ] **Step 3: Write the setup runbook with exact guarded commands**

The document must require verifying imported A/CNAME/MX/TXT records before nameserver changes and include:

```bash
npx wrangler login
npx wrangler r2 bucket create rownel-public-images
npx wrangler r2 bucket create rownel-private-images
npx wrangler r2 bucket cors set rownel-public-images --file infra/r2-cors.json
npx wrangler r2 bucket cors set rownel-private-images --file infra/r2-cors.json
npx wrangler r2 bucket domain add rownel-public-images --domain images.row-nel.com --zone-id <ZONE_ID> --min-tls 1.2
npx wrangler r2 bucket list
npx wrangler r2 bucket domain list rownel-public-images
npx wrangler r2 bucket cors list rownel-public-images
```

Explain how to create an object read/write R2 token restricted to the two buckets, copy its one-time secret into Vercel, add all server variables, and keep `r2.dev` disabled after testing. Include DNS rollback: restore the prior Vercel nameservers if imported production records are incorrect.

- [ ] **Step 4: Document smoke checks with a disposable key**

The runbook executes authenticated API grant -> `PUT` -> public `HEAD` -> transformed `HEAD` -> private grant/read -> delete, using `smoke/<timestamp>.png`. It explicitly removes both smoke objects when complete.

- [ ] **Step 5: Verify the JSON and commit**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('infra/r2-cors.json', 'utf8')); console.log('valid')"`

Expected: `valid`.

```bash
git add infra/r2-cors.json docs/deployment/cloudflare-r2.md package.json package-lock.json
git commit -m "docs: add Cloudflare R2 deployment runbook"
```

## Task 14: Remove ImageKit runtime dependencies after compatibility is proven

**Files:**
- Delete: `src/lib/imagekit.ts`
- Delete: `src/lib/imagekit.test.ts`
- Delete: `api/imagekit-auth.ts`
- Delete: `supabase/functions/imagekit-auth/index.ts`
- Delete: `scripts/uploadImagesToImageKit.mjs`
- Modify: `vitest.config.ts`
- Modify: `.env.example`
- Modify: comments/tests containing provider-specific assumptions

- [ ] **Step 1: Prove there are no production imports or secrets left**

Run: `rg -n "from ['\"].*imagekit|uploadToImageKit|deleteFromImageKit|buildImageKitUrl|IMAGEKIT_(PRIVATE|PUBLIC)_KEY|VITE_IMAGEKIT" src api supabase scripts .env.example`

Expected before cleanup: only the files listed for deletion and migration compatibility comments/tests appear. Any production caller must be converted before continuing.

- [ ] **Step 2: Delete runtime ImageKit modules and rename stale test fixtures**

Remove the five files above. Keep `imagekitUrl` only in old manifest JSON and the backward-compatible `ManifestEntry` reader until after the migration validation window; name new test URLs `LEGACY_IMAGEKIT_URL` so their intent is clear.

- [ ] **Step 3: Run the complete local verification suite**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: Vite production build succeeds.

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: no new storage-related TypeScript errors; compare unrelated errors to the recorded baseline.

Run: `rg -n "IMAGEKIT_(PRIVATE|PUBLIC)_KEY|VITE_IMAGEKIT" src api supabase .env.example`

Expected: no matches.

- [ ] **Step 4: Commit runtime removal**

```bash
git add -A -- src/lib/imagekit.ts src/lib/imagekit.test.ts api/imagekit-auth.ts supabase/functions/imagekit-auth/index.ts scripts/uploadImagesToImageKit.mjs
git add vitest.config.ts .env.example
git commit -m "refactor: remove ImageKit runtime integration"
```

Do not delete remote ImageKit assets or revoke its credentials in this task.

## Task 15: Deploy compatibility release and perform the reversible cutover

**Files:**
- Create: `docs/testing/cloudflare-r2-migration.tdd.md`
- Modify: migration manifest and generated rollback files only when intentionally recording the real cutover

- [ ] **Step 1: Record the pre-deploy baseline**

```bash
npm test
npm run build
git status --short
```

Copy exact counts/results and unrelated dirty files into the evidence document. Do not modify or stage pre-existing user changes.

- [ ] **Step 2: Complete Cloudflare DNS and bucket setup from the runbook**

Stop if imported Vercel A/CNAME/MX/TXT records do not match the current zone. After changing nameservers, verify `row-nel.com`, `www.row-nel.com`, TLS, and any email records before continuing.

- [ ] **Step 3: Configure Vercel secrets and deploy the compatibility release**

Set all Task 4 server variables and the two public Vite variables. Confirm a production request to `/api/storage` without a token returns 401 rather than 404 or 500.

- [ ] **Step 4: Run public/private smoke tests**

Follow the runbook and record response status, object key prefix, public/custom-domain availability, transformed availability, private denial without authorization, private success with authorization, and deletion. Redact every signed query string and secret.

- [ ] **Step 5: Run the real migration through gates**

```bash
npm run images:r2:audit
npm run images:r2:upload
npm run images:r2:apply
npm run images:r2:apply -- --commit
npm run images:r2:verify
```

Expected gates:

- audit reports every image-bearing field;
- upload reports zero silent skips and lists each explicit failure;
- dry-run count equals committed target count;
- a rollback file exists before the first write;
- verification reports no database reference to a missing R2 object.

If verification fails materially, run the documented rollback command immediately and keep the compatibility release deployed.

- [ ] **Step 6: Verify representative user journeys**

Check web and mobile rendering for a menu item, merchant logo/cover, promotion, site logo, and payment QR. Check an admin/staff receipt, rider self-photo, assigned customer rider photo, unauthorized private request, new public upload, new rider photo upload, URL import, replacement ordering, and deletion.

- [ ] **Step 7: Write and commit the evidence report**

The report includes test/build output, DNS/bucket configuration verification, migration counts by table/column, failures/skips with reasons, rollback filename, smoke-test evidence, representative URLs with sensitive query strings removed, and the explicit statement that ImageKit assets remain intact during validation.

```bash
git add docs/testing/cloudflare-r2-migration.tdd.md
git commit -m "docs: record Cloudflare R2 migration evidence"
```

## Task 16: Post-validation ImageKit retirement (separate approval gate)

**Files:**
- Modify: `docs/testing/cloudflare-r2-migration.tdd.md`
- Modify: `src/lib/imageCatalog.ts` and tests only if old manifest compatibility is intentionally retired

- [ ] **Step 1: Obtain explicit approval after the validation window**

Present production error rates, remaining legacy-host counts, R2 verification totals, and rollback status. Do not revoke credentials or delete assets without approval.

- [ ] **Step 2: Re-run read-only verification**

Run: `npm run images:r2:verify`

Expected: zero missing R2 objects and zero active database references requiring ImageKit.

- [ ] **Step 3: Revoke ImageKit secrets before considering asset deletion**

Remove ImageKit variables from Vercel and Supabase secrets, deploy, and verify the application again. Keep the remote ImageKit assets for a final recovery interval.

- [ ] **Step 4: Retire compatibility fields only after recovery is no longer required**

Remove `imagekitUrl` compatibility from new manifest code and archive, rather than rewrite, historical manifests/rollback files. Record the retirement date and verification evidence.

- [ ] **Step 5: Commit the retirement record**

```bash
git add docs/testing/cloudflare-r2-migration.tdd.md src/lib/imageCatalog.ts src/lib/imageCatalog.test.ts
git commit -m "chore: retire ImageKit compatibility after R2 validation"
```

## References

- Cloudflare R2 presigned URLs: <https://developers.cloudflare.com/r2/api/s3/presigned-urls/>
- Cloudflare `aws4fetch` signing example: <https://developers.cloudflare.com/r2/examples/aws/aws4fetch/>
- Cloudflare R2 bucket creation: <https://developers.cloudflare.com/r2/buckets/create-buckets/>
- Cloudflare R2 CORS: <https://developers.cloudflare.com/r2/buckets/cors/>
- Cloudflare R2 public custom domains: <https://developers.cloudflare.com/r2/buckets/public-buckets/>
- Cloudflare Images pricing and free transformation allowance: <https://developers.cloudflare.com/images/pricing/>

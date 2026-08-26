# TDD Evidence: ImageKit Image Storage

**Branch**: `feat/imagekit-image-storage`
**Source plan**: derived during the `/ecc:plan` run in this session (no `*.plan.md` artifact was written; the plan was presented inline and approved with "proceed").

## User journeys

1. As an admin, I upload a menu item image so customers can see the dish.
2. As a rider, I upload my profile photo so customers can identify me.
3. As an admin, I remove an image so unused files don't accumulate in storage.
4. As a customer, menu images load fast at the size actually rendered.
5. As anyone, images uploaded before this change (Cloudinary URLs) keep rendering.

## Security constraint driving the design

ImageKit has no unsigned-upload-preset equivalent to Cloudinary's. Every upload
requires a `(token, expire, signature)` triple where the signature is an
HMAC-SHA1 over `token + expire` keyed with the **private key**. A
`VITE_IMAGEKIT_PRIVATE_KEY` would be readable by anyone opening devtools, so the
private key lives only in the `imagekit-auth` Supabase edge function.

Verified after a production build:

```
$ npm run build && grep -rl "kPazyU" dist/          # private key fragment
(no matches)
$ grep -roE "private_[A-Za-z0-9+/=]+" dist/
(no matches)
$ grep -rn "IMAGEKIT_PRIVATE_KEY\|privateKey" src/
src/lib/imagekit.test.ts:216:    expect([...form.keys()]).not.toContain('privateKey');
```

The only `src/` reference is the test asserting the key is *never* sent.

## Task report

### Task 1 — ImageKit client library (`src/lib/imagekit.ts`)

Replaced three copy-pasted Cloudinary upload functions with one generic
`uploadToImageKit`, plus URL transforms, shared validation, and path extraction.

- **RED**: `npm test` -> `Failed to resolve import "./imagekit"` (module absent).
- **GREEN**: `npm test` -> 121 passed.
- **Guarantees**: signed upload flow, private key never in the form body,
  validation runs before any network call, legacy Cloudinary URLs pass through
  untouched.

### Task 2 — Server-side signing (`supabase/functions/imagekit-auth/index.ts`)

Mirrors the existing `admin-users` edge function (CORS headers, `json()` helper,
JWT check, action dispatch). `auth` requires a signed-in caller; `delete`
additionally requires admin or active staff. Tokens expire after 30 minutes.

- **Validation**: not unit-tested. Deno edge functions are outside the Vitest
  jsdom project and this repo has no Deno test harness (the pre-existing
  `admin-users` function is likewise untested). See "Known gaps".

### Task 3 — Hook refactor (`src/hooks/useImageUpload.ts`)

- **RED**: `npm test` -> 5 failed, `TypeError: Cannot read properties of null
  (reading 'uploadImage')` — the hook still targeted the Cloudinary module.
- **GREEN**: `npm test` -> 121 passed.
- **Behaviour change**: `deleteImage` now performs a real deletion instead of
  the previous `console.log` stub. Deletion failure is deliberately swallowed so
  a storage error cannot block the admin from unlinking a broken image.

### Task 4 — Rendering (`src/components/OptimizedImage.tsx`)

- **RED**: `npm test` -> `Failed to resolve import "./OptimizedImage"`.
- **GREEN**: `npm test` -> 121 passed.
- One RED failure (`swaps to the fallback when the image fails to load`) was a
  **defective test**, not a defective implementation: a raw
  `dispatchEvent(new Event('error'))` does not drive React's synthetic `onError`
  inside `act`. Fixed by switching to `fireEvent.error`. The implementation was
  not weakened to accommodate it.

### Task 5 — Adoption in customer-facing paths

`MenuItemCard`, `Menu`, `MenuItemDetailsPage`, `MerchantsList` (5 images).

- **RED**: `npm test -- MenuItemCard` -> 2 failed, 1 passed. No `tr=` transform
  on the src, and the old `onError` DOM mutation left the `<img>` in the tree
  instead of replacing it with the placeholder.
- **GREEN**: `npm test` -> 124 passed.
- This also removed direct DOM mutation (`style.display`, `classList.remove` on
  `nextElementSibling`) in favour of React state.

Admin-only views (`OrdersManager`, `PromotionManager`, `SiteSettingsManager`,
`PaymentMethodManager`, `MerchantManager`, `StaffOrdersPanel`, `Checkout`,
`CustomerRiderPanel`, `Header`, `RiderProfilePage`, `RiderDashboard`) were left
on plain `<img>` — low traffic, and `Header` has bespoke `onError` fallback
logic worth converting separately under its own tests.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | A transform-free call returns the source URL unchanged | `imagekit.test.ts:returns the source unchanged when no transform is requested` | unit | PASS |
| 2 | Width/quality/format serialise to ImageKit's `tr=` syntax | `imagekit.test.ts:appends width, quality and format as an ImageKit tr parameter` | unit | PASS |
| 3 | Transform parameters emit in a stable order | `imagekit.test.ts:emits transform parameters in a stable width,height,crop order` | unit | PASS |
| 4 | A URL that already has a query string is joined with `&` | `imagekit.test.ts:joins with & when the source URL already has a query string` | unit | PASS |
| 5 | **Legacy Cloudinary URLs render untouched** | `imagekit.test.ts:leaves legacy Cloudinary URLs untouched...` | unit | PASS |
| 6 | `data:`/`blob:` previews are untouched | `imagekit.test.ts:leaves data and blob URLs untouched` | unit | PASS |
| 7 | Missing sources yield `''`, never `undefined` in `src` | `imagekit.test.ts:returns an empty string for missing sources` | unit | PASS |
| 8 | Zero/negative dimensions never emit invalid transforms | `imagekit.test.ts:ignores non-positive dimensions...` | unit | PASS |
| 9 | Valid images pass validation, incl. uppercase MIME | `imagekit.test.ts:accepts a JPEG...`, `:accepts uppercase MIME types` | unit | PASS |
| 10 | Non-images and >10MB files are rejected with actionable text | `imagekit.test.ts:rejects an unsupported file type...`, `:rejects a file larger than...` | unit | PASS |
| 11 | Callers can narrow the accepted type list | `imagekit.test.ts:honours a caller-supplied allowed type list` | unit | PASS |
| 12 | Uploads carry a server-issued signature to ImageKit's endpoint | `imagekit.test.ts:uploads a signed request to ImageKit...` | integration | PASS |
| 13 | **The private key is never in the upload body** | `imagekit.test.ts:never sends the private key from the browser` | integration | PASS |
| 14 | Invalid files are rejected before any network call | `imagekit.test.ts:rejects an invalid file before requesting an upload signature` | integration | PASS |
| 15 | Signing failure surfaces and suppresses the upload | `imagekit.test.ts:surfaces a clear error when the signing function fails` | integration | PASS |
| 16 | ImageKit's own error text reaches the user | `imagekit.test.ts:surfaces the ImageKit error message...` | integration | PASS |
| 17 | Missing config fails with a named env var | `imagekit.test.ts:fails with a configuration error when the URL endpoint is not set` | unit | PASS |
| 18 | File paths derive from URLs, query stripped | `imagekit.test.ts:returns the file path...`, `:strips any transformation query string` | unit | PASS |
| 19 | Non-ImageKit URLs yield no file path | `imagekit.test.ts:returns null for URLs that are not hosted on ImageKit` | unit | PASS |
| 20 | Deletion targets the file behind an ImageKit URL | `imagekit.test.ts:asks the edge function to delete the file...` | integration | PASS |
| 21 | Deleting a Cloudinary URL is a silent no-op | `imagekit.test.ts:is a no-op for legacy Cloudinary URLs` | integration | PASS |
| 22 | Server-side delete failures surface | `imagekit.test.ts:throws when the edge function reports a failure` | integration | PASS |
| 23 | Uploads compress before transfer and return the stored URL | `useImageUpload.test.ts:compresses the file and returns the ImageKit URL on success` | unit | PASS |
| 24 | `uploading` is true in flight and false afterwards | `useImageUpload.test.ts:reports uploading state while the upload is in flight` | unit | PASS |
| 25 | Upload errors propagate and clear the spinner | `useImageUpload.test.ts:propagates the upload error and clears the uploading state` | unit | PASS |
| 26 | Removing an image deletes it from storage | `useImageUpload.test.ts:deletes a stored image through ImageKit` | unit | PASS |
| 27 | A failed deletion never blocks unlinking in the UI | `useImageUpload.test.ts:does not reject when deleting an image that cannot be removed` | unit | PASS |
| 28 | Images request a CDN-resized variant at render width | `OptimizedImage.test.tsx:requests an ImageKit-resized image...` | unit | PASS |
| 29 | High-density screens get a 2x source | `OptimizedImage.test.tsx:offers a 2x source for high density displays` | unit | PASS |
| 30 | Non-ImageKit images render as-is with no srcSet | `OptimizedImage.test.tsx:renders legacy Cloudinary images unchanged...` | unit | PASS |
| 31 | Lazy by default, eager when `isPriority` | `OptimizedImage.test.tsx:lazy loads by default and eagerly loads when marked priority` | unit | PASS |
| 32 | Missing/broken images show the fallback | `OptimizedImage.test.tsx:renders the fallback when no source is provided`, `:swaps to the fallback when the image fails to load` | unit | PASS |
| 33 | className and extra img attributes pass through | `OptimizedImage.test.tsx:forwards className and passes through extra img attributes` | unit | PASS |
| 34 | Menu cards serve resized, lazy images | `MenuItemCard.test.tsx:serves the card image resized for the card...` | unit | PASS |
| 35 | Cards without an image show the placeholder | `MenuItemCard.test.tsx:shows the placeholder when the item has no image` | unit | PASS |
| 36 | A broken card image falls back to the placeholder | `MenuItemCard.test.tsx:falls back to the placeholder when the image fails to load` | unit | PASS |

## Validation commands

```
$ npm test
  Test Files  14 passed (14)
  Tests       124 passed (124)      # 84 baseline + 40 new

$ npx tsc --noEmit -p tsconfig.app.json
  55 errors, all pre-existing (57 before this change; deleting cloudinary.ts
  removed 2). None originate in the new or modified files.

$ npm run build
  ✓ built in 2.65s

$ npm run test:coverage
  File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered
  --------------------|---------|----------|---------|---------|----------
  lib/imagekit.ts     |   94.50 |    91.80 |   91.66 |   97.43 | 79,149
  hooks/useImageUpload|   96.00 |   100.00 |   75.00 |  100.00 |
  OptimizedImage.tsx  |  100.00 |    92.30 |  100.00 |  100.00 | 59
```

All three new modules clear the 80% gate on statements, branches and lines.
The repo-wide summary (53.31% statements) is below target because
`coverage.include` also lists pre-existing rider components at 0% coverage
(`RiderManager.tsx`, `RiderOrderDetail.tsx`, `RiderProfilePage.tsx`) — a
pre-existing gap this change neither caused nor closes.

Uncovered lines are defensive branches: `imagekit.ts:79` (the `isImageKitUrl`
catch when no endpoint is configured), `imagekit.ts:149` (incomplete auth
response), `OptimizedImage.tsx:59` (the retina height doubling when an explicit
height is passed). `useImageUpload` functions sit at 75% because the
`setTimeout` progress-reset callback is not driven by any test.

## Known gaps

- **`imagekit-auth` edge function is not unit-tested.** It is Deno code outside
  the Vitest jsdom project, and the repo has no Deno test harness — the
  pre-existing `admin-users` function has the same gap. Its correctness rests on
  code review plus a manual post-deploy upload. Adding a Deno test setup would
  be a worthwhile follow-up.
- **ESLint cannot run at all in this repo**, on new *and* untouched files:
  `TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions'`
  — an eslint 9.36 / typescript-eslint version mismatch. Pre-existing; not
  addressed here.
- **`npm run test:coverage` had never worked**: `@vitest/coverage-v8` was absent
  from `package.json`. Installed as a devDependency as part of this change, and
  `vitest.config.ts` `coverage.include` was extended to cover the new modules.
- **`@types/leaflet`, `Header`, and admin views** still use plain `<img>` — see
  Task 5 for the rationale.

## Deployment steps (not yet performed)

```bash
supabase secrets set \
  IMAGEKIT_PRIVATE_KEY=private_xxxx \
  IMAGEKIT_PUBLIC_KEY=public_SH0UMdfY3uTWWpUG4Xl1nnnYtFU=
supabase functions deploy imagekit-auth
```

Then add `VITE_IMAGEKIT_URL_ENDPOINT` and `VITE_IMAGEKIT_PUBLIC_KEY` to the
Vercel project environment. Uploads fail with a clear configuration error until
both are done.

**Rotate the ImageKit private key**: it was pasted into a chat transcript during
this work.

## Merge evidence

If the three checkpoint commits (`test:` RED, `feat:` GREEN, `refactor:`) are
squashed, the RED/GREEN summary above is the surviving record.

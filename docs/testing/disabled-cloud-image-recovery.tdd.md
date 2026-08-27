# Disabled-cloud image recovery — TDD evidence

Recovering merchant logos, merchant covers, and menu-item photos after the
Cloudinary cloud backing them was disabled.

## Source plan

No `*.plan.md` was supplied. Journeys were derived during this run from a live
diagnosis of the production catalog.

## Root cause

Every image URL in the catalog pointed at Cloudinary cloud `dnxwoqezb`:

```
$ curl -sI https://res.cloudinary.com/dnxwoqezb/image/upload/v1782955312/menu-items/menu_1782955310094.jpg
HTTP/2 401
x-cld-error: cloud_name dnxwoqezb is disabled
```

The assets were not altered — the account serving them was switched off. The
URLs are still stored on the rows and still non-null, which is what made the
existing pipeline mis-handle them.

Measured scope (77 merchants, 805 menu items):

| Asset | Cloudinary (401) | ImageKit (200) | Empty |
|---|---|---|---|
| `merchants.logo_url` | 76 | 0 | 1 |
| `merchants.cover_image_url` | 76 | 0 | 1 |
| `menu_items.image_url` | 379 | 379 | 47 |

531 broken references. The 379 already on ImageKit were verified reachable.

## User journeys

1. As a customer, I want every merchant tile to show that merchant's real logo,
   so the storefront does not look broken.
2. As a customer, I want menu items to show a photo of the dish, so I can choose.
3. As the operator, I want an image slot whose host is disabled to be treated as
   empty, so the pipeline refills it instead of protecting a dead URL.
4. As the operator, I never want a merchant to display another business's logo —
   a blank slot is strictly better than a wrong one.
5. As the operator, I want merchant logos and covers to flow through the same
   sourcing pipeline as menu items, writing back to their own columns.

## Task report

### 1. Read a disabled-cloud URL as an empty slot

`autoApprove` gated on `Boolean(item.imageUrl)`, so a dead URL read as "this row
already has a real photo" and replacements were rejected. Now gated on
`isLiveImageUrl`, which treats a disabled cloud as no image.

- RED: `npx vitest run src/lib/imageCatalog.test.ts` → 13 failed, 48 passed
- GREEN: same command → 61 passed

### 2. Route manifest entries to merchant image columns

The merchant audit emits `<merchantId>::logo` / `<merchantId>::cover`
pseudo-rows. `parseMerchantRowId` and `buildMerchantRowUpdates` turn those into
column-targeted writes; unroutable ids are dropped rather than guessed at.

- RED / GREEN: covered by the same runs as task 1.

### 3. Reopen entries set aside under the old assumption

136 `rejected` and 27 `withheld` item entries had been set aside because a
generic candidate would have overwritten a real photo. Those photos are on the
disabled cloud, so the rows are blank and the held candidates are now the best
available. `reconsiderStranded` returns exactly those entries to review — only
when they still hold a candidate, and never touching an uploaded entry.

- RED: `npx vitest run src/lib/imageCatalog.test.ts` → 6 failed
  (`reconsiderStranded is not a function`)
- GREEN: `npx vitest run` → 191 passed

Applied against the refreshed catalog:

```
$ node --experimental-strip-types scripts/reviewManifest.mjs --reconsider
reopened for review: 163
status: {"approved":163,"no-candidate":85,"uploaded":104,"pending-review":10}
rows awaiting upload first: 235
held for human review: 10 (mcdo::*)
```

### 4. Refresh catalog state without discarding decisions

Re-running the audit rebuilt the manifest from scratch, discarding every review
decision and upload record. `--snapshot-only` refreshes `catalog-snapshot.json`
alone; verified the manifest was byte-identical afterwards (`git status` clean).

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A URL on the disabled cloud is not treated as a live image | `imageCatalog.test.ts:isLiveImageUrl` | unit | PASS |
| 2 | ImageKit and other Cloudinary clouds stay live | `imageCatalog.test.ts:isLiveImageUrl` | unit | PASS |
| 3 | A generic candidate may fill a row stranded on the disabled cloud | `imageCatalog.test.ts:autoApprove` | unit | PASS |
| 4 | A generic candidate still may not overwrite a live photo | `imageCatalog.test.ts:autoApprove` | unit | PASS |
| 5 | `::logo` / `::cover` route to `logo_url` / `cover_image_url` | `imageCatalog.test.ts:parseMerchantRowId` | unit | PASS |
| 6 | An unrecognised row-id suffix routes nowhere | `imageCatalog.test.ts:parseMerchantRowId` | unit | PASS |
| 7 | Uploaded merchant entries expand to one write per column | `imageCatalog.test.ts:buildMerchantRowUpdates` | unit | PASS |
| 8 | Unroutable merchant row ids are dropped, not guessed | `imageCatalog.test.ts:buildMerchantRowUpdates` | unit | PASS |
| 9 | Stranded rejected/withheld entries reopen for review | `imageCatalog.test.ts:reconsiderStranded` | unit | PASS |
| 10 | Entries with live rows, or no candidate, stay set aside | `imageCatalog.test.ts:reconsiderStranded` | unit | PASS |
| 11 | An uploaded entry is never reopened | `imageCatalog.test.ts:reconsiderStranded` | unit | PASS |

Full suite: `npx vitest run` → **15 files, 191 tests, all passing.**

Typecheck: `npx tsc --noEmit -p tsconfig.app.json` reports 55 errors, all
pre-existing in unrelated component files; the count is identical on the
baseline commit and none are in the files changed here.

## Sourcing policy

Merchant logos are re-sourced from the web by search agents under one rule:
never invent. A candidate is only recorded when it is attributable to that
specific business — official brand assets for national chains, or the
business's own verified page for independents. Where nothing trustworthy
exists the slot is left blank and reported, because a wrong logo on a real
business is worse than no logo.

## Staged outcome

Sourcing is complete; nothing has been uploaded or written yet.

| Manifest | Approved | Rows staged | Held for review | No candidate |
|---|---|---|---|---|
| Menu items | 183 | 271 | 18 | 57 |
| Merchants (logo + cover) | 58 | 112 | 0 | 40 |

383 rows are staged to be re-hosted on ImageKit and written back.

Merchant sourcing ran in two passes. The first excluded Facebook CDN URLs and
reached 23 of 98 keys — national chains resolved, independents did not. Since
the uploader fetches server-side and re-hosts immediately, a signed short-lived
URL is sufficient, so the second pass allowed them and reached 58 of 98,
recovering twelve independents from their own pages.

Two routes to a Facebook page's profile photo, each with a limit:
`graph.facebook.com/<page>/picture` returns full resolution but only for pages
with a vanity username (numeric-ID pages get the grey silhouette); the public
page plugin works for any page but caps at 100-200px.

## Known gaps

- Uploads to ImageKit require `IMAGEKIT_PRIVATE_KEY`, which lives in Supabase
  secrets and was not retrievable here (`supabase link` not configured). No
  upload or database write has been performed.
- 85 item entries (152 rows) still have no candidate and need fresh sourcing.
- 10 McDo entries are held for human review: the asset is official but only an
  approximate match for the exact product variant.
- Coverage thresholds were not run; this change is pure logic covered by unit
  tests, and the repository has no coverage gate wired for `src/lib`.

## Merge evidence

Checkpoint commits on `feat/catalog-image-sourcing`:

- `1f87494` test: RED reproducers (13 failing, 48 passing)
- `2a6a6f2` fix: disabled-cloud reads + merchant column routing (GREEN 61/61)
- `b930c5f` feat: pipeline extended to merchant logos/covers
- `3f54d33` feat: reconsider stranded entries (GREEN 191/191)

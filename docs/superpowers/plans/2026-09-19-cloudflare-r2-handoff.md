# Cloudflare R2 Migration — AI Handoff

Last updated: 2026-09-19 (Asia/Manila) — revised after a plan/code drift review; the full plan and design carry matching revision notes.

## Objective

Replace ImageKit and newly saved third-party image URLs with Cloudflare R2 for all application images. Use:

- `images.row-nel.com` for public delivery;
- Cloudflare Image Transformations with original-image fallback;
- a public bucket for menu, merchant, promotion, payment, and site assets;
- a private bucket for receipts and rider photos;
- authenticated, resource-authorized access to private assets;
- the existing image audit/manifest/rollback workflow to migrate all legacy images;
- a reversible compatibility window before ImageKit credentials or remote assets are retired.

The full, step-by-step source plan is:

- `docs/superpowers/plans/2026-09-18-cloudflare-r2-image-storage.md`

The approved design is:

- `docs/superpowers/specs/2026-09-18-cloudflare-r2-image-storage-design.md`

Read both files completely before continuing.

## Repository and Worktree

- Main repository: `/Users/codemedavid/Documents/rownel/rownel-foodelivery`
- Isolated implementation worktree: `/Users/codemedavid/Documents/rownel/rownel-foodelivery/.worktrees/cloudflare-r2`
- Feature branch: `feat/cloudflare-r2-image-storage`
- Original working branch: `feat/catalog-image-sourcing`

Continue in the isolated worktree. The original worktree contains unrelated, uncommitted user mobile changes. Do not overwrite, clean, reset, stage, or merge those changes.

Use subagent-driven development task-by-task. For each task: fresh implementer, specification review, then code/security-quality review. Resolve every Critical or Important finding and re-run the appropriate review before advancing.

## Product Decisions Already Made

- Domain: `row-nel.com`
- DNS: move nameservers from Vercel to Cloudflare, but only after comparing every imported A/CNAME/MX/TXT record.
- Public asset hostname: `images.row-nel.com`
- Buckets: `rownel-public-images` and `rownel-private-images`
- Public transforms: Cloudflare Image Transformations free allowance with `onerror=redirect` to the original.
- New URL imports must copy bytes into R2; never persist a new arbitrary third-party URL.
- Legacy ImageKit reads remain compatible through the migration window.
- ImageKit credentials/assets must not be revoked or deleted without a later, separate explicit approval.

## Accepted Work

Tasks 1–4 passed implementation, specification, and quality review.

### Task 1 — shared provider-neutral storage

- `d2854ae` — `feat: define provider-neutral image storage`
- `f6ee8aa` — `fix: keep legacy image URLs safe without R2 config`

Implemented category metadata, validation, public-origin extraction, and Cloudflare transformation URL generation. Legacy external/data/blob URLs remain safe when R2 is not configured.

### Task 2 — server-side R2 signing

- `11433fd` — `feat: sign scoped Cloudflare R2 operations`
- `585828e` — `fix: sanitize R2 GET signing failures`

Implemented R2 S3 signing and object operations using `aws4fetch`.

### Task 3 — resource authorization

- `f2764b5` — `feat: authorize image storage by resource scope`
- `296b3d8` — `fix: allow receipt cleanup after reference removal`

Implemented admin, merchant/staff, rider, customer/order, and private-download authorization.

### Task 4 — authenticated storage API

- `be0fbe2` — `feat: add authenticated R2 storage API`
- `a871a3b` — `fix: harden storage request normalization`
- `2640633` — `fix: reject non-canonical storage URLs`
- `7355128` — `fix: validate storage URL authority`
- `14a4313` — `fix: scope storage keys to authorized resources`

Scoped object-key layouts are now security boundaries:

- `menu-items/<merchantId>/<uuid>.<ext>`
- `merchants/logos/<merchantId>/<uuid>.<ext>`
- `merchants/covers/<merchantId>/<uuid>.<ext>`
- `payment-methods/<merchantId-or-global>/<uuid>.<ext>`
- `site/logo/<uuid>.<ext>` and `promotions/<uuid>.<ext>` (admin only, unscoped)
- `receipts/<ownerUserId>/<orderId>/<uuid>.<ext>` — `ownerId` is always the authenticated caller for API uploads; migrated receipts on guest orders use the literal owner `guest`
- `rider-photos/<riderId>/<uuid>.<ext>`

Migration tooling must generate this layout by importing `createR2Store` from `src/server/storage/r2.ts`, not by reimplementing it. Keys that do not match a category's exact shape are foreign and are never deleted or served through the API. The design spec's Object Key Structure section now matches this.

Two facts about receipts that later tasks depend on: receipts attach only to an existing order the caller owns (no checkout-time upload exists or is planned), and mobile has no storage client, so mobile keeps rendering legacy URL fields and never renders an object key.

## Task 5 Is Accepted

Task 5 passed implementation, security review, and code/security-quality review.

- `30c612e` — `feat: import remote images safely into R2` (initial implementation)
- `1300c2c` — `fix: pin remote image imports to validated addresses` (remediation)

The remediation closed the four findings that blocked `30c612e`, plus three more
raised during its own review, and moved the route to the Vercel Node.js runtime.
It added `src/server/storage/storageNetwork.ts` (DoH resolver and pinned undici
transport), `storageNetwork.test.ts`, and `apiStorageModule.test.ts`.

At `1300c2c`: 266 focused storage tests and 526 full-suite tests pass, the
targeted TypeScript check is clean, the project check matches the 68-error
baseline exactly, and the production build succeeds with `undici` absent from the
client bundle.

Verified against the real network as well as mocks: live Cloudflare DoH
resolution, a live pinned HTTPS import, and refusal of `localtest.me` — a genuine
public hostname that resolves to `127.0.0.1`, which is the actual rebinding
vector rather than a simulated one.

### One item still open, by design

Nothing in the code is outstanding, but the Vercel runtime behaviour cannot be
proven locally. A unit test shows what the module exports; it cannot show what
Vercel's loader does with it. **Task 15 step 3 remains a required gate:** after
deploying, confirm a POST to `/api/storage` without a token returns **401**
(handler reached) rather than 404 or 500 (handler not reached). If it does not,
re-read the Function runtime section of the design spec before changing anything.

### What the remediation changed

1. Validated addresses now travel with each request and the transport connects only
   to them, keeping the original hostname for SNI and certificate validation.
2. The route moved from the Edge to the Node.js runtime, and with it to Vercel's
   `fetch` Web Standard export.
3. The transport moved from `api/` to `src/server/storage/`, since Vercel deploys
   every `api/*.ts` as a route.
4. One transport per import, torn down in a `finally`; dispatchers are destroyed
   when their body settles rather than outliving the request.
5. Production uses the fail-closed DoH resolver that checks JSON `Status`.
6. 6to4 is classified by its embedded IPv4; Teredo rejection is locked in by tests.
7. Cancellation is never awaited, and redirect, failed, and oversized bodies are
   all discarded.
8. DNS lookups receive the operation's abort signal.
9. Requests ask for `accept-encoding: identity`, so counted bytes are wire bytes.
10. A latent bug surfaced while removing an `as never` cast that had been hiding a
    real signature mismatch: Node may express the wanted address family as the
    string `'IPv4'`/`'IPv6'`, which the numeric-only filter would have matched
    against nothing, stranding the connection. Now normalized and tested.

### Task 5 acceptance checklist (all satisfied at `1300c2c`)

- Keep the exported `fetchRemoteImage` contract from the full plan.
- `api/storage.ts` runs on the Node.js runtime; the pinned transport and DoH resolver live in `src/server/storage/storageNetwork.ts`; nothing without a default handler lives under `api/`.
- One transport per request, destroyed in `finally`; no dispatcher outlives its request.
- HTTPS only; reject credentials, non-443 ports, malformed sources, unsafe literals, and every private/reserved/metadata range.
- Validate every A and AAAA result before every request and after each manual redirect.
- Pin the network connection to the validated result while retaining original-host TLS verification.
- Ensure request-local pinning: no unsafe global/shared hostname map and no cross-request race.
- Parse Cloudflare DoH JSON status correctly and test A success + AAAA failure, malformed responses, NODATA, and both-family behavior.
- Cover 6to4 private/loopback/metadata embeddings and reject Teredo.
- Enforce the 10 MB limit from `Content-Length` and streamed bytes.
- Make the 20-second default timeout cover resolution, fetch, streaming, and cleanup.
- Cancel/discard redirect and rejected bodies without waiting indefinitely.
- Detect JPEG/PNG/WebP/GIF from bytes, never from the response header.
- Authenticate and authorize before any source fetch.
- Generate a scoped key using detected MIME, PUT it, verify with HEAD, and only then return `{ objectKey, publicUrl? }`.
- Re-run focused tests, full tests, targeted TypeScript, and production build.
- Obtain fresh specification approval and fresh code/security-quality approval.

## Remaining Tasks

Task 5 is accepted. Execute the remainder of the plan in order:

1. Task 6 — refactor browser upload library and `useImageUpload`.
2. Task 7 — convert every public upload call site; make categories explicit; implement URL import and safe replacement cleanup.
3. Task 8 — switch optimized rendering from ImageKit to Cloudflare transformations.
4. Task 9 — add private object-key schema and legacy-compatible mappers, including mobile. Use the revised CHECK constraints that match the scoped layout; the original regexes reject every key the server generates. Apply this migration before the compatibility release, because `api/storage.ts` already selects the new columns.
5. Task 10 — upload/render private receipts and rider photos through authorized temporary URLs.
6. Task 11 — generalize the legacy ImageKit manifest model to provider-neutral R2 state.
7. Task 12 — add audit, R2 upload, apply, rollback, and verification scripts for every image-bearing field. The audit must capture each row's scope (merchant id, order id + customer id, rider id) so keys can be generated with `createR2Store`; rows with a missing scope are reported and skipped.
8. Task 13 — add Wrangler, bucket CORS JSON, and the beginner-safe Cloudflare/Vercel runbook.
9. Task 14 — remove ImageKit runtime code only after compatibility is green; keep migration compatibility and remote assets.
10. Task 15 — perform the live DNS/bucket/Vercel/migration cutover with recorded evidence. This requires the user's authenticated Cloudflare and Vercel access.
11. Task 16 — after a validation window, present evidence and request separate explicit approval before revoking ImageKit credentials or retiring assets.

Do not skip Tasks 11–12: the user explicitly asked to use the existing backup/audit image scripts to re-upload all required images.

## Cloudflare/Vercel Target Configuration

Client variables:

```dotenv
VITE_R2_PUBLIC_URL=https://images.row-nel.com
VITE_CLOUDFLARE_IMAGE_TRANSFORMATIONS=true
```

Server/migration secrets:

```dotenv
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BUCKET=rownel-public-images
R2_PRIVATE_BUCKET=rownel-private-images
R2_PUBLIC_URL=https://images.row-nel.com
```

Never expose R2 credentials with `VITE_` or `EXPO_PUBLIC_` prefixes. Keep current ImageKit secrets during the compatibility and rollback window.

## Task 5 Security Review — 2026-09-19 (second round)

A fresh security review of the remediation confirmed all four original findings are fixed and raised three new points. Resolutions:

| Finding | Severity | Resolution |
| --- | --- | --- |
| DNS-over-HTTPS requests carried no abort signal, so the operation timeout could not cancel an in-flight lookup and a hung nameserver leaked an outbound socket per import | HIGH | **Fixed.** `resolvePublicAddresses(hostname, signal)` now takes the operation signal and threads it into both DoH requests. Racing the promise was not enough — it left the real request running. Covered by tests at both the importer and resolver level, plus a live check confirming the signal is aborted on timeout. |
| Transparent decompression meant counted bytes were post-gzip, allowing a small body to expand past the limit before the size check saw it | MEDIUM | **Fixed.** The request now sends `accept-encoding: identity`, so counted bytes are the bytes on the wire. Images are already compressed, so nothing is lost. The existing per-chunk ceiling still bounds a non-compliant server. |
| `export default { fetch: ... }` claimed to be a Workers/Bun convention rather than a Vercel one, with `api/imagekit-auth.ts` cited as the proven pattern | HIGH | **Not a defect; no change.** This is Vercel's documented `fetch` Web Standard export for `api/*.ts` (`framework=all`), confirmed on both the Node.js runtime page and the Functions API Reference, plus the changelog entry "Node.js Vercel Functions now support fetch web handlers". `api/imagekit-auth.ts` is not a counter-example: it declares `runtime: 'edge'`, so its bare-default shape is evidence about Edge, not Node. Reverting to a bare default function on the Node runtime is the shape that would actually break. |

The reviewer's wider point about the export shape stands even though the finding does not: a unit test proves what the module exports, not what Vercel's loader does with it. Task 15 step 3 therefore remains a required gate — after deploying, confirm a POST to `/api/storage` without a token returns **401** (handler reached) rather than 404 or 500 (handler not reached).

Also confirmed by live network test, not just mocks: real DoH resolution, a real pinned HTTPS import, and refusal of `localtest.me` — a genuine public hostname that resolves to 127.0.0.1, i.e. the actual rebinding vector.

## Plan Drift Resolved on 2026-09-19

The design spec and full plan were written before Tasks 1–4 landed and had drifted from the accepted code. Both documents now carry revision notes; the authoritative statements are:

| Topic | Old text | Now |
| --- | --- | --- |
| Object keys | flat `menu-items/<uuid>`, `receipts/<customer>/<uuid>` | scoped layout above |
| Route runtime | Vercel Edge | Vercel Node.js (needed for pinning) |
| Transport module | `api/storageNetwork.ts` (WIP) | `src/server/storage/storageNetwork.ts` |
| Task 9 CHECK constraints | flat-layout regexes | scoped-layout regexes with `guest` owner |
| Migration key generation | implied ad hoc | reuse `createR2Store`; scope captured by the audit |
| Receipt uploads | unspecified | existing, caller-owned order only; no checkout upload |
| Mobile | "mobile clients consume the same API contract" | render legacy URLs only; storage client is a follow-up |

## Known Baseline Issues

- `npm install` previously reported 19 dependency vulnerabilities. Do not run a broad/destructive audit fix as part of this migration without separate scope.
- The full project TypeScript check has unrelated pre-existing errors outside the storage work. Compare against the recorded baseline; targeted checks for changed production modules have passed through the accepted tasks.
- Targeted ESLint currently crashes because of the installed ESLint/typescript-eslint plugin-version mismatch. This is a repository baseline issue, not authorization to upgrade the toolchain.
- A Vite native-config warning is emitted by the current Vitest configuration and is not introduced by the R2 work.

## Final Verification and Handoff Rules

- Never log or commit tokens, presigned query strings, service-role keys, or R2 secrets.
- Preserve rollback artifacts before the first database mutation.
- Stop the cutover if imported Cloudflare DNS records differ from the active Vercel zone.
- A failed material migration verification triggers documented rollback while the compatibility release remains deployed.
- Run the complete suite and production build before claiming implementation completion.
- Perform a final code/security review after all local tasks.
- Use the branch-finishing workflow to let the user choose merge/PR/keep-worktree behavior.
- Do not perform Task 16 destructive retirement without fresh explicit user approval.

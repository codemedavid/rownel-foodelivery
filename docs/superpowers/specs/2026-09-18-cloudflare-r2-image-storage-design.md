# Cloudflare R2 Image Storage Design

**Date:** 2026-09-18

**Status:** Approved

**Scope:** Replace ImageKit with Cloudflare R2 for public and private image storage across the web app, mobile app, server endpoints, and catalog migration tools.

## Goals

- Store every newly uploaded or imported application image in Cloudflare R2.
- Migrate reachable existing images from ImageKit and other hosts into R2 without breaking database references.
- Preserve responsive image resizing and automatic format optimization through Cloudflare Image Transformations.
- Keep payment receipts and rider photos private at rest and authorize each read.
- Preserve dry runs, partial-failure handling, verification, and rollback records in the existing image-recovery workflow.
- Keep storage credentials and object-management privileges out of browser and mobile bundles.

## Non-goals

- Delete ImageKit assets or close the ImageKit account during the initial migration.
- Replace Supabase authentication or database storage.
- Move the web application away from Vercel.
- Redesign the image-upload user interface beyond the changes needed to make every input R2-backed.

## Chosen Approach

Use the existing Vercel API layer to authenticate callers and issue narrowly scoped R2 presigned URLs. Web and mobile clients upload image bytes directly to R2 rather than proxying them through Vercel.

This approach keeps the current application topology, prevents R2 credentials from reaching clients, and avoids Vercel request-size and bandwidth overhead. A Cloudflare Worker gateway was rejected because it would introduce another authentication-aware backend. Vercel-proxied uploads were rejected because they would route every image byte through a serverless function.

## Cloudflare and DNS Topology

The `row-nel.com` domain remains registered through Vercel, while authoritative DNS moves to Cloudflare nameservers. Before changing nameservers, all imported Vercel records must be reviewed. After the switch, the existing web application must be verified before storage rollout continues.

Two R2 buckets separate assets by access policy:

| Bucket | Access | Contents |
| --- | --- | --- |
| `rownel-public-images` | Public through `images.row-nel.com` | Menu items, merchant logos and covers, site branding, promotion banners, payment QR codes |
| `rownel-private-images` | No public domain | Payment receipts, rider photos |

The public bucket uses `https://images.row-nel.com` for stable delivery. R2's `r2.dev` URL may be enabled temporarily for setup verification but is not a production delivery URL. The private bucket remains inaccessible except through presigned operations.

Cloudflare Image Transformations operate in front of public R2 objects. Transformation URLs use the Cloudflare delivery syntax and include an original-image fallback. The initial deployment uses the Cloudflare Images free allowance; exceeding its unique-transformation allowance must degrade to the original public object rather than a broken image.

## Storage References

Public database fields continue storing stable HTTPS URLs under `images.row-nel.com`. This keeps public rendering simple in both web and mobile clients.

Private database records store stable R2 object keys, never expiring signed URLs. The application requests a fresh authorized URL whenever it needs to render or link to a private object. Existing URL-named columns may be read during the transition, but the schema migration introduces explicit object-key columns so new data does not overload URL fields with storage identifiers.

The intended private schema is:

- `orders.receipt_object_key`, replacing new writes to `orders.receipt_url`.
- `riders.photo_object_key`, replacing new writes to `riders.photo_url`.

Legacy URL columns remain readable until their data has been migrated and the compatibility window ends. Removing those columns is a later cleanup, not part of the initial cutover.

## Object Key Structure

The server, not the client, generates object keys. A caller selects an allowed asset category and supplies metadata; it cannot supply an arbitrary destination key.

Public prefixes:

- `menu-items/<uuid>.<ext>`
- `merchants/logos/<uuid>.<ext>`
- `merchants/covers/<uuid>.<ext>`
- `site/logo/<uuid>.<ext>`
- `promotions/<uuid>.<ext>`
- `payment-methods/<uuid>.<ext>`

Private prefixes:

- `receipts/<customer-id>/<uuid>.<ext>`
- `rider-photos/<rider-id>/<uuid>.<ext>`

The extension is derived from the validated MIME type. User filenames are metadata only and never form path segments. UUID-based keys prevent collisions and avoid exposing names, order numbers, phone numbers, or other personal information.

## Server API

A same-origin `POST /api/storage` endpoint replaces `/api/imagekit-auth`. It accepts a Supabase bearer token and dispatches the following actions.

### `create-upload`

Input includes the asset category, MIME type, byte size, and any resource context required for authorization. The endpoint:

1. Validates the Supabase session.
2. Validates the caller's role and relationship to the requested category.
3. Validates the declared MIME type and maximum size.
4. Generates a destination object key.
5. Returns a short-lived, single-object presigned `PUT` URL, the object key, and the final public URL when applicable.

The signed request binds the expected content type. Client-side validation improves feedback but never replaces server validation.

### `create-download`

Input identifies the domain resource, not an arbitrary object key: an order for a receipt or a rider for a photo. The endpoint loads the database record, derives the stored object key, authorizes the caller, and returns a short-lived presigned `GET` URL.

Receipt access is allowed to:

- the customer account that owns the order;
- administrators;
- active staff authorized for the order's merchant.

Rider-photo access is allowed to:

- the rider who owns the profile;
- administrators and active operations staff;
- a customer whose visible order is currently assigned to that rider.

Riders do not receive receipt access solely because they are assigned to an order.

### `delete`

Input identifies an application resource and asset category. The endpoint derives the object key from trusted database state and authorizes the mutation. Administrators and authorized staff may delete public operational assets. Riders may replace or remove only their own photo. Receipt deletion follows order ownership and operational access rules.

Deletion is idempotent: an already absent object satisfies the request.

### `import-url`

The existing free-form URL field becomes an explicit import action. The endpoint accepts a public HTTPS source URL, validates it against server-side request-forgery rules, follows only safe redirects, enforces response size and time limits, validates the actual content type, and copies the bytes into the appropriate R2 bucket. The returned value is an R2 URL or object key; third-party URLs are never saved directly for new records.

Private, loopback, link-local, reserved, and cloud-metadata address ranges are rejected before every request and after every redirect. DNS results are validated to prevent hostname rebinding. Downloads stop when they exceed the configured byte limit.

## Client Storage Module

The provider-specific `src/lib/imagekit.ts` module becomes a provider-neutral storage module. Its public interface covers:

- image file validation;
- requesting an authorized upload;
- uploading bytes to a presigned URL;
- importing an external image into R2;
- requesting a private download URL;
- deleting a stored image;
- building Cloudflare transformation URLs for public R2 assets.

The shared upload hook continues to expose upload state and progress, but every call supplies an explicit asset category. `ImageUpload` receives that category from its parent, preventing the current behavior in which unrelated assets are all placed under `menu-items`.

The rider profile flows use the same storage module rather than importing a provider-specific uploader directly. Mobile clients consume the same API contract when upload interfaces are added there.

Replacing an image follows this order:

1. Compress and validate the new file.
2. Obtain a presigned upload URL.
3. Upload and verify the new object.
4. Save the new database reference.
5. Attempt deletion of the previous R2 object.

A cleanup failure does not roll back a successful database update. It is logged for orphan cleanup. A database failure leaves the prior reference intact and marks the new object as an orphan eligible for cleanup.

## Rendering and Transformations

`OptimizedImage` keeps its provider-neutral component interface. Its URL builder transforms only sources on the configured public R2 hostname. It leaves external legacy URLs, `data:` URLs, `blob:` URLs, and private presigned URLs unchanged.

Supported rendering behavior includes width, height, fit/crop, quality, device pixel ratio, and automatic modern-format negotiation. The 1x and 2x `srcSet` behavior remains. Cloudflare transformation errors fall back to the original R2 URL.

Private images are not passed through the public transformation path. Client-side compression bounds their dimensions before upload, and they render from short-lived authorized URLs.

## Authorization Model

Only server-controlled Supabase identity and application database relationships are trusted. Client-provided role names, owner IDs, object keys, and public URLs are not authorization evidence.

Public asset mutations:

- administrators: all categories;
- active staff: categories and merchants permitted by their existing staff scope;
- riders and customers: denied.

Private asset mutations:

- riders: their own rider photo;
- customers: receipts for their own order workflow;
- administrators and properly scoped active staff: operational access required by existing management flows.

Presigned URLs are short-lived bearer tokens. They authorize exactly one HTTP operation against one generated key and are never stored in the database.

## Migration Pipeline

The existing audit, review, upload, apply, and rollback workflow is retained and generalized from ImageKit-specific fields to provider-neutral storage fields.

### Inventory

The audit covers:

- `menu_items.image_url`;
- `merchants.logo_url` and `merchants.cover_image_url`;
- the site logo setting;
- `promotions.banner_image_url`;
- `payment_methods.qr_code_url`;
- `orders.receipt_url`;
- `riders.photo_url`.

The manifest records source URL, fallback reviewed URL where available, target bucket and key, target table/row/column, previous database value, checksum, MIME type, byte size, upload status, and verification status.

Existing manifest decisions and `chosenUrl` values remain usable. The old `imagekitUrl` field is accepted as migration input, but new writes use provider-neutral R2 fields.

### Source selection

For each populated database reference, the migration tries the currently stored URL first. If it is unreachable and the reviewed catalog manifest contains a reachable `chosenUrl`, that URL becomes the fallback. Entries with no valid source are reported and skipped; they are never converted into broken R2 references.

Repeated source content may share an uploaded object when checksum equality is confirmed. Brand-level fan-out in the existing merchant and catalog manifests remains supported.

### Upload and verification

The migration script uses bucket-scoped R2 credentials from the local environment. It downloads remote bytes with timeouts and size limits, validates their actual image MIME type, computes a checksum, uploads to the appropriate bucket, then verifies object metadata and readability.

Runs are idempotent. A verified manifest entry is skipped on later runs. Partial failures are recorded per entry and do not erase prior successes or abort unrelated uploads.

### Database application

Database application is dry-run by default. Before a committed run, the tool writes a timestamped rollback file containing every exact previous value. Only entries with verified R2 objects produce database updates.

Public fields receive stable `images.row-nel.com` URLs. Private fields receive object keys in the new schema columns while legacy URL values remain available during the compatibility period. Rollback restores both the new and legacy fields to their prior values.

ImageKit assets, credentials, and compatibility rendering remain in place until the migrated database has passed production validation. Their removal requires a separate explicit cleanup operation.

## Error Handling

- Invalid type or excessive size is rejected before network upload where possible and rechecked by the server.
- Authorization failures use distinct 401 and 403 responses without exposing object existence.
- A presigned URL that expires before upload is refreshed once automatically.
- R2 upload failures retain the prior database reference and surface an actionable message.
- Database save failures do not delete the prior object and queue the new object for orphan cleanup.
- Old-object deletion failures do not make a completed edit appear failed.
- Private URL generation failures show a protected-image unavailable state rather than exposing the object key.
- Migration failures are recorded per item; no failed upload produces a database update.
- DNS and bucket setup are verified with a disposable smoke-test object before migration begins.

## Infrastructure and Configuration

Repository configuration documents or automates:

- Cloudflare zone onboarding for `row-nel.com`;
- Vercel DNS record preservation and nameserver replacement;
- both R2 bucket definitions;
- `images.row-nel.com` attachment to the public bucket;
- CORS rules for the production web origin and explicit development origins;
- Image Transformations and original-image fallback;
- creation of an R2 API token restricted to the two image buckets;
- Vercel environment variables;
- local migration environment variables.

Server-only configuration includes the R2 account ID, access key ID, secret access key, and bucket names. Client configuration contains only the public image base URL and transformation capability flag. Secret values are never committed, given a `VITE_` or `EXPO_PUBLIC_` prefix, logged, or returned by the storage API.

## Testing Strategy

Implementation follows vertical test-driven slices: one failing behavioral test, the minimum passing implementation, then refactoring while green.

Priority behaviors are:

1. File validation rejects unsupported or oversized input before upload.
2. The browser receives only scoped presigned URLs and never R2 credentials.
3. Upload requests bind one generated key, operation, MIME type, and short expiry.
4. Public asset authorization respects admin/staff scope.
5. Rider-photo mutations are limited to the owning rider or authorized operations users.
6. Receipt reads enforce customer ownership and staff merchant scope.
7. Public URLs and Cloudflare transformations are generated only for the configured R2 host.
8. Original-image fallback prevents transformation-limit failures from breaking rendering.
9. Legacy ImageKit and other external URLs remain renderable during migration.
10. Upload-before-save and delete-after-save ordering preserves valid database references.
11. URL imports reject unsafe networks, unsafe redirects, non-images, and excessive bodies.
12. Migration fixtures prove idempotency, failure isolation, verification gating, and exact rollback output.
13. Web components render temporary private URLs without persisting them.
14. Public and private R2 smoke tests cover upload, read, transformation, authorization, and delete after deployment.

API helpers are separated from the platform handler so authorization and request behavior can be tested under Vitest with controlled Supabase and R2 boundaries. Migration logic is tested through manifest inputs and emitted updates rather than by inspecting internal helper calls.

## Deployment and Cutover

1. Add `row-nel.com` to Cloudflare and review imported DNS records.
2. Change nameservers at Vercel and verify the existing application, TLS, and any email records.
3. Create and configure the public and private buckets.
4. Attach `images.row-nel.com`, configure caching/CORS, and enable transformations.
5. Create the restricted R2 token and configure Vercel secrets.
6. Deploy the compatibility release that can render both legacy URLs and R2 references.
7. Run disposable public/private upload-read-delete smoke tests.
8. Generate fresh image inventory and migration manifests.
9. Run migration upload and verification without database writes.
10. Review the failure report and database dry-run output.
11. Commit database changes with rollback snapshots.
12. Verify representative assets across the web and mobile apps, including private authorization paths.
13. Monitor errors and leave ImageKit intact during the validation window.
14. Plan ImageKit credential and asset removal as a separately approved cleanup.

## Success Criteria

- Every new image upload or URL import writes to the correct R2 bucket.
- No R2 secret appears in client bundles, logs, database values, or API responses.
- Public images load from `images.row-nel.com` and preserve responsive optimization with original fallback.
- Receipts and rider photos cannot be fetched without an authorized, unexpired URL.
- All reachable existing image references are migrated or explicitly reported as skipped.
- No database row is changed for a failed or unverified upload.
- Rollback files can restore every migrated database value.
- The production web app remains available throughout the DNS and storage cutover.

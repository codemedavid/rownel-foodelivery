/*
  # Record the R2 object key behind each private image

  Public images are addressed by URL and stored in the existing `*_url` columns. Private
  images cannot be: they live in a bucket with no public domain and are only ever reachable
  through a short-lived signed GET, which the storage function mints from the object key.

  Without these columns the function has nothing to sign. `authorizeStorageAction` reads
  `orders.receipt_object_key` and `riders.photo_object_key` to decide both whether a caller
  may download and which object to sign, so every receipt and rider-photo request fails
  with a PostgREST 42703 until they exist.

  1. Changes
    - `orders.receipt_object_key` (text, nullable) — key of the payment receipt in the
      private bucket. Null until a receipt is uploaded.
    - `riders.photo_object_key` (text, nullable) — key of the rider's identity photo in the
      private bucket. Null until a photo is uploaded.

  2. Compatibility
    - Both are additive and nullable, so existing rows and the current ImageKit path are
      untouched. `riders.photo_url` stays: it still serves photos uploaded before the
      cutover, and dropping it is a separate, later decision.

  3. Security
    - No RLS change. The storage function reads these through the service role, and an
      object key on its own grants no access — delivery still requires a signed URL that
      only the function can mint, after it re-checks authorization.
*/

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS receipt_object_key text;

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS photo_object_key text;

COMMENT ON COLUMN orders.receipt_object_key IS
  'R2 object key of the payment receipt in the private bucket; signed on demand, never public.';

COMMENT ON COLUMN riders.photo_object_key IS
  'R2 object key of the rider identity photo in the private bucket; signed on demand, never public.';

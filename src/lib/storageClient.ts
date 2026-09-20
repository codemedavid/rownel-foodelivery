/**
 * Browser client for the `/api/storage` Cloudflare R2 endpoint.
 *
 * The browser never holds an R2 credential. Every operation is authorized by the
 * caller's Supabase JWT against the same-origin storage function, which answers
 * with a short-lived presigned URL; only that URL is used against R2 directly.
 *
 * Same-origin means no CORS preflight on the authorizing call. The presigned PUT
 * does cross origins, so the R2 bucket's CORS policy must allow PUT from the site.
 */

import { supabase } from './supabase';
import { extractPublicObjectKey, validateImageFile } from './storage';
import {
  ASSET_CATEGORIES,
  type AssetCategory,
  type StorageContext,
  type UploadGrant,
} from './storageTypes';

const STORAGE_ENDPOINT = '/api/storage';

export interface StorageScope {
  category: AssetCategory;
  /** Scope ids the category requires: merchantId, orderId or riderId. */
  context?: StorageContext;
}

export interface StoredImage {
  objectKey: string;
  /** Present for public categories only; private objects are reached via a signed GET. */
  publicUrl?: string;
}

export interface SignedDownload {
  downloadUrl: string;
  expiresAt: number;
}

type StorageApiRequest =
  | { action: 'create-upload'; category: AssetCategory; mimeType: string; size: number }
  | { action: 'import-url'; category: AssetCategory; sourceUrl: string }
  | { action: 'create-download'; category: AssetCategory }
  | { action: 'delete'; category: AssetCategory; reference: string };

const isPublic = (category: AssetCategory): boolean =>
  ASSET_CATEGORIES[category].visibility === 'public';

/**
 * Call the storage function, wrapping both transport failures and non-2xx
 * responses in one `contextLabel: reason` error. The endpoint answers 400 with a
 * caller-safe reason and keeps its own faults behind an opaque 500, so the
 * message is always safe to show.
 */
const callStorageApi = async <T>(
  request: StorageApiRequest,
  context: StorageContext | undefined,
  contextLabel: string
): Promise<T> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('You must be signed in to manage images');
  }

  let response: Response;
  try {
    response = await fetch(STORAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ...request, context: context ?? {} }),
    });
  } catch (err) {
    throw new Error(`${contextLabel}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const payload = (await response.json().catch(() => null)) as
    | (Partial<T> & { error?: unknown })
    | null;

  if (!response.ok) {
    const message = typeof payload?.error === 'string' && payload.error ? payload.error : null;
    throw new Error(
      `${contextLabel}: ${message ?? `request failed with status ${response.status}`}`
    );
  }
  if (!payload) throw new Error(`${contextLabel}: incomplete response`);

  return payload as T;
};

/**
 * Upload an image through a presigned PUT.
 *
 * The file is validated locally first so an obviously bad pick costs no round
 * trip, then the grant decides the object key and the exact `Content-Type` the
 * PUT must carry — R2 signed that header, so sending the file's own value would
 * be rejected whenever the two differ, including only in case.
 */
export const uploadImageToStorage = async (
  file: File,
  { category, context }: StorageScope
): Promise<StoredImage> => {
  validateImageFile(file);

  const grant = await callStorageApi<UploadGrant>(
    {
      action: 'create-upload',
      category,
      mimeType: file.type.toLowerCase(),
      size: file.size,
    },
    context,
    'Could not authorize the upload'
  );

  if (!grant.uploadUrl || !grant.objectKey || !grant.mimeType) {
    throw new Error('Could not authorize the upload: incomplete response');
  }
  if (isPublic(category) && !grant.publicUrl) {
    throw new Error('Could not authorize the upload: incomplete response');
  }

  let response: Response;
  try {
    response = await fetch(grant.uploadUrl, {
      method: 'PUT',
      // Only the signed Content-Type: an Authorization header here would put the
      // caller's Supabase token on a request to Cloudflare, and R2 would prefer
      // it over the signature already in the URL.
      headers: { 'Content-Type': grant.mimeType },
      body: file,
    });
  } catch (err) {
    throw new Error(
      `Could not upload the image: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    // The status only; the URL carries a live signature and R2's XML body adds
    // nothing a user can act on.
    throw new Error(
      `Could not upload the image: storage rejected it with status ${response.status}`
    );
  }

  return { objectKey: grant.objectKey, publicUrl: grant.publicUrl };
};

/** Copy an image the server fetches itself, for sources pasted into the admin forms. */
export const importImageFromUrl = async (
  sourceUrl: string,
  { category, context }: StorageScope
): Promise<StoredImage> => {
  const stored = await callStorageApi<StoredImage>(
    { action: 'import-url', category, sourceUrl },
    context,
    'Could not import the image'
  );

  if (!stored.objectKey) throw new Error('Could not import the image: incomplete response');
  return { objectKey: stored.objectKey, publicUrl: stored.publicUrl };
};

/** Mint a short-lived signed GET for a private object the caller may read. */
export const requestDownloadUrl = async ({
  category,
  context,
}: StorageScope): Promise<SignedDownload> => {
  const signed = await callStorageApi<SignedDownload>(
    { action: 'create-download', category },
    context,
    'Could not open the image'
  );

  if (!signed.downloadUrl) throw new Error('Could not open the image: incomplete response');
  return signed;
};

/**
 * Delete a stored image.
 *
 * Returns false without contacting the server for anything we do not host —
 * legacy ImageKit and Cloudinary uploads, and URLs pasted into the admin forms.
 * Those are simply unlinked from the record by the caller.
 */
export const deleteImageFromStorage = async (
  reference: string | undefined | null,
  { category, context }: StorageScope
): Promise<boolean> => {
  if (!reference) return false;
  // Public images are addressed by their URL, private ones by their object key.
  if (isPublic(category) && !extractPublicObjectKey(reference)) return false;

  await callStorageApi<{ ok: true; deleted: boolean }>(
    { action: 'delete', category, reference },
    context,
    'Could not delete the image'
  );
  return true;
};

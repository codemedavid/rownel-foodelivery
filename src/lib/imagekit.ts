/**
 * ImageKit image storage.
 *
 * Uploads are signed by the same-origin `/api/imagekit-auth` Vercel function —
 * the ImageKit private key never reaches the browser. Only the public key and
 * the URL endpoint are client-side values. Same-origin means no CORS
 * preflight and no dependency on Supabase edge function infrastructure.
 */

import { supabase } from './supabase';

const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const API_ENDPOINT = '/api/imagekit-auth';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const DEFAULT_ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export interface ImageKitUploadResult {
  url: string;
  fileId: string;
  filePath: string;
  name: string;
  height: number;
  width: number;
  size: number;
  thumbnailUrl?: string;
}

export interface ImageTransform {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'jpg' | 'png';
  crop?: 'maintain_ratio' | 'force' | 'at_max' | 'at_least';
  dpr?: number;
  blur?: number;
}

export interface ValidateImageOptions {
  allowedTypes?: readonly string[];
  maxBytes?: number;
}

export interface UploadOptions {
  folder: string;
  /** Base name for the stored file; a timestamp suffix keeps it unique. */
  fileName?: string;
}

interface ImageKitAuthParams {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
}

/** Read lazily so a missing value surfaces as an actionable error, not a boot crash. */
const getUrlEndpoint = (): string => {
  const endpoint = import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT as string | undefined;
  if (!endpoint) {
    throw new Error(
      'ImageKit is not configured. Set VITE_IMAGEKIT_URL_ENDPOINT in your environment.'
    );
  }
  return endpoint.replace(/\/$/, '');
};

const isImageKitUrl = (src: string): boolean => {
  try {
    return src.startsWith(getUrlEndpoint());
  } catch {
    // Without an endpoint configured nothing can be an ImageKit URL.
    return false;
  }
};

const isPositive = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Serialise a transform into ImageKit's `tr=` syntax, in a stable order. */
const serializeTransform = (transform: ImageTransform): string => {
  const parts: string[] = [];

  if (isPositive(transform.width)) parts.push(`w-${Math.round(transform.width)}`);
  if (isPositive(transform.height)) parts.push(`h-${Math.round(transform.height)}`);
  if (transform.crop) parts.push(`c-${transform.crop}`);
  if (isPositive(transform.quality)) parts.push(`q-${Math.round(transform.quality)}`);
  if (transform.format) parts.push(`f-${transform.format}`);
  if (isPositive(transform.dpr)) parts.push(`dpr-${transform.dpr}`);
  if (isPositive(transform.blur)) parts.push(`bl-${Math.round(transform.blur)}`);

  return parts.join(',');
};

/**
 * Apply an ImageKit transformation to a stored image URL.
 *
 * URLs that are not hosted on our ImageKit endpoint — legacy Cloudinary images,
 * `data:`/`blob:` previews, arbitrary URLs pasted into the admin form — are
 * returned untouched so they keep rendering.
 */
export const buildImageKitUrl = (
  src: string | undefined | null,
  transform?: ImageTransform
): string => {
  if (!src) return '';
  if (!transform || !isImageKitUrl(src)) return src;

  const serialized = serializeTransform(transform);
  if (!serialized) return src;

  const separator = src.includes('?') ? '&' : '?';
  return `${src}${separator}tr=${encodeURIComponent(serialized)}`;
};

/** Throws a user-facing error when the file is not an acceptable image. */
export const validateImageFile = (file: File, options: ValidateImageOptions = {}): void => {
  const allowedTypes = options.allowedTypes ?? DEFAULT_ALLOWED_IMAGE_TYPES;
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;

  if (!allowedTypes.includes(file.type.toLowerCase())) {
    const readable = allowedTypes
      .map((type) => type.replace('image/', '').toUpperCase())
      .join(', ');
    throw new Error(`Please upload a valid image file (${readable})`);
  }

  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`Image size must be less than ${maxMb}MB`);
  }
};

interface ImageKitApiRequest {
  action: 'auth' | 'delete';
  filePath?: string;
}

/**
 * Call the same-origin signing/delete endpoint, wrapping both network
 * failures and non-2xx responses in one `contextLabel: reason` error so
 * callers always get an actionable message instead of a generic one.
 */
const callImageKitApi = async (
  body: ImageKitApiRequest,
  contextLabel: string
): Promise<unknown> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let response: Response;
  try {
    response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`${contextLabel}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) {
    const message = typeof payload?.error === 'string' && payload.error ? payload.error : null;
    throw new Error(`${contextLabel}: ${message ?? `request failed with status ${response.status}`}`);
  }

  return payload;
};

const requestUploadAuth = async (): Promise<ImageKitAuthParams> => {
  const data = (await callImageKitApi({ action: 'auth' }, 'Could not authorize the upload')) as
    | Partial<ImageKitAuthParams>
    | null;

  if (!data?.token || !data?.signature || !data?.publicKey) {
    throw new Error('Could not authorize the upload: incomplete response');
  }

  return data as ImageKitAuthParams;
};

/** Upload an image to ImageKit using a short-lived, server-generated signature. */
export const uploadToImageKit = async (
  file: File,
  { folder, fileName }: UploadOptions
): Promise<ImageKitUploadResult> => {
  validateImageFile(file);
  // Fail fast on misconfiguration rather than after a pointless round trip.
  getUrlEndpoint();

  const auth = await requestUploadAuth();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('fileName', `${fileName ?? 'image'}_${Date.now()}`);
  formData.append('folder', folder);
  formData.append('useUniqueFileName', 'true');
  formData.append('publicKey', auth.publicKey);
  formData.append('token', auth.token);
  formData.append('expire', String(auth.expire));
  formData.append('signature', auth.signature);

  const response = await fetch(IMAGEKIT_UPLOAD_URL, { method: 'POST', body: formData });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message || `Upload failed with status ${response.status}`);
  }

  return (await response.json()) as ImageKitUploadResult;
};

/**
 * The file path ImageKit stores an image under, derived from its URL.
 * Returns null when the URL is not hosted on our ImageKit endpoint.
 */
export const extractImageKitFilePath = (src: string | undefined | null): string | null => {
  if (!src || !isImageKitUrl(src)) return null;

  const path = src.slice(getUrlEndpoint().length).split('?')[0];
  return path.startsWith('/') ? path : `/${path}`;
};

/**
 * Delete a stored image.
 *
 * Returns false without contacting the server for images that are not on
 * ImageKit (legacy Cloudinary uploads, externally hosted URLs) — those are
 * simply unlinked from the record by the caller.
 */
export const deleteFromImageKit = async (src: string | undefined | null): Promise<boolean> => {
  const filePath = extractImageKitFilePath(src);
  if (!filePath) return false;

  await callImageKitApi({ action: 'delete', filePath }, 'Could not delete the image');
  return true;
};

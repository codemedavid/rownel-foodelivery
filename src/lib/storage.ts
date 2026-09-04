/**
 * Image storage on Supabase Storage.
 *
 * Uploads and deletes go straight from the browser to the `menu-images`
 * bucket using the signed-in user's own session — access is governed by the
 * bucket's RLS policies (public read, authenticated write/delete), so there
 * is no server-side signing step and no private key to protect.
 */

import { supabase } from './supabase';

const BUCKET = 'menu-images';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const DEFAULT_ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export interface StorageUploadResult {
  url: string;
  path: string;
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

const sanitizeFileName = (name: string): string => name.replace(/[^a-zA-Z0-9.]/g, '_');

/** Upload an image to Supabase Storage and return its public URL. */
export const uploadToStorage = async (
  file: File,
  { folder, fileName }: UploadOptions
): Promise<StorageUploadResult> => {
  validateImageFile(file);

  const path = `${folder}/${fileName ?? 'image'}_${Date.now()}_${sanitizeFileName(file.name)}`;

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Could not upload the image: ${error.message}`);

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return { url: publicUrlData.publicUrl, path: data.path };
};

const OBJECT_URL_MARKER = `/storage/v1/object/public/${BUCKET}/`;

/**
 * The bucket-relative object path for a stored URL. Returns null when the
 * URL is not hosted in this bucket (legacy ImageKit/Cloudinary uploads,
 * externally hosted URLs).
 */
export const extractStoragePath = (src: string | undefined | null): string | null => {
  if (!src) return null;
  const index = src.indexOf(OBJECT_URL_MARKER);
  if (index === -1) return null;
  return decodeURIComponent(src.slice(index + OBJECT_URL_MARKER.length).split('?')[0]);
};

/**
 * Delete a stored image.
 *
 * Returns false without contacting storage for images that are not in this
 * bucket (legacy ImageKit/Cloudinary uploads, externally hosted URLs) —
 * those are simply unlinked from the record by the caller.
 */
export const deleteFromStorage = async (src: string | undefined | null): Promise<boolean> => {
  const path = extractStoragePath(src);
  if (!path) return false;

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Could not delete the image: ${error.message}`);
  return true;
};

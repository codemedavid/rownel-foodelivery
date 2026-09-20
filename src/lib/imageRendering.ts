/**
 * One resize entry point for images that may live on either provider.
 *
 * During the R2 migration a page renders both at once: newly uploaded images sit
 * on the R2 public domain and resize through Cloudflare Image Transformations,
 * while everything uploaded before it stays on ImageKit and resizes through
 * ImageKit's `tr=` syntax. Anything on neither host — legacy Cloudinary uploads,
 * `data:`/`blob:` previews, URLs pasted into the admin forms — renders untouched.
 */

import { buildImageKitUrl, type ImageTransform as ImageKitTransform } from './imagekit';
import { buildPublicImageUrl, extractPublicObjectKey } from './storage';
import type { ImageTransform as R2Transform } from './storageTypes';

/**
 * ImageKit's crop modes named in terms of Cloudflare's fit modes.
 *
 * `maintain_ratio` and `at_least` both fill the box and crop the overflow, which
 * is Cloudflare's `cover`. `at_max` fits inside the box without upscaling, which
 * is `scale-down`. ImageKit's `force` stretches; Cloudflare cannot, so `cover`
 * is the closest honest answer rather than silently changing the aspect ratio.
 */
const FIT_BY_CROP: Record<NonNullable<ImageKitTransform['crop']>, R2Transform['fit']> = {
  maintain_ratio: 'cover',
  at_least: 'cover',
  at_max: 'scale-down',
  force: 'cover',
};

export interface RenderTransform {
  width: number;
  height?: number;
  quality?: number;
  crop?: ImageKitTransform['crop'];
}

/** True when the source is an object on the configured R2 public domain. */
export const isPublicStorageUrl = (src: string | null | undefined): boolean =>
  extractPublicObjectKey(src) !== null;

/**
 * Resize `src` with whichever provider hosts it, returning it unchanged when
 * neither does.
 */
export const buildRenderedImageUrl = (
  src: string | null | undefined,
  { width, height, quality, crop }: RenderTransform
): string => {
  if (!src) return '';

  if (isPublicStorageUrl(src)) {
    return buildPublicImageUrl(src, {
      width,
      height,
      quality,
      format: 'auto',
      fit: crop ? FIT_BY_CROP[crop] : 'cover',
    });
  }

  return buildImageKitUrl(src, { width, height, quality, crop, format: 'auto' });
};

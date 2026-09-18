import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  type ImageTransform,
} from './storageTypes';

export { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from './storageTypes';

/** Return the configured public origin, or throw when an R2 operation needs it. */
export const getPublicOrigin = (): string => {
  const configured = import.meta.env.VITE_R2_PUBLIC_URL as string | undefined;
  if (!configured) {
    throw new Error(
      'R2 public image storage is not configured. Set VITE_R2_PUBLIC_URL in your environment.'
    );
  }

  return configured.replace(/\/+$/, '');
};

const getPublicOriginUrl = (): URL => new URL(getPublicOrigin());

const isPositive = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isAllowedFormat = (value: ImageTransform['format']): boolean =>
  value === 'auto' || value === 'webp' || value === 'jpg' || value === 'png';

const isAllowedFit = (value: ImageTransform['fit']): boolean =>
  value === 'scale-down' ||
  value === 'contain' ||
  value === 'cover' ||
  value === 'crop' ||
  value === 'pad';

/** Validate a browser image before any upload request is attempted. */
export const validateImageFile = (file: File): void => {
  const type = file.type.toLowerCase();
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)) {
    throw new Error('Please upload a valid image file (JPEG, PNG, WebP, GIF)');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image size must be less than 10MB');
  }
};

/**
 * Return an R2 object key only for URLs on the configured public origin.
 * Query strings and fragments are intentionally ignored.
 */
export const extractPublicObjectKey = (src: string | null | undefined): string | null => {
  if (!src) return null;

  // Rendering must remain safe when R2 is not configured: callers can still
  // display legacy, data, blob, or malformed sources unchanged.
  let configuredOrigin: URL;
  try {
    configuredOrigin = getPublicOriginUrl();
  } catch {
    return null;
  }

  try {
    const source = new URL(src);
    if (source.protocol !== 'http:' && source.protocol !== 'https:') return null;

    // Credentials are not part of URL.origin, but accepting them would make a
    // lookalike URL appear to be an object on our host.
    if (source.username || source.password || source.origin !== configuredOrigin.origin) {
      return null;
    }

    const encodedPath = source.pathname.replace(/^\//, '');
    if (!encodedPath) return null;

    const key = decodeURIComponent(encodedPath);
    return key || null;
  } catch {
    return null;
  }
};

const serializeTransform = (transform: ImageTransform): string => {
  const options: string[] = [];

  if (isPositive(transform.width)) options.push(`width=${Math.round(transform.width)}`);
  if (isPositive(transform.height)) options.push(`height=${Math.round(transform.height)}`);
  if (transform.fit && isAllowedFit(transform.fit)) options.push(`fit=${transform.fit}`);
  if (isPositive(transform.quality)) options.push(`quality=${Math.round(transform.quality)}`);
  if (transform.format && isAllowedFormat(transform.format)) {
    options.push(`format=${transform.format}`);
  }
  if (isPositive(transform.dpr)) options.push(`dpr=${transform.dpr}`);

  return options.join(',');
};

/**
 * Build a Cloudflare Image Transformations URL for a public R2 object.
 * Sources on other hosts, including legacy and preview URLs, are untouched.
 */
export const buildPublicImageUrl = (
  src: string | null | undefined,
  transform?: ImageTransform
): string => {
  if (!src) return '';
  if (!transform) return src;

  const key = extractPublicObjectKey(src);
  if (!key) return src;

  const serialized = serializeTransform(transform);
  if (!serialized) return src;

  const encodedKey = key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${getPublicOrigin()}/cdn-cgi/image/${serialized},onerror=redirect/${encodedKey}`;
};

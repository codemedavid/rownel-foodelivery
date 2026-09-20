import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRenderedImageUrl, isPublicStorageUrl } from './imageRendering';

beforeEach(() => {
  vi.stubEnv('VITE_R2_PUBLIC_URL', 'https://images.row-nel.com');
  vi.stubEnv('VITE_IMAGEKIT_URL_ENDPOINT', 'https://ik.imagekit.io/rownel');
});

describe('buildRenderedImageUrl', () => {
  it('resizes an R2 image through Cloudflare Image Transformations', () => {
    const url = buildRenderedImageUrl('https://images.row-nel.com/menu-items/m1/a.png', {
      width: 300,
      quality: 80,
    });

    expect(url).toBe(
      'https://images.row-nel.com/cdn-cgi/image/width=300,fit=cover,quality=80,format=auto,onerror=redirect/menu-items/m1/a.png'
    );
  });

  it('resizes a legacy ImageKit image through ImageKit, so old rows keep rendering', () => {
    const url = buildRenderedImageUrl('https://ik.imagekit.io/rownel/menu-items/old.jpg', {
      width: 300,
      quality: 80,
      crop: 'maintain_ratio',
    });

    expect(url).toContain('tr=');
    expect(url).toContain('w-300');
    expect(url).not.toContain('cdn-cgi');
  });

  it('names ImageKit crops in Cloudflare fit terms', () => {
    const url = buildRenderedImageUrl('https://images.row-nel.com/menu-items/m1/a.png', {
      width: 300,
      crop: 'at_max',
    });

    expect(url).toContain('fit=scale-down');
  });

  it('leaves a source on neither host untouched', () => {
    const pasted = 'https://example.com/photo.jpg';
    expect(buildRenderedImageUrl(pasted, { width: 300 })).toBe(pasted);
  });

  it('returns an empty string for a missing source', () => {
    expect(buildRenderedImageUrl(undefined, { width: 300 })).toBe('');
    expect(buildRenderedImageUrl(null, { width: 300 })).toBe('');
  });

  it('renders every source unchanged when R2 is not configured yet', () => {
    vi.stubEnv('VITE_R2_PUBLIC_URL', '');
    const src = 'https://images.row-nel.com/menu-items/m1/a.png';

    expect(buildRenderedImageUrl(src, { width: 300 })).toBe(src);
  });
});

describe('isPublicStorageUrl', () => {
  it('recognises our own public domain and nothing else', () => {
    expect(isPublicStorageUrl('https://images.row-nel.com/menu-items/m1/a.png')).toBe(true);
    expect(isPublicStorageUrl('https://ik.imagekit.io/rownel/a.png')).toBe(false);
    expect(isPublicStorageUrl('https://images.row-nel.com.evil.test/a.png')).toBe(false);
    expect(isPublicStorageUrl(null)).toBe(false);
  });
});

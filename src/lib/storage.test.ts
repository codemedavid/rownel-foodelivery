import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildPublicImageUrl,
  extractPublicObjectKey,
  getPublicOrigin,
  validateImageFile,
} from './storage';
import {
  ALLOWED_IMAGE_TYPES,
  ASSET_CATEGORIES,
  MAX_IMAGE_BYTES,
} from './storageTypes';

const PUBLIC_URL = 'https://images.row-nel.com';

const makeFile = ({ type = 'image/jpeg', size = 1024 } = {}): File => {
  const file = new File(['x'], 'image.jpg', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

beforeEach(() => {
  (import.meta.env as Record<string, unknown>).VITE_R2_PUBLIC_URL = `${PUBLIC_URL}/`;
});

describe('storage categories', () => {
  it('classifies every category with its visibility and object prefix', () => {
    expect(ASSET_CATEGORIES).toEqual({
      'menu-item': { visibility: 'public', prefix: 'menu-items' },
      'merchant-logo': { visibility: 'public', prefix: 'merchants/logos' },
      'merchant-cover': { visibility: 'public', prefix: 'merchants/covers' },
      'site-logo': { visibility: 'public', prefix: 'site/logo' },
      promotion: { visibility: 'public', prefix: 'promotions' },
      'payment-qr': { visibility: 'public', prefix: 'payment-methods' },
      receipt: { visibility: 'private', prefix: 'receipts' },
      'rider-photo': { visibility: 'private', prefix: 'rider-photos' },
    });
  });
});

describe('buildPublicImageUrl', () => {
  it('builds a stable Cloudflare transform for an R2 public object', () => {
    const source = `${PUBLIC_URL}/menu-items/a.jpg`;

    expect(buildPublicImageUrl(source, { width: 400, quality: 80, format: 'auto' })).toBe(
      `${PUBLIC_URL}/cdn-cgi/image/width=400,quality=80,format=auto,onerror=redirect/menu-items/a.jpg`
    );
  });

  it('leaves external legacy, data, blob, and missing sources unchanged safely', () => {
    const legacy = 'https://ik.imagekit.io/legacy/a.jpg';
    const data = 'data:image/png;base64,iVBORw0KGgo=';
    const blob = 'blob:http://localhost:5173/8f6c';

    expect(buildPublicImageUrl(legacy, { width: 400 })).toBe(legacy);
    expect(buildPublicImageUrl(data, { width: 400 })).toBe(data);
    expect(buildPublicImageUrl(blob, { width: 400 })).toBe(blob);
    expect(buildPublicImageUrl(undefined, { width: 400 })).toBe('');
    expect(buildPublicImageUrl('', { width: 400 })).toBe('');
  });

  it('leaves blob URLs unchanged even when their embedded origin matches ours', () => {
    const blob = `blob:${PUBLIC_URL}/8f6c`;

    expect(extractPublicObjectKey(blob)).toBeNull();
    expect(buildPublicImageUrl(blob, { width: 400 })).toBe(blob);
  });

  it('emits options in stable order and ignores non-positive numeric values', () => {
    const source = `${PUBLIC_URL}/menu-items/a file.jpg`;

    expect(
      buildPublicImageUrl(source, {
        dpr: 2,
        format: 'webp',
        quality: -1,
        fit: 'cover',
        height: 0,
        width: 320.8,
      })
    ).toBe(
      `${PUBLIC_URL}/cdn-cgi/image/width=321,fit=cover,format=webp,dpr=2,onerror=redirect/menu-items/a%20file.jpg`
    );
    expect(buildPublicImageUrl(source, { width: 0, height: -10, quality: 0 })).toBe(source);
  });
});

describe('extractPublicObjectKey', () => {
  it('extracts a decoded key and strips a query string for our exact public origin', () => {
    expect(
      extractPublicObjectKey(`${PUBLIC_URL}/merchants/logos/a%20b.png?x=1#fragment`)
    ).toBe('merchants/logos/a b.png');
  });

  it('rejects external and malicious lookalike hosts', () => {
    expect(extractPublicObjectKey('https://example.com/a.png')).toBeNull();
    expect(extractPublicObjectKey('https://images.row-nel.com.evil.test/a.png')).toBeNull();
    expect(extractPublicObjectKey('https://evil.test@images.row-nel.com.evil.test/a.png')).toBeNull();
    expect(extractPublicObjectKey(`${PUBLIC_URL}.evil.test/a.png`)).toBeNull();
  });

  it('returns null for malformed, missing, or non-http sources', () => {
    expect(extractPublicObjectKey(undefined)).toBeNull();
    expect(extractPublicObjectKey(null)).toBeNull();
    expect(extractPublicObjectKey('')).toBeNull();
    expect(extractPublicObjectKey('not a url')).toBeNull();
    expect(extractPublicObjectKey('data:image/png;base64,a')).toBeNull();
    expect(extractPublicObjectKey('blob:http://localhost/abc')).toBeNull();
    expect(extractPublicObjectKey(`${PUBLIC_URL}/bad%ZZ.png`)).toBeNull();
  });
});

describe('validateImageFile', () => {
  it('accepts all supported image MIME types case-insensitively', () => {
    for (const type of ALLOWED_IMAGE_TYPES) {
      expect(() => validateImageFile(makeFile({ type: type.toUpperCase() }))).not.toThrow();
    }
  });

  it('rejects unsupported files with actionable image formats', () => {
    expect(() => validateImageFile(makeFile({ type: 'application/pdf' }))).toThrow(
      /JPEG, PNG, WebP, GIF/
    );
  });

  it('rejects files larger than 10MB with an actionable message', () => {
    expect(() => validateImageFile(makeFile({ size: MAX_IMAGE_BYTES + 1 }))).toThrow(/10MB/);
  });
});

describe('R2 public URL configuration', () => {
  it('keeps safe non-R2 sources unchanged when configuration is missing', () => {
    delete (import.meta.env as Record<string, unknown>).VITE_R2_PUBLIC_URL;

    const legacy = 'https://ik.imagekit.io/legacy/a.jpg';
    const data = 'data:image/png;base64,iVBORw0KGgo=';
    const blob = 'blob:https://images.row-nel.com/8f6c';
    const malformed = 'not a URL';

    expect(buildPublicImageUrl(legacy, { width: 400 })).toBe(legacy);
    expect(buildPublicImageUrl(data, { width: 400 })).toBe(data);
    expect(buildPublicImageUrl(blob, { width: 400 })).toBe(blob);
    expect(buildPublicImageUrl(malformed, { width: 400 })).toBe(malformed);
    expect(extractPublicObjectKey(malformed)).toBeNull();
  });

  it('reports the missing configuration name for an operation requiring R2', () => {
    delete (import.meta.env as Record<string, unknown>).VITE_R2_PUBLIC_URL;

    expect(() => getPublicOrigin()).toThrow(/VITE_R2_PUBLIC_URL/);
  });
});

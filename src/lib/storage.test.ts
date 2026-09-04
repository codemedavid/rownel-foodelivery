import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
const removeMock = vi.fn();
const fromMock = vi.fn(() => ({
  upload: uploadMock,
  getPublicUrl: getPublicUrlMock,
  remove: removeMock,
}));

vi.mock('./supabase', () => ({
  supabase: { storage: { from: (...args: unknown[]) => fromMock(...args) } },
}));

import {
  validateImageFile,
  uploadToStorage,
  deleteFromStorage,
  extractStoragePath,
  MAX_IMAGE_BYTES,
} from './storage';

const BUCKET = 'menu-images';
const PUBLIC_URL =
  'https://apbmremibgwoyrddjhcg.supabase.co/storage/v1/object/public/menu-images/menu-items/burger_123_photo.jpg';
const CLOUDINARY_URL =
  'https://res.cloudinary.com/demo/image/upload/v1/menu-items/menu_123.jpg';

const makeFile = (
  { type = 'image/jpeg', size = 1024, name = 'photo.jpg' } = {}
): File => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

beforeEach(() => {
  uploadMock.mockReset();
  getPublicUrlMock.mockReset();
  removeMock.mockReset();
  fromMock.mockClear();
  uploadMock.mockResolvedValue({ data: { path: 'menu-items/burger_123_photo.jpg' }, error: null });
  getPublicUrlMock.mockReturnValue({ data: { publicUrl: PUBLIC_URL } });
  removeMock.mockResolvedValue({ error: null });
});

describe('validateImageFile', () => {
  it('accepts a JPEG within the size limit', () => {
    expect(() => validateImageFile(makeFile())).not.toThrow();
  });

  it('rejects an unsupported file type with an actionable message', () => {
    const file = makeFile({ type: 'application/pdf', name: 'menu.pdf' });
    expect(() => validateImageFile(file)).toThrow(/valid image file/i);
  });

  it('rejects a file larger than the maximum size', () => {
    const file = makeFile({ size: MAX_IMAGE_BYTES + 1 });
    expect(() => validateImageFile(file)).toThrow(/less than 10MB/i);
  });
});

describe('uploadToStorage', () => {
  it('uploads to the menu-images bucket and returns the public URL', async () => {
    const result = await uploadToStorage(makeFile(), { folder: 'menu-items', fileName: 'burger' });

    expect(fromMock).toHaveBeenCalledWith(BUCKET);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [path, file, options] = uploadMock.mock.calls[0];
    expect(path).toMatch(/^menu-items\/burger_\d+_photo\.jpg$/);
    expect(file).toBeInstanceOf(File);
    expect(options).toMatchObject({ contentType: 'image/jpeg', upsert: false });
    expect(result.url).toBe(PUBLIC_URL);
  });

  it('rejects an invalid file before contacting storage', async () => {
    const file = makeFile({ type: 'application/pdf', name: 'menu.pdf' });
    await expect(uploadToStorage(file, { folder: 'menu-items' })).rejects.toThrow(/valid image file/i);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('surfaces a clear error when the upload fails', async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: 'Bucket not found' } });
    await expect(uploadToStorage(makeFile(), { folder: 'menu-items' })).rejects.toThrow(
      /Bucket not found/
    );
  });
});

describe('extractStoragePath', () => {
  it('returns the object path for a stored URL', () => {
    expect(extractStoragePath(PUBLIC_URL)).toBe('menu-items/burger_123_photo.jpg');
  });

  it('returns null for URLs not hosted on this bucket', () => {
    expect(extractStoragePath(CLOUDINARY_URL)).toBeNull();
    expect(extractStoragePath('')).toBeNull();
  });
});

describe('deleteFromStorage', () => {
  it('removes the object behind a stored URL', async () => {
    const deleted = await deleteFromStorage(PUBLIC_URL);

    expect(fromMock).toHaveBeenCalledWith(BUCKET);
    expect(removeMock).toHaveBeenCalledWith(['menu-items/burger_123_photo.jpg']);
    expect(deleted).toBe(true);
  });

  it('is a no-op for URLs not hosted on this bucket', async () => {
    const deleted = await deleteFromStorage(CLOUDINARY_URL);
    expect(deleted).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('throws when the removal fails', async () => {
    removeMock.mockResolvedValue({ error: { message: 'Forbidden' } });
    await expect(deleteFromStorage(PUBLIC_URL)).rejects.toThrow(/Forbidden/);
  });
});

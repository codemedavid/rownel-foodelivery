import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import {
  buildImageKitUrl,
  validateImageFile,
  uploadToImageKit,
  deleteFromImageKit,
  extractImageKitFilePath,
  MAX_IMAGE_BYTES,
} from './imagekit';

const ENDPOINT = 'https://ik.imagekit.io/hvqkkhesl';
const IK_URL = `${ENDPOINT}/menu-items/burger_abc.jpg`;
const CLOUDINARY_URL =
  'https://res.cloudinary.com/demo/image/upload/v1/menu-items/menu_123.jpg';

const makeFile = (
  { type = 'image/jpeg', size = 1024, name = 'photo.jpg' } = {}
): File => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const authResponse = {
  data: {
    token: 'tok-1',
    expire: 1700000000,
    signature: 'sig-1',
    publicKey: 'public_test',
  },
  error: null,
};

const uploadResponse = {
  url: `${ENDPOINT}/menu-items/burger_xyz.jpg`,
  fileId: 'file-123',
  filePath: '/menu-items/burger_xyz.jpg',
  name: 'burger_xyz.jpg',
  height: 800,
  width: 1200,
  size: 4096,
};

beforeEach(() => {
  (import.meta.env as Record<string, unknown>).VITE_IMAGEKIT_URL_ENDPOINT = ENDPOINT;
  invokeMock.mockReset();
  vi.unstubAllGlobals();
});

describe('buildImageKitUrl', () => {
  it('returns the source unchanged when no transform is requested', () => {
    // Arrange / Act
    const result = buildImageKitUrl(IK_URL);

    // Assert
    expect(result).toBe(IK_URL);
  });

  it('appends width, quality and format as an ImageKit tr parameter', () => {
    // Arrange / Act
    const result = buildImageKitUrl(IK_URL, { width: 400, quality: 80, format: 'auto' });

    // Assert
    expect(result).toBe(`${IK_URL}?tr=w-400%2Cq-80%2Cf-auto`);
  });

  it('emits transform parameters in a stable width,height,crop order', () => {
    // Arrange / Act
    const result = buildImageKitUrl(IK_URL, { height: 200, crop: 'at_max', width: 300 });

    // Assert
    expect(decodeURIComponent(result)).toBe(`${IK_URL}?tr=w-300,h-200,c-at_max`);
  });

  it('joins with & when the source URL already has a query string', () => {
    // Arrange
    const withQuery = `${IK_URL}?v=2`;

    // Act
    const result = buildImageKitUrl(withQuery, { width: 400 });

    // Assert
    expect(result).toBe(`${withQuery}&tr=w-400`);
  });

  it('leaves legacy Cloudinary URLs untouched so existing images keep rendering', () => {
    // Arrange / Act
    const result = buildImageKitUrl(CLOUDINARY_URL, { width: 400, quality: 80 });

    // Assert
    expect(result).toBe(CLOUDINARY_URL);
  });

  it('leaves data and blob URLs untouched', () => {
    // Arrange
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const blobUrl = 'blob:http://localhost:5173/8f6c';

    // Act / Assert
    expect(buildImageKitUrl(dataUrl, { width: 100 })).toBe(dataUrl);
    expect(buildImageKitUrl(blobUrl, { width: 100 })).toBe(blobUrl);
  });

  it('returns an empty string for missing sources', () => {
    // Arrange / Act / Assert
    expect(buildImageKitUrl(undefined, { width: 400 })).toBe('');
    expect(buildImageKitUrl('', { width: 400 })).toBe('');
  });

  it('ignores non-positive dimensions instead of emitting invalid transforms', () => {
    // Arrange / Act
    const result = buildImageKitUrl(IK_URL, { width: 0, height: -10 });

    // Assert
    expect(result).toBe(IK_URL);
  });
});

describe('validateImageFile', () => {
  it('accepts a JPEG within the size limit', () => {
    // Arrange
    const file = makeFile({ type: 'image/jpeg', size: 1024 });

    // Act / Assert
    expect(() => validateImageFile(file)).not.toThrow();
  });

  it('accepts uppercase MIME types', () => {
    // Arrange
    const file = makeFile({ type: 'IMAGE/PNG' });

    // Act / Assert
    expect(() => validateImageFile(file)).not.toThrow();
  });

  it('rejects an unsupported file type with an actionable message', () => {
    // Arrange
    const file = makeFile({ type: 'application/pdf', name: 'menu.pdf' });

    // Act / Assert
    expect(() => validateImageFile(file)).toThrow(/valid image file/i);
  });

  it('rejects a file larger than the maximum size', () => {
    // Arrange
    const file = makeFile({ size: MAX_IMAGE_BYTES + 1 });

    // Act / Assert
    expect(() => validateImageFile(file)).toThrow(/less than 10MB/i);
  });

  it('honours a caller-supplied allowed type list', () => {
    // Arrange
    const gif = makeFile({ type: 'image/gif', name: 'anim.gif' });

    // Act / Assert
    expect(() => validateImageFile(gif, { allowedTypes: ['image/jpeg'] })).toThrow(
      /valid image file/i
    );
  });
});

describe('uploadToImageKit', () => {
  it('uploads a signed request to ImageKit and returns the stored file', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => uploadResponse,
    });
    vi.stubGlobal('fetch', fetchMock);
    invokeMock.mockResolvedValue(authResponse);

    // Act
    const result = await uploadToImageKit(makeFile(), {
      folder: 'menu-items',
      fileName: 'burger',
    });

    // Assert
    expect(invokeMock).toHaveBeenCalledWith('imagekit-auth', {
      body: { action: 'auth' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://upload.imagekit.io/api/v1/files/upload');
    const form = init.body as FormData;
    expect(form.get('publicKey')).toBe('public_test');
    expect(form.get('token')).toBe('tok-1');
    expect(form.get('signature')).toBe('sig-1');
    expect(form.get('expire')).toBe('1700000000');
    expect(form.get('folder')).toBe('menu-items');
    expect(String(form.get('fileName'))).toMatch(/^burger/);
    expect(result).toEqual(uploadResponse);
  });

  it('never sends the private key from the browser', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => uploadResponse });
    vi.stubGlobal('fetch', fetchMock);
    invokeMock.mockResolvedValue(authResponse);

    // Act
    await uploadToImageKit(makeFile(), { folder: 'menu-items' });

    // Assert
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect([...form.keys()]).not.toContain('privateKey');
  });

  it('rejects an invalid file before requesting an upload signature', async () => {
    // Arrange
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const file = makeFile({ type: 'application/pdf', name: 'menu.pdf' });

    // Act / Assert
    await expect(uploadToImageKit(file, { folder: 'menu-items' })).rejects.toThrow(
      /valid image file/i
    );
    expect(invokeMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a clear error when the signing function fails', async () => {
    // Arrange
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Unauthorized' } });

    // Act / Assert
    await expect(uploadToImageKit(makeFile(), { folder: 'menu-items' })).rejects.toThrow(
      /Unauthorized/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the edge function response body instead of a generic status error', async () => {
    // Arrange
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({ error: 'ImageKit keys are not configured on the server' }),
        },
      },
    });

    // Act / Assert
    await expect(uploadToImageKit(makeFile(), { folder: 'menu-items' })).rejects.toThrow(
      /ImageKit keys are not configured on the server/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the ImageKit error message when the upload is rejected', async () => {
    // Arrange
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid signature' }),
      })
    );
    invokeMock.mockResolvedValue(authResponse);

    // Act / Assert
    await expect(uploadToImageKit(makeFile(), { folder: 'menu-items' })).rejects.toThrow(
      /Invalid signature/
    );
  });

  it('fails with a configuration error when the URL endpoint is not set', async () => {
    // Arrange
    (import.meta.env as Record<string, unknown>).VITE_IMAGEKIT_URL_ENDPOINT = '';

    // Act / Assert
    await expect(uploadToImageKit(makeFile(), { folder: 'menu-items' })).rejects.toThrow(
      /VITE_IMAGEKIT_URL_ENDPOINT/
    );
  });
});

describe('extractImageKitFilePath', () => {
  it('returns the file path for an ImageKit URL', () => {
    // Arrange / Act / Assert
    expect(extractImageKitFilePath(IK_URL)).toBe('/menu-items/burger_abc.jpg');
  });

  it('strips any transformation query string', () => {
    // Arrange / Act / Assert
    expect(extractImageKitFilePath(`${IK_URL}?tr=w-400`)).toBe('/menu-items/burger_abc.jpg');
  });

  it('returns null for URLs that are not hosted on ImageKit', () => {
    // Arrange / Act / Assert
    expect(extractImageKitFilePath(CLOUDINARY_URL)).toBeNull();
    expect(extractImageKitFilePath('')).toBeNull();
  });
});

describe('deleteFromImageKit', () => {
  it('asks the edge function to delete the file behind an ImageKit URL', async () => {
    // Arrange
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });

    // Act
    const deleted = await deleteFromImageKit(IK_URL);

    // Assert
    expect(invokeMock).toHaveBeenCalledWith('imagekit-auth', {
      body: { action: 'delete', filePath: '/menu-items/burger_abc.jpg' },
    });
    expect(deleted).toBe(true);
  });

  it('is a no-op for legacy Cloudinary URLs', async () => {
    // Arrange / Act
    const deleted = await deleteFromImageKit(CLOUDINARY_URL);

    // Assert
    expect(deleted).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('throws when the edge function reports a failure', async () => {
    // Arrange
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Forbidden' } });

    // Act / Assert
    await expect(deleteFromImageKit(IK_URL)).rejects.toThrow(/Forbidden/);
  });
});

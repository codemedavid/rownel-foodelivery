import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  deleteImageFromStorage,
  importImageFromUrl,
  requestDownloadUrl,
  uploadImageToStorage,
} from './storageClient';

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-123' } } })),
}));

vi.mock('./supabase', () => ({ supabase: { auth: { getSession } } }));

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: RecordedCall[] = [];
/** Queue of responses, consumed in order; `fetch` throws when it runs dry. */
let responses: Array<Response | Error> = [];

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const pngFile = (size = 1024, type = 'image/png'): File => {
  const file = new File([new Uint8Array(1)], 'photo.png', { type });
  // `File` derives size from its parts; tests need a declared size without the bytes.
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

beforeEach(() => {
  calls = [];
  responses = [];
  // Deleting a public image means recognising our own origin in the stored URL.
  vi.stubEnv('VITE_R2_PUBLIC_URL', 'https://images.row-nel.com');
  getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-123' } } });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body,
    });
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    if (next instanceof Error) throw next;
    return next;
  });
});

describe('uploadImageToStorage', () => {
  it('asks the API for a grant, then PUTs the file to the signed URL', async () => {
    responses = [
      jsonResponse({
        uploadUrl: 'https://acct.r2.cloudflarestorage.com/bucket/menu-items/m1/a.png?X-Amz-Signature=x',
        objectKey: 'menu-items/m1/a.png',
        mimeType: 'image/png',
        publicUrl: 'https://images.row-nel.com/menu-items/m1/a.png',
        expiresAt: 1_000,
      }),
      new Response(null, { status: 200 }),
    ];

    const result = await uploadImageToStorage(pngFile(2048), {
      category: 'menu-item',
      context: { merchantId: 'm1' },
    });

    expect(result).toEqual({
      objectKey: 'menu-items/m1/a.png',
      publicUrl: 'https://images.row-nel.com/menu-items/m1/a.png',
    });

    const [grantCall, putCall] = calls;
    expect(grantCall.url).toBe('/api/storage');
    expect(grantCall.method).toBe('POST');
    expect(grantCall.headers.authorization).toBe('Bearer jwt-123');
    expect(JSON.parse(grantCall.body as string)).toEqual({
      action: 'create-upload',
      category: 'menu-item',
      mimeType: 'image/png',
      size: 2048,
      context: { merchantId: 'm1' },
    });

    expect(putCall.method).toBe('PUT');
    expect(putCall.url).toContain('r2.cloudflarestorage.com');
  });

  it('sends the Content-Type the grant signed, not the one the file declares', async () => {
    responses = [
      jsonResponse({
        uploadUrl: 'https://acct.r2.cloudflarestorage.com/bucket/promotions/a.jpg?sig=x',
        objectKey: 'promotions/a.jpg',
        // The handler lowercases before signing; R2 compares byte-for-byte.
        mimeType: 'image/jpeg',
        publicUrl: 'https://images.row-nel.com/promotions/a.jpg',
        expiresAt: 1_000,
      }),
      new Response(null, { status: 200 }),
    ];

    await uploadImageToStorage(pngFile(64, 'image/JPEG'), { category: 'promotion' });

    expect(calls[1].headers['content-type']).toBe('image/jpeg');
  });

  it('never sends the Supabase token to R2', async () => {
    responses = [
      jsonResponse({
        uploadUrl: 'https://acct.r2.cloudflarestorage.com/bucket/promotions/a.png?sig=x',
        objectKey: 'promotions/a.png',
        mimeType: 'image/png',
        publicUrl: 'https://images.row-nel.com/promotions/a.png',
        expiresAt: 1_000,
      }),
      new Response(null, { status: 200 }),
    ];

    await uploadImageToStorage(pngFile(), { category: 'promotion' });

    expect(calls[1].headers.authorization).toBeUndefined();
  });

  it('rejects a file the API would refuse, without any request', async () => {
    await expect(
      uploadImageToStorage(pngFile(11 * 1024 * 1024), { category: 'promotion' }),
    ).rejects.toThrow('Image size must be less than 10MB');
    expect(calls).toHaveLength(0);
  });

  it('reports the API error message rather than a bare status', async () => {
    responses = [jsonResponse({ error: 'Forbidden' }, 403)];

    await expect(
      uploadImageToStorage(pngFile(), { category: 'menu-item', context: { merchantId: 'm1' } }),
    ).rejects.toThrow('Could not authorize the upload: Forbidden');
  });

  it('reports a rejected PUT without leaking the signed URL', async () => {
    responses = [
      jsonResponse({
        uploadUrl: 'https://acct.r2.cloudflarestorage.com/bucket/promotions/a.png?X-Amz-Signature=secret',
        objectKey: 'promotions/a.png',
        mimeType: 'image/png',
        publicUrl: 'https://images.row-nel.com/promotions/a.png',
        expiresAt: 1_000,
      }),
      new Response('<Error><Code>SignatureDoesNotMatch</Code></Error>', { status: 403 }),
    ];

    const rejection = await uploadImageToStorage(pngFile(), { category: 'promotion' }).catch(
      (error: Error) => error,
    );

    expect((rejection as Error).message).toBe(
      'Could not upload the image: storage rejected it with status 403',
    );
    expect((rejection as Error).message).not.toContain('X-Amz-Signature');
  });

  it('refuses to upload when nobody is signed in', async () => {
    getSession.mockResolvedValue({ data: { session: null } } as never);

    await expect(uploadImageToStorage(pngFile(), { category: 'promotion' })).rejects.toThrow(
      'You must be signed in to manage images',
    );
    expect(calls).toHaveLength(0);
  });

  it('fails when a public upload comes back without a public URL', async () => {
    responses = [
      jsonResponse({
        uploadUrl: 'https://acct.r2.cloudflarestorage.com/bucket/promotions/a.png?sig=x',
        objectKey: 'promotions/a.png',
        mimeType: 'image/png',
        expiresAt: 1_000,
      }),
    ];

    await expect(uploadImageToStorage(pngFile(), { category: 'promotion' })).rejects.toThrow(
      'Could not authorize the upload: incomplete response',
    );
  });

  it('keeps a private upload, which has no public URL', async () => {
    responses = [
      jsonResponse({
        uploadUrl: 'https://acct.r2.cloudflarestorage.com/private/receipts/u1/o1/a.png?sig=x',
        objectKey: 'receipts/u1/o1/a.png',
        mimeType: 'image/png',
        expiresAt: 1_000,
      }),
      new Response(null, { status: 200 }),
    ];

    const result = await uploadImageToStorage(pngFile(), {
      category: 'receipt',
      context: { orderId: 'o1' },
    });

    expect(result).toEqual({ objectKey: 'receipts/u1/o1/a.png', publicUrl: undefined });
  });
});

describe('deleteImageFromStorage', () => {
  it('posts the reference and reports what the API deleted', async () => {
    responses = [jsonResponse({ ok: true, deleted: true })];

    const deleted = await deleteImageFromStorage(
      'https://images.row-nel.com/menu-items/m1/a.png',
      { category: 'menu-item', context: { merchantId: 'm1' } },
    );

    expect(deleted).toBe(true);
    expect(JSON.parse(calls[0].body as string)).toEqual({
      action: 'delete',
      category: 'menu-item',
      reference: 'https://images.row-nel.com/menu-items/m1/a.png',
      context: { merchantId: 'm1' },
    });
  });

  it('leaves a source that is not ours alone, without a request', async () => {
    const deleted = await deleteImageFromStorage('https://ik.imagekit.io/x/legacy.png', {
      category: 'menu-item',
      context: { merchantId: 'm1' },
    });

    expect(deleted).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('importImageFromUrl', () => {
  it('returns the stored object for an accepted source', async () => {
    responses = [
      jsonResponse({
        objectKey: 'promotions/a.png',
        publicUrl: 'https://images.row-nel.com/promotions/a.png',
      }),
    ];

    const result = await importImageFromUrl('https://example.com/a.png', {
      category: 'promotion',
    });

    expect(result).toEqual({
      objectKey: 'promotions/a.png',
      publicUrl: 'https://images.row-nel.com/promotions/a.png',
    });
  });

  it('surfaces the reason the source was refused', async () => {
    responses = [jsonResponse({ error: 'Remote image import timed out' }, 400)];

    await expect(
      importImageFromUrl('https://slow.example.com/a.png', { category: 'promotion' }),
    ).rejects.toThrow('Could not import the image: Remote image import timed out');
  });
});

describe('requestDownloadUrl', () => {
  it('returns the short-lived signed URL for a private object', async () => {
    responses = [
      jsonResponse({ downloadUrl: 'https://acct.r2.cloudflarestorage.com/p/a.png?sig=x', expiresAt: 42 }),
    ];

    const result = await requestDownloadUrl({ category: 'receipt', context: { orderId: 'o1' } });

    expect(result).toEqual({
      downloadUrl: 'https://acct.r2.cloudflarestorage.com/p/a.png?sig=x',
      expiresAt: 42,
    });
    expect(JSON.parse(calls[0].body as string)).toEqual({
      action: 'create-download',
      category: 'receipt',
      context: { orderId: 'o1' },
    });
  });
});

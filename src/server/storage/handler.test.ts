import { describe, expect, it, vi } from 'vitest';
import { MAX_IMAGE_BYTES } from '../../lib/storageTypes';
import type { StorageRepository } from './authorization';
import { createStorageHandler, type StorageHandlerDependencies } from './handler';

const actor = { id: 'admin-1', role: 'admin' as const };

function makeRepository(): StorageRepository {
  return {
    getStaff: vi.fn().mockResolvedValue(null),
    getOrder: vi.fn().mockResolvedValue(null),
    getRider: vi.fn().mockResolvedValue(null),
  };
}

function makeDependencies(
  overrides: Partial<StorageHandlerDependencies> = {},
): StorageHandlerDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue(actor),
    repository: makeRepository(),
    authorize: vi.fn().mockResolvedValue({ allowed: true }),
    r2: {
      createObjectKey: vi.fn().mockReturnValue('menu-items/generated.jpg'),
      publicUrl: vi.fn().mockReturnValue(
        'https://images.row-nel.com/menu-items/generated.jpg',
      ),
      signPut: vi.fn().mockResolvedValue('https://signed.example/put'),
      signGet: vi.fn().mockResolvedValue('https://signed.example/get'),
      deleteObject: vi.fn().mockResolvedValue(true),
    },
    config: {
      publicBucket: 'rownel-public-images',
      privateBucket: 'rownel-private-images',
      publicUrl: 'https://images.row-nel.com',
    },
    clock: () => 1_000_000,
    ...overrides,
  };
}

function request(body: unknown, authorization = 'Bearer valid'): Request {
  return new Request('https://app.test/api/storage', {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('createStorageHandler', () => {
  it('returns a scoped public PUT grant without exposing credentials', async () => {
    const deps = makeDependencies();
    const response = await createStorageHandler(deps)(
      request({
        action: 'create-upload',
        category: 'menu-item',
        mimeType: 'image/jpeg',
        size: 1_024,
        context: { merchantId: 'merchant-1' },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const payload = await response.json();
    expect(payload).toEqual({
      uploadUrl: 'https://signed.example/put',
      objectKey: 'menu-items/generated.jpg',
      publicUrl: 'https://images.row-nel.com/menu-items/generated.jpg',
      expiresAt: 1_300_000,
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /secret|access-key|account-id|rownel-(?:public|private)-images/i,
    );
    expect(deps.r2.createObjectKey).toHaveBeenCalledWith(
      'menu-item',
      'image/jpeg',
      { merchantId: 'merchant-1' },
    );
    expect(deps.r2.signPut).toHaveBeenCalledWith(
      'rownel-public-images',
      'menu-items/generated.jpg',
      'image/jpeg',
      300,
    );
  });

  it('allows only POST requests', async () => {
    const response = await createStorageHandler(makeDependencies())(
      new Request('https://app.test/api/storage', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: 'Method not allowed' });
  });

  it.each([undefined, '', 'Basic token', 'Bearer', 'Bearer   ', 'Bearer token extra'])(
    'returns 401 for a missing or malformed bearer value: %s',
    async (authorization) => {
      const deps = makeDependencies();
      const headers = new Headers({ 'content-type': 'application/json' });
      if (authorization !== undefined) headers.set('authorization', authorization);
      const response = await createStorageHandler(deps)(
        new Request('https://app.test/api/storage', {
          method: 'POST',
          headers,
          body: '{}',
        }),
      );

      expect(response.status).toBe(401);
      expect(deps.authenticate).not.toHaveBeenCalled();
    },
  );

  it('returns 401 when the bearer token is not an authenticated session', async () => {
    const deps = makeDependencies({ authenticate: vi.fn().mockResolvedValue(null) });
    const response = await createStorageHandler(deps)(request({}));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 for invalid JSON after authenticating the caller', async () => {
    const deps = makeDependencies();
    const response = await createStorageHandler(deps)(
      new Request('https://app.test/api/storage', {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid',
          'content-type': 'application/json',
        },
        body: '{',
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid request' });
    expect(deps.authenticate).toHaveBeenCalledWith('valid');
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    {},
    { action: 'unknown', category: 'menu-item', context: {} },
    {
      action: 'create-upload',
      category: 'unknown',
      mimeType: 'image/jpeg',
      size: 1,
      context: {},
    },
    {
      action: 'create-upload',
      category: 'menu-item',
      mimeType: 'image/svg+xml',
      size: 1,
      context: { merchantId: 'merchant-1' },
    },
    ...[0, -1, 1.5, MAX_IMAGE_BYTES + 1, '100', null].map((size) => ({
      action: 'create-upload',
      category: 'menu-item',
      mimeType: 'image/jpeg',
      size,
      context: { merchantId: 'merchant-1' },
    })),
    {
      action: 'create-upload',
      category: 'receipt',
      mimeType: 'image/jpeg',
      size: 1,
      context: {},
    },
    {
      action: 'create-download',
      category: 'menu-item',
      context: { merchantId: 'merchant-1' },
    },
    { action: 'create-download', category: 'rider-photo', context: {} },
    { action: 'delete', category: 'rider-photo', context: null, reference: 'x' },
    {
      action: 'delete',
      category: 'menu-item',
      context: { merchantId: '' },
      reference: 'https://images.row-nel.com/menu-items/a.jpg',
    },
    {
      action: 'delete',
      category: 'menu-item',
      context: { merchantId: 'bad/id' },
      reference: 'https://images.row-nel.com/menu-items/a.jpg',
    },
  ])('returns 400 for malformed storage input %#', async (body) => {
    const deps = makeDependencies();
    const response = await createStorageHandler(deps)(request(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid request' });
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(deps.r2.signPut).not.toHaveBeenCalled();
  });

  it('normalizes uppercase upload MIME before key creation and signing', async () => {
    const createObjectKey = vi.fn().mockReturnValue('menu-items/generated.jpg');
    const signPut = vi.fn().mockResolvedValue('https://signed.example/put');
    const deps = makeDependencies({
      r2: { ...makeDependencies().r2, createObjectKey, signPut },
    });
    const response = await createStorageHandler(deps)(
      request({
        action: 'create-upload',
        category: 'menu-item',
        mimeType: 'IMAGE/JPEG',
        size: 1,
        context: { merchantId: 'merchant-1' },
      }),
    );

    expect(response.status).toBe(200);
    expect(createObjectKey).toHaveBeenCalledWith(
      'menu-item',
      'image/jpeg',
      { merchantId: 'merchant-1' },
    );
    expect(signPut).toHaveBeenCalledWith(
      'rownel-public-images',
      'menu-items/generated.jpg',
      'image/jpeg',
      300,
    );
  });

  it('returns a private grant with the server actor as receipt key owner', async () => {
    const createObjectKey = vi.fn().mockReturnValue('receipts/customer-1/generated.png');
    const signPut = vi.fn().mockResolvedValue('https://signed.example/private-put');
    const deps = makeDependencies({
      authenticate: vi.fn().mockResolvedValue({ id: 'customer-1', role: 'customer' }),
      r2: { ...makeDependencies().r2, createObjectKey, signPut },
    });

    const response = await createStorageHandler(deps)(
      request({
        action: 'create-upload',
        category: 'receipt',
        mimeType: 'image/png',
        size: 42,
        context: { orderId: 'order-1' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uploadUrl: 'https://signed.example/private-put',
      objectKey: 'receipts/customer-1/generated.png',
      expiresAt: 1_300_000,
    });
    expect(createObjectKey).toHaveBeenCalledWith('receipt', 'image/png', {
      orderId: 'order-1',
      ownerId: 'customer-1',
    });
    expect(signPut).toHaveBeenCalledWith(
      'rownel-private-images',
      'receipts/customer-1/generated.png',
      'image/png',
      300,
    );
  });

  it('uses the authorized rider context when generating a rider-photo key', async () => {
    const createObjectKey = vi
      .fn()
      .mockReturnValue('rider-photos/rider-1/generated.webp');
    const deps = makeDependencies({
      authenticate: vi.fn().mockResolvedValue({ id: 'rider-1', role: 'rider' }),
      r2: { ...makeDependencies().r2, createObjectKey },
    });

    const response = await createStorageHandler(deps)(
      request({
        action: 'create-upload',
        category: 'rider-photo',
        mimeType: 'image/webp',
        size: 100,
        context: { riderId: 'rider-1' },
      }),
    );

    expect(response.status).toBe(200);
    expect(createObjectKey).toHaveBeenCalledWith('rider-photo', 'image/webp', {
      riderId: 'rider-1',
    });
  });

  it('returns 403 without invoking storage when resource authorization is denied', async () => {
    const deps = makeDependencies({
      authorize: vi.fn().mockResolvedValue({ allowed: false }),
    });
    const response = await createStorageHandler(deps)(
      request({
        action: 'create-upload',
        category: 'site-logo',
        mimeType: 'image/jpeg',
        size: 100,
        context: {},
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(deps.r2.createObjectKey).not.toHaveBeenCalled();
    expect(deps.r2.signPut).not.toHaveBeenCalled();
    expect(deps.r2.deleteObject).not.toHaveBeenCalled();
  });

  it('downloads only the private object key returned by authorization', async () => {
    const authorize = vi.fn().mockResolvedValue({
      allowed: true,
      objectKey: 'rider-photos/rider-1/trusted.webp',
    });
    const signGet = vi.fn().mockResolvedValue('https://signed.example/private-get');
    const deps = makeDependencies({
      authorize,
      r2: { ...makeDependencies().r2, signGet },
    });

    const response = await createStorageHandler(deps)(
      request({
        action: 'create-download',
        category: 'rider-photo',
        context: {
          riderId: 'rider-1',
          objectKey: 'rider-photos/rider-1/attacker.webp',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      downloadUrl: 'https://signed.example/private-get',
      expiresAt: 1_300_000,
    });
    expect(signGet).toHaveBeenCalledWith(
      'rownel-private-images',
      'rider-photos/rider-1/trusted.webp',
      300,
    );
  });

  it('returns the same generic 403 when an authorized private lookup has no key', async () => {
    const deps = makeDependencies({
      authorize: vi.fn().mockResolvedValue({ allowed: true }),
    });
    const response = await createStorageHandler(deps)(
      request({
        action: 'create-download',
        category: 'receipt',
        context: { orderId: 'order-1' },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(deps.r2.signGet).not.toHaveBeenCalled();
  });

  it('deletes an exact-origin public key and ignores its query and fragment', async () => {
    const deleteObject = vi.fn().mockResolvedValue(false);
    const deps = makeDependencies({
      r2: { ...makeDependencies().r2, deleteObject },
    });
    const response = await createStorageHandler(deps)(
      request({
        action: 'delete',
        category: 'menu-item',
        context: { merchantId: 'merchant-1' },
        reference:
          'https://images.row-nel.com/menu-items/generated.jpg?width=100#display',
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, deleted: false });
    expect(deleteObject).toHaveBeenCalledWith(
      'rownel-public-images',
      'menu-items/generated.jpg',
    );
  });

  it('decodes a legitimate encoded filename while ignoring query and fragment', async () => {
    const deleteObject = vi.fn().mockResolvedValue(true);
    const deps = makeDependencies({
      r2: { ...makeDependencies().r2, deleteObject },
    });
    const response = await createStorageHandler(deps)(
      request({
        action: 'delete',
        category: 'menu-item',
        context: { merchantId: 'merchant-1' },
        reference: 'https://images.row-nel.com/menu-items/a%2Db.jpg?width=100#display',
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith(
      'rownel-public-images',
      'menu-items/a-b.jpg',
    );
  });

  it('accepts a conventional absolute URL with a mixed-case HTTPS scheme', async () => {
    const deleteObject = vi.fn().mockResolvedValue(true);
    const deps = makeDependencies({
      r2: { ...makeDependencies().r2, deleteObject },
    });
    const response = await createStorageHandler(deps)(
      request({
        action: 'delete',
        category: 'menu-item',
        context: { merchantId: 'merchant-1' },
        reference: 'HtTpS://images.row-nel.com/menu-items/a.jpg',
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith(
      'rownel-public-images',
      'menu-items/a.jpg',
    );
  });

  it.each([
    'https://images.row-nel.com.evil.test/menu-items/a.jpg',
    'https://evil.test/menu-items/a.jpg',
    'https://user:password@images.row-nel.com/menu-items/a.jpg',
    'ftp://images.row-nel.com/menu-items/a.jpg',
    '/menu-items/a.jpg',
    'https://images.row-nel.com/promotions/a.jpg',
    'https://images.row-nel.com/cdn-cgi/image/width=100/menu-items/a.jpg',
    'https:images.row-nel.com/promotions/../menu-items/a.jpg',
    'https:/images.row-nel.com/promotions/%2e%2e/menu-items/a.jpg',
    'https://images.row-nel.com/promotions/..\t/menu-items/a.jpg',
    'https://images.row-nel.com/promotions/..\n/menu-items/a.jpg',
    'https://images.row-nel.com/promotions/..\r/menu-items/a.jpg',
    'https://images.row-nel.com/menu-items/a\u0000.jpg',
    'https://images.row-nel.com/menu-items/a\u001F.jpg',
    'https://images.row-nel.com/menu-items/a\u007F.jpg',
    'https://images.row-nel.com/promotions/../menu-items/a.jpg',
    'https://images.row-nel.com/promotions/%2e%2e/menu-items/a.jpg',
    'https://images.row-nel.com/menu-items/%2e/a.jpg',
    'https://images.row-nel.com/menu-items/%2e%2e/promotions/a.jpg',
    'https://images.row-nel.com/menu-items/a%2fb.jpg',
    'https://images.row-nel.com/menu-items/a%5cb.jpg',
    'https://images.row-nel.com/menu-items\\a.jpg',
    'https://images.row-nel.com/menu-items//a.jpg',
    'https://images.row-nel.com/menu-items/a.svg',
  ])('rejects an unsafe public deletion reference: %s', async (reference) => {
    const deps = makeDependencies();
    const response = await createStorageHandler(deps)(
      request({
        action: 'delete',
        category: 'menu-item',
        context: { merchantId: 'merchant-1' },
        reference,
      }),
    );

    expect(response.status).toBe(400);
    expect(deps.authorize).toHaveBeenCalledOnce();
    expect(deps.r2.deleteObject).not.toHaveBeenCalled();
  });

  it('authorizes deletion context before examining an attacker-controlled reference', async () => {
    const deps = makeDependencies({
      authorize: vi.fn().mockResolvedValue({ allowed: false }),
    });
    const response = await createStorageHandler(deps)(
      request({
        action: 'delete',
        category: 'menu-item',
        context: { merchantId: 'merchant-1' },
        reference: 'not-even-a-url',
      }),
    );

    expect(response.status).toBe(403);
    expect(deps.r2.deleteObject).not.toHaveBeenCalled();
  });

  it('authorizes deletion context before validating even the reference primitive', async () => {
    const authorize = vi.fn().mockResolvedValue({ allowed: false });
    const deps = makeDependencies({ authorize });
    const response = await createStorageHandler(deps)(
      request({
        action: 'delete',
        category: 'site-logo',
        context: {},
        reference: 12,
      }),
    );

    expect(response.status).toBe(403);
    expect(authorize).toHaveBeenCalledOnce();
  });

  it.each([12, '', null])(
    'returns 400 for a malformed deletion reference after authorization: %s',
    async (reference) => {
      const deps = makeDependencies();
      const response = await createStorageHandler(deps)(
        request({ action: 'delete', category: 'site-logo', context: {}, reference }),
      );

      expect(response.status).toBe(400);
      expect(deps.authorize).toHaveBeenCalledOnce();
      expect(deps.r2.deleteObject).not.toHaveBeenCalled();
    },
  );

  it('lets a customer delete only an owned receipt key after real authorization', async () => {
    const deleteObject = vi.fn().mockResolvedValue(true);
    const deps = makeDependencies({
      authenticate: vi.fn().mockResolvedValue({ id: 'customer-1', role: 'customer' }),
      repository: makeRepository(),
      authorize: undefined,
      r2: { ...makeDependencies().r2, deleteObject },
    });
    vi.mocked(deps.repository.getOrder).mockResolvedValue({
      id: 'order-1',
      merchantId: 'merchant-1',
      customerUserId: 'customer-1',
      assignedRiderId: null,
      receiptObjectKey: 'receipts/customer-1/stored.jpg',
    });

    const response = await createStorageHandler(deps)(
      request({
        action: 'delete',
        category: 'receipt',
        context: { orderId: 'order-1' },
        reference: 'receipts/customer-1/old.jpg',
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, deleted: true });
    expect(deleteObject).toHaveBeenCalledWith(
      'rownel-private-images',
      'receipts/customer-1/old.jpg',
    );
  });

  it.each([
    {
      role: 'admin' as const,
      id: 'admin-1',
      reference: 'receipts/customer-2/old.jpg',
    },
    {
      role: 'staff' as const,
      id: 'staff-1',
      reference: 'receipts/customer-2/old.jpg',
    },
  ])('lets authorized $role delete any structurally valid receipt key', async (entry) => {
    const repository = makeRepository();
    vi.mocked(repository.getOrder).mockResolvedValue({
      id: 'order-1',
      merchantId: 'merchant-1',
      customerUserId: 'customer-2',
      assignedRiderId: null,
      receiptObjectKey: entry.reference,
    });
    vi.mocked(repository.getStaff).mockResolvedValue({
      active: true,
      allMerchants: false,
      merchantIds: ['merchant-1'],
    });
    const deps = makeDependencies({
      authenticate: vi.fn().mockResolvedValue({ id: entry.id, role: entry.role }),
      repository,
      authorize: undefined,
    });

    const response = await createStorageHandler(deps)(
      request({
        action: 'delete',
        category: 'receipt',
        context: { orderId: 'order-1' },
        reference: entry.reference,
      }),
    );

    expect(response.status).toBe(200);
    expect(deps.r2.deleteObject).toHaveBeenCalledWith(
      'rownel-private-images',
      entry.reference,
    );
  });

  it('lets a rider delete their own photo but denies another rider via authorization', async () => {
    const deps = makeDependencies({
      authenticate: vi.fn().mockResolvedValue({ id: 'rider-1', role: 'rider' }),
      authorize: undefined,
    });
    const ownResponse = await createStorageHandler(deps)(
      request({
        action: 'delete',
        category: 'rider-photo',
        context: { riderId: 'rider-1' },
        reference: 'rider-photos/rider-1/old.webp',
      }),
    );
    const otherResponse = await createStorageHandler(deps)(
      request({
        action: 'delete',
        category: 'rider-photo',
        context: { riderId: 'rider-2' },
        reference: 'rider-photos/rider-2/old.webp',
      }),
    );

    expect(ownResponse.status).toBe(200);
    expect(otherResponse.status).toBe(403);
    expect(deps.r2.deleteObject).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['customer', 'customer-1', 'receipt', 'receipts/customer-2/a.jpg'],
    ['admin', 'admin-1', 'receipt', 'https://images.row-nel.com/receipts/a/b.jpg'],
    ['admin', 'admin-1', 'receipt', 'rider-photos/rider-1/a.jpg'],
    ['admin', 'admin-1', 'receipt', 'receipts/customer-1/../a.jpg'],
    ['admin', 'admin-1', 'receipt', 'receipts/customer-1//a.jpg'],
    ['admin', 'admin-1', 'receipt', 'receipts/customer-1/a\\b.jpg'],
    ['admin', 'admin-1', 'receipt', 'receipts/customer-1/a%2fb.jpg'],
    ['admin', 'admin-1', 'receipt', 'receipts/cdn-cgi/image/a.jpg'],
    ['admin', 'admin-1', 'receipt', 'receipts/customer-1/a.svg'],
    ['rider', 'rider-1', 'rider-photo', 'rider-photos/rider-2/a.jpg'],
  ] as const)(
    'rejects an unsafe private deletion reference for %s: %s',
    async (role, id, category, reference) => {
      const deps = makeDependencies({
        authenticate: vi.fn().mockResolvedValue({ id, role }),
      });
      const response = await createStorageHandler(deps)(
        request({
          action: 'delete',
          category,
          context:
            category === 'receipt' ? { orderId: 'order-1' } : { riderId: 'rider-1' },
          reference,
        }),
      );

      expect(response.status).toBe(400);
      expect(deps.r2.deleteObject).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      boundary: 'authentication',
      overrides: {
        authenticate: vi.fn().mockRejectedValue(new Error('SENSITIVE_FAILURE')),
      },
      body: {
        action: 'create-upload',
        category: 'site-logo',
        mimeType: 'image/jpeg',
        size: 1,
        context: {},
      },
    },
    {
      boundary: 'authorization repository',
      overrides: {
        authorize: vi.fn().mockRejectedValue(new Error('SENSITIVE_FAILURE')),
      },
      body: {
        action: 'create-upload',
        category: 'site-logo',
        mimeType: 'image/jpeg',
        size: 1,
        context: {},
      },
    },
    {
      boundary: 'key creation',
      r2Method: 'createObjectKey' as const,
      body: {
        action: 'create-upload',
        category: 'site-logo',
        mimeType: 'image/jpeg',
        size: 1,
        context: {},
      },
    },
    {
      boundary: 'PUT signing',
      r2Method: 'signPut' as const,
      body: {
        action: 'create-upload',
        category: 'site-logo',
        mimeType: 'image/jpeg',
        size: 1,
        context: {},
      },
    },
    {
      boundary: 'GET signing',
      r2Method: 'signGet' as const,
      overrides: {
        authorize: vi.fn().mockResolvedValue({
          allowed: true,
          objectKey: 'receipts/customer-1/a.jpg',
        }),
      },
      body: {
        action: 'create-download',
        category: 'receipt',
        context: { orderId: 'order-1' },
      },
    },
    {
      boundary: 'deletion',
      r2Method: 'deleteObject' as const,
      body: {
        action: 'delete',
        category: 'site-logo',
        context: {},
        reference: 'https://images.row-nel.com/site/logo/a.jpg',
      },
    },
  ])('returns a sanitized 500 when $boundary fails', async ({ overrides, r2Method, body }) => {
    const sensitive =
      'sample-secret access-id account-id rownel-public-images rownel-private-images ' +
      'https://signed.example/file?X-Amz-Signature=sample-secret';
    const deps = makeDependencies(overrides);
    if (r2Method) {
      if (r2Method === 'createObjectKey') {
        vi.mocked(deps.r2.createObjectKey).mockImplementation(() => {
          throw new Error(`${sensitive} SENSITIVE_FAILURE`);
        });
      } else {
        vi.mocked(deps.r2[r2Method]).mockRejectedValue(
          new Error(`${sensitive} SENSITIVE_FAILURE`),
        );
      }
    }
    if (overrides?.authenticate) {
      vi.mocked(deps.authenticate).mockRejectedValue(new Error(sensitive));
    }
    if (overrides?.authorize) {
      vi.mocked(deps.authorize!).mockRejectedValue(new Error(sensitive));
    }

    const response = await createStorageHandler(deps)(request(body));

    expect(response.status).toBe(500);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toBe('{"error":"Storage operation failed"}');
    expect(serialized).not.toMatch(
      /sample-secret|access-id|account-id|rownel-public-images|rownel-private-images|X-Amz|signed\.example/i,
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createR2Store } from './r2';

const config = {
  accountId: 'account',
  accessKeyId: 'access',
  secretAccessKey: 'secret',
  publicBucket: 'rownel-public-images',
  privateBucket: 'rownel-private-images',
  publicUrl: 'https://images.row-nel.com/',
};

const response = (status: number) => new Response(null, { status });

const rejectedMessage = async (operation: () => Promise<unknown>): Promise<string> => {
  try {
    await operation();
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

describe('R2 key generation and signing', () => {
  it('generates a merchant-scoped menu-item key', () => {
    const store = createR2Store(config);

    expect(
      store.createObjectKey(
        'menu-item',
        'image/jpeg',
        { merchantId: 'merchant-1' },
        '00000000-0000-4000-8000-000000000000',
      ),
    ).toBe('menu-items/merchant-1/00000000-0000-4000-8000-000000000000.jpg');
  });

  it('scopes merchant public keys and keeps global public keys distinct', () => {
    const store = createR2Store(config);
    const id = '00000000-0000-4000-8000-000000000000';

    expect(store.createObjectKey('merchant-logo', 'image/png', { merchantId: 'm-1' }, id))
      .toBe(`merchants/logos/m-1/${id}.png`);
    expect(store.createObjectKey('merchant-cover', 'image/webp', { merchantId: 'm-1' }, id))
      .toBe(`merchants/covers/m-1/${id}.webp`);
    expect(store.createObjectKey('payment-qr', 'image/png', { merchantId: 'm-1' }, id))
      .toBe(`payment-methods/m-1/${id}.png`);
    expect(store.createObjectKey('payment-qr', 'image/png', {}, id))
      .toBe(`payment-methods/global/${id}.png`);
    expect(store.createObjectKey('site-logo', 'image/png', {}, id))
      .toBe(`site/logo/${id}.png`);
    expect(store.createObjectKey('promotion', 'image/png', {}, id))
      .toBe(`promotions/${id}.png`);
  });

  it('generates private receipt and rider-photo keys with required owners', () => {
    const store = createR2Store(config);
    const ownerId = '11111111-1111-4111-8111-111111111111';
    const riderId = '22222222-2222-4222-8222-222222222222';
    const id = '33333333-3333-4333-8333-333333333333';

    expect(store.createObjectKey('receipt', 'image/png', { ownerId, orderId: 'order-1' }, id)).toBe(
      `receipts/${ownerId}/order-1/${id}.png`,
    );
    expect(store.createObjectKey('rider-photo', 'image/webp', { riderId }, id)).toBe(
      `rider-photos/${riderId}/${id}.webp`,
    );
    expect(() => store.createObjectKey('receipt', 'image/png', {}, id)).toThrow(
      /ownerId/i,
    );
    expect(() =>
      store.createObjectKey('receipt', 'image/png', { ownerId }, id),
    ).toThrow(/orderId/i);
    expect(() => store.createObjectKey('rider-photo', 'image/webp', {}, id)).toThrow(
      /riderId/i,
    );
  });

  it('rejects unsupported MIME types and unsafe path segments', () => {
    const store = createR2Store(config);

    expect(() => store.createObjectKey('menu-item', 'image/svg+xml', {})).toThrow(
      /MIME/i,
    );
    expect(() =>
      store.createObjectKey('receipt', 'image/jpeg', {
        ownerId: '../escape',
        orderId: 'order-1',
      }),
    ).toThrow(/ownerId/i);
    expect(() =>
      store.createObjectKey('receipt', 'image/jpeg', {
        ownerId: 'owner-1',
        orderId: '../escape',
      }),
    ).toThrow(/orderId/i);
    expect(() =>
      store.createObjectKey('rider-photo', 'image/jpeg', { riderId: 'rider/id' }),
    ).toThrow(/riderId/i);
    expect(() =>
      store.createObjectKey(
        'menu-item',
        'image/jpeg',
        { merchantId: 'merchant-1' },
        '../escape',
      ),
    ).toThrow(/id/i);
    for (const category of ['menu-item', 'merchant-logo', 'merchant-cover'] as const) {
      expect(() => store.createObjectKey(category, 'image/jpeg', {})).toThrow(
        /merchantId/i,
      );
      expect(() =>
        store.createObjectKey(category, 'image/jpeg', { merchantId: '../escape' }),
      ).toThrow(/merchantId/i);
    }
    expect(() =>
      store.createObjectKey('payment-qr', 'image/jpeg', { merchantId: '../escape' }),
    ).toThrow(/merchantId/i);
  });

  it('builds an exact encoded public URL without a trailing slash', () => {
    const store = createR2Store(config);

    expect(store.publicUrl('merchants/logos/m-1/a menu.jpg')).toBe(
      'https://images.row-nel.com/merchants/logos/m-1/a%20menu.jpg',
    );
  });

  it('creates a PUT query signature with content-type and expiry', async () => {
    const store = createR2Store(config);

    const signed = await store.signPut(
      config.publicBucket,
      'menu-items/m-1/a.jpg',
      'image/jpeg',
      300,
    );

    expect(signed).toContain('X-Amz-Expires=300');
    expect(signed).toContain('X-Amz-SignedHeaders=content-type%3Bhost');
    expect(signed).not.toContain(config.secretAccessKey);
  });

  it('signs GET with the GET method and query expiry', async () => {
    const sign = vi.fn(async (input: Request | string, init?: RequestInit) => {
      expect(new Request(input, init).method).toBe('GET');
      return new Request('https://signed.example/get?X-Amz-Expires=300');
    });
    const store = createR2Store(config, {
      signer: { sign },
      fetch: vi.fn(),
    });

    await expect(
      store.signGet(config.privateBucket, 'receipts/owner/order/file.png'),
    ).resolves.toContain('X-Amz-Expires=300');
    expect(sign).toHaveBeenCalledOnce();
  });

  it('sanitizes signer failures for GET URLs', async () => {
    const sensitiveMessage =
      'secret at https://account.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=secret';
    const sign = vi.fn().mockRejectedValue(new Error(sensitiveMessage));
    const store = createR2Store(config, { signer: { sign }, fetch: vi.fn() });

    const message = await rejectedMessage(() =>
      store.signGet(config.privateBucket, 'receipts/owner/order/file.png'),
    );

    expect(message).toBe('R2 GET signing failed');
    expect(message).not.toContain('secret');
    expect(message).not.toContain('https://');
    expect(message).not.toContain('X-Amz');
  });

  it('deletes successfully, treats 404 as absent, and sanitizes errors', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(204))
      .mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(500));
    const store = createR2Store(config, { fetch });

    await expect(store.deleteObject(config.publicBucket, 'menu-items/m-1/a.jpg')).resolves.toBe(
      true,
    );
    await expect(store.deleteObject(config.publicBucket, 'menu-items/m-1/missing.jpg')).resolves.toBe(
      false,
    );
    const message = await rejectedMessage(() =>
      store.deleteObject(config.publicBucket, 'menu-items/m-1/broken.jpg'),
    );
    expect(message).toMatch(/delete.*500/i);
    expect(message).not.toMatch(/secret|X-Amz|https?:\/\//i);
  });

  it('sanitizes network failures without exposing sensitive fetch text', async () => {
    const fetch = vi.fn().mockRejectedValue(
      new Error(
        'secret at https://account.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=secret',
      ),
    );
    const store = createR2Store(config, { fetch });

    const message = await rejectedMessage(() =>
      store.deleteObject(config.publicBucket, 'menu-items/m-1/network-error.jpg'),
    );

    expect(message).toBe('R2 delete operation failed (network error)');
    expect(message).not.toContain('secret');
    expect(message).not.toContain('https://');
    expect(message).not.toContain('X-Amz');
  });

  it('heads successfully, treats 404 as absent, and puts matching bytes and MIME', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(404));
    const store = createR2Store(config, { fetch });
    const bytes = new Uint8Array([1, 2, 3]);

    await expect(store.headObject(config.privateBucket, 'receipts/owner/order/file.png')).resolves.toBe(
      true,
    );
    await expect(store.headObject(config.privateBucket, 'receipts/owner/order/missing.png')).resolves.toBe(
      false,
    );

    fetch.mockResolvedValueOnce(response(200));
    await expect(
      store.putObject(config.privateBucket, 'receipts/owner/order/file.png', 'image/png', bytes),
    ).resolves.toBeUndefined();

    const request = fetch.mock.calls[2]?.[0] as Request;
    expect(request.method).toBe('PUT');
    expect(request.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes);
  });

  it('rejects unknown buckets before making a request', async () => {
    const fetch = vi.fn();
    const store = createR2Store(config, { fetch });

    await expect(store.signGet('other-bucket', 'key')).rejects.toThrow(/bucket/i);
    await expect(store.deleteObject('other-bucket', 'key')).rejects.toThrow(/bucket/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});

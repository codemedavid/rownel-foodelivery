import { describe, expect, it, vi } from 'vitest';
import { fetchRemoteImage } from './remoteImport';

describe('fetchRemoteImage', () => {
  it('rejects a non-HTTPS source before DNS or fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const resolvePublicAddresses = vi.fn().mockResolvedValue(['93.184.216.34']);

    await expect(
      fetchRemoteImage('http://example.com/image.jpg', {
        fetch: fetchImpl,
        resolvePublicAddresses,
      }),
    ).rejects.toThrow('HTTPS');

    expect(resolvePublicAddresses).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['credentials', 'https://user:secret@example.com/image.jpg'],
    ['a non-standard port', 'https://example.com:8443/image.jpg'],
    ['a malformed URL', 'not a url'],
  ])('rejects %s before DNS or fetch', async (_label, sourceUrl) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const resolvePublicAddresses = vi.fn().mockResolvedValue(['93.184.216.34']);

    await expect(
      fetchRemoteImage(sourceUrl, { fetch: fetchImpl, resolvePublicAddresses }),
    ).rejects.toThrow(/Remote image URL/);

    expect(resolvePublicAddresses).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    'https://127.0.0.1/image.jpg',
    'https://2130706433/image.jpg',
    'https://0x7f000001/image.jpg',
    'https://0177.0.0.1/image.jpg',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.1/image.jpg',
    'https://172.16.0.1/image.jpg',
    'https://192.168.0.1/image.jpg',
    'https://100.64.0.1/image.jpg',
    'https://0.0.0.0/image.jpg',
    'https://[::1]/image.jpg',
    'https://[::]/image.jpg',
    'https://[fc00::1]/image.jpg',
    'https://[fe80::1]/image.jpg',
    'https://[::ffff:10.0.0.1]/image.jpg',
    'https://192.0.2.1/image.jpg',
    'https://192.88.99.1/image.jpg',
    'https://198.18.0.1/image.jpg',
    'https://198.51.100.1/image.jpg',
    'https://203.0.113.1/image.jpg',
    'https://224.0.0.1/image.jpg',
    'https://240.0.0.1/image.jpg',
    'https://[2001:db8::1]/image.jpg',
    'https://[ff02::1]/image.jpg',
    'https://localhost/image.jpg',
    'https://service.local/image.jpg',
    'https://service.internal/image.jpg',
  ])('rejects a non-public literal or local hostname before fetch: %s', async (sourceUrl) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const resolvePublicAddresses = vi.fn().mockResolvedValue(['93.184.216.34']);

    await expect(
      fetchRemoteImage(sourceUrl, { fetch: fetchImpl, resolvePublicAddresses }),
    ).rejects.toThrow(/public/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [['93.184.216.34', '10.0.0.2'], 'a private DNS answer'],
    [[], 'an empty DNS answer'],
  ])('fails closed for %s', async (addresses) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const resolvePublicAddresses = vi.fn().mockResolvedValue(addresses);

    await expect(
      fetchRemoteImage('https://example.com/image.jpg', {
        fetch: fetchImpl,
        resolvePublicAddresses,
      }),
    ).rejects.toThrow(/public/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when DNS resolution errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const resolvePublicAddresses = vi.fn().mockRejectedValue(new Error('resolver details'));

    await expect(
      fetchRemoteImage('https://example.com/image.jpg', {
        fetch: fetchImpl,
        resolvePublicAddresses,
      }),
    ).rejects.toThrow('Remote image host could not be safely resolved');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches a public image and derives its MIME from the bytes', async () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    const resolvePublicAddresses = vi.fn().mockResolvedValue(['93.184.216.34']);

    await expect(
      fetchRemoteImage('https://EXAMPLE.com/image', {
        fetch: fetchImpl,
        resolvePublicAddresses,
      }),
    ).resolves.toEqual({
      bytes,
      mimeType: 'image/jpeg',
      finalUrl: 'https://example.com/image',
    });

    expect(resolvePublicAddresses).toHaveBeenCalledWith('example.com');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/image',
      expect.objectContaining({
        redirect: 'manual',
        credentials: 'omit',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    [Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    [new TextEncoder().encode('GIF87a'), 'image/gif'],
    [new TextEncoder().encode('GIF89a'), 'image/gif'],
    [
      Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      'image/webp',
    ],
  ])('accepts a valid byte signature as %s', async (bytes, mimeType) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes));

    const image = await fetchRemoteImage('https://example.com/image', {
      fetch: fetchImpl,
      resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
    });
    expect(image.mimeType).toBe(mimeType);
    expect(Array.from(image.bytes)).toEqual(Array.from(bytes));
  });

  it.each([
    [new TextEncoder().encode('<html>not an image</html>'), 'image/jpeg'],
    [Uint8Array.from([0x89, 0x50, 0x4e]), 'image/png'],
    [new TextEncoder().encode('RIFFfakefake'), 'image/webp'],
  ])('rejects fake or too-short bytes despite a %s header', async (bytes, contentType) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(bytes, { headers: { 'content-type': contentType } }));

    await expect(
      fetchRemoteImage('https://example.com/image', {
        fetch: fetchImpl,
        resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
      }),
    ).rejects.toThrow('not a supported image');
  });

  it('revalidates a redirect destination before a second fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://10.0.0.1/secret.jpg' },
      }),
    );

    await expect(
      fetchRemoteImage('https://example.com/image', {
        fetch: fetchImpl,
        resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
      }),
    ).rejects.toThrow(/public/i);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('follows a safe relative redirect and reports the final URL', async () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 1]);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: '../final.jpg' } }),
      )
      .mockResolvedValueOnce(new Response(bytes));

    await expect(
      fetchRemoteImage('https://example.com/images/start', {
        fetch: fetchImpl,
        resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
      }),
    ).resolves.toMatchObject({
      mimeType: 'image/jpeg',
      finalUrl: 'https://example.com/final.jpg',
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://example.com/final.jpg',
      expect.objectContaining({ redirect: 'manual', credentials: 'omit' }),
    );
  });

  it('rejects a redirect without Location', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 307 }));

    await expect(
      fetchRemoteImage('https://example.com/image', {
        fetch: fetchImpl,
        resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
      }),
    ).rejects.toThrow(/Location/);
  });

  it('enforces the redirect limit', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 308, headers: { location: '/again' } }),
    );

    await expect(
      fetchRemoteImage(
        'https://example.com/image',
        {
          fetch: fetchImpl,
          resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
        },
        { maxRedirects: 1 },
      ),
    ).rejects.toThrow(/too many redirects/i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects an oversized Content-Length before reading the body', async () => {
    const response = new Response(Uint8Array.from([0xff, 0xd8, 0xff]), {
      headers: { 'content-length': String(10 * 1024 * 1024 + 1) },
    });
    const getReader = vi.spyOn(response.body!, 'getReader');

    await expect(
      fetchRemoteImage('https://example.com/image', {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
        resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
      }),
    ).rejects.toThrow(/maximum allowed size/);
    expect(getReader).not.toHaveBeenCalled();
  });

  it('cancels a chunked body immediately when cumulative bytes exceed the limit', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([0xff, 0xd8, 0xff]));
        controller.enqueue(Uint8Array.from([1, 2]));
        controller.enqueue(Uint8Array.from([3]));
      },
      cancel,
    });

    await expect(
      fetchRemoteImage(
        'https://example.com/image',
        {
          fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),
          resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
        },
        { maxBytes: 4 },
      ),
    ).rejects.toThrow(/maximum allowed size/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('allows a body exactly at the maximum size', async () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 1]);

    await expect(
      fetchRemoteImage(
        'https://example.com/image',
        {
          fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes)),
          resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
        },
        { maxBytes: bytes.byteLength },
      ),
    ).resolves.toMatchObject({ mimeType: 'image/jpeg' });
  });

  it('rejects a successful response without a body', async () => {
    await expect(
      fetchRemoteImage('https://example.com/image', {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 })),
        resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
      }),
    ).rejects.toThrow(/did not include a body/);
  });

  it('aborts a fetch when the whole-operation timeout expires', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>((_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('source details', 'AbortError'));
          });
        }),
      );
      const result = fetchRemoteImage(
        'https://example.com/image',
        {
          fetch: fetchImpl,
          resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
        },
        { timeoutMs: 25 },
      );
      const assertion = expect(result).rejects.toThrow('Remote image import timed out');

      await vi.advanceTimersByTimeAsync(25);
      await assertion;
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out while reading a response body that never completes', async () => {
    vi.useFakeTimers();
    try {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.from([0xff, 0xd8, 0xff]));
        },
      });
      let rejection: unknown;
      void fetchRemoteImage(
        'https://example.com/image',
        {
          fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),
          resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
        },
        { timeoutMs: 25 },
      ).catch((error: unknown) => {
        rejection = error;
      });

      await vi.advanceTimersByTimeAsync(25);
      expect(rejection).toEqual(new Error('Remote image import timed out'));
    } finally {
      vi.useRealTimers();
    }
  });
});

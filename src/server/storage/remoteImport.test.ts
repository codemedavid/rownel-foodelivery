import { describe, expect, it, vi } from 'vitest';
import {
  RemoteImageError,
  fetchRemoteImage,
  PINNED_REMOTE_ADDRESSES,
  type PinnedRemoteAddresses,
  type PinnedRequestInit,
} from './remoteImport';

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
    // 6to4 (2002::/16) tunnels carry an embedded IPv4 destination.
    'https://[2002:7f00:1::1]/image.jpg',
    'https://[2002:a9fe:a9fe::1]/image.jpg',
    'https://[2002:c0a8:101::1]/image.jpg',
    'https://[2002:a00:1::1]/image.jpg',
    // Teredo (2001::/32) is a transition range, never a public origin.
    'https://[2001:0:5ef5:79fd::1]/image.jpg',
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

    expect(resolvePublicAddresses).toHaveBeenCalledWith('example.com', expect.any(AbortSignal));
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
      // A timeout is the source's failure, not ours, so it must carry the type the
      // handler answers 400 on rather than falling through to the opaque 500.
      expect(rejection).toBeInstanceOf(RemoteImageError);
      expect((rejection as Error).message).toBe('Remote image import timed out');
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([
    ['loopback', '2002:7f00:1::1'],
    ['cloud metadata', '2002:a9fe:a9fe::1'],
    ['a private network', '2002:c0a8:101::1'],
  ])('rejects a 6to4 DNS answer embedding %s', async (_label, address) => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      fetchRemoteImage('https://example.com/image.jpg', {
        fetch: fetchImpl,
        resolvePublicAddresses: vi.fn().mockResolvedValue([address]),
      }),
    ).rejects.toThrow(/public/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts a 6to4 address whose embedded IPv4 is public', async () => {
    // 2002:5db8:d822::/48 embeds 93.184.216.34.
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1])));

    await expect(
      fetchRemoteImage('https://example.com/image.jpg', {
        fetch: fetchImpl,
        resolvePublicAddresses: vi.fn().mockResolvedValue(['2002:5db8:d822::1']),
      }),
    ).resolves.toMatchObject({ mimeType: 'image/jpeg' });
  });

  it('does not wait for a stalled cancel when the body exceeds the limit', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([0xff, 0xd8, 0xff]));
        controller.enqueue(Uint8Array.from([1, 2]));
      },
      cancel: () => new Promise<void>(() => undefined),
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
  });

  it('cancels a redirect response body before following it', async () => {
    const cancel = vi.fn();
    const redirectBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<html>moved</html>'));
      },
      cancel,
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(redirectBody, {
          status: 302,
          headers: { location: 'https://example.com/final.jpg' },
        }),
      )
      .mockImplementationOnce(async () => {
        expect(cancel).toHaveBeenCalledOnce();
        return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1]));
      });

    await expect(
      fetchRemoteImage('https://example.com/image', {
        fetch: fetchImpl,
        resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
      }),
    ).resolves.toMatchObject({ mimeType: 'image/jpeg' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels the body of an unsuccessful response', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('not found'));
      },
      cancel,
    });

    await expect(
      fetchRemoteImage('https://example.com/image', {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 404 })),
        resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
      }),
    ).rejects.toThrow(/status 404/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels the body of an oversized Content-Length response', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([0xff, 0xd8, 0xff]));
      },
      cancel,
    });

    await expect(
      fetchRemoteImage('https://example.com/image', {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(
          new Response(body, { headers: { 'content-length': String(10 * 1024 * 1024 + 1) } }),
        ),
        resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
      }),
    ).rejects.toThrow(/maximum allowed size/);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('pins each request to the addresses validated for its own hostname', async () => {
    const seen: Array<{ url: string; pinned: PinnedRemoteAddresses }> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      seen.push({
        url: String(input),
        pinned: (init as PinnedRequestInit)[PINNED_REMOTE_ADDRESSES],
      });
      return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1]));
    });

    await fetchRemoteImage('https://images.example/photo', {
      fetch: fetchImpl,
      resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
    });

    expect(seen).toEqual([
      {
        url: 'https://images.example/photo',
        pinned: { hostname: 'images.example', addresses: ['93.184.216.34'] },
      },
    ]);
  });

  it('re-pins to the redirect target rather than reusing the first hostname', async () => {
    const pinned: PinnedRemoteAddresses[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async (_input, init) => {
        pinned.push((init as PinnedRequestInit)[PINNED_REMOTE_ADDRESSES]);
        return new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.example/final.jpg' },
        });
      })
      .mockImplementationOnce(async (_input, init) => {
        pinned.push((init as PinnedRequestInit)[PINNED_REMOTE_ADDRESSES]);
        return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1]));
      });

    await fetchRemoteImage('https://images.example/photo', {
      fetch: fetchImpl,
      resolvePublicAddresses: vi
        .fn()
        .mockResolvedValueOnce(['93.184.216.34'])
        .mockResolvedValueOnce(['172.217.0.1', '93.184.216.34'])
        .mockResolvedValue(['198.41.0.4']),
    });

    expect(pinned).toEqual([
      { hostname: 'images.example', addresses: ['93.184.216.34'] },
      { hostname: 'cdn.example', addresses: ['172.217.0.1', '93.184.216.34'] },
    ]);
  });
  it('hands the operation signal to the resolver so a timeout cancels the lookup', async () => {
    vi.useFakeTimers();
    try {
      let dnsSignal: AbortSignal | undefined;
      const resolvePublicAddresses = vi.fn(
        async (_hostname: string, signal?: AbortSignal): Promise<string[]> => {
          dnsSignal = signal;
          return new Promise<string[]>(() => undefined);
        },
      );
      const result = fetchRemoteImage(
        'https://example.com/image',
        { fetch: vi.fn<typeof fetch>(), resolvePublicAddresses },
        { timeoutMs: 25 },
      );
      const assertion = expect(result).rejects.toThrow('Remote image import timed out');

      await vi.advanceTimersByTimeAsync(25);
      await assertion;
      expect(dnsSignal).toBeInstanceOf(AbortSignal);
      expect(dnsSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

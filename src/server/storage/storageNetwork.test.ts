import { describe, expect, it, vi } from 'vitest';
import {
  createCloudflareDnsResolver,
  createPinnedFetchTransport,
  createPinnedRemoteImageFetcher,
  type PinnedLookup,
} from './storageNetwork';
import {
  fetchRemoteImage,
  PINNED_REMOTE_ADDRESSES,
  type PinnedRequestInit,
} from './remoteImport';

describe('createPinnedFetchTransport', () => {
  it('connects to the exact address validated by the remote importer', async () => {
    let lookup: PinnedLookup | undefined;
    let connectedAddress: string | undefined;
    const dispatcher = { destroy: vi.fn().mockResolvedValue(undefined) };
    const createDispatcher = vi.fn((candidate: PinnedLookup) => {
      lookup = candidate;
      return dispatcher;
    });
    const networkFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init).toMatchObject({ dispatcher });
      await new Promise<void>((resolve, reject) => {
        lookup?.('images.example', { family: 4 }, (error, address, family) => {
          if (error) return reject(error);
          expect(family).toBe(4);
          connectedAddress = address as string;
          resolve();
        });
      });
      return new Response(Uint8Array.from([0xff, 0xd8, 0xff]));
    });
    const transport = createPinnedFetchTransport({
      fetch: networkFetch as typeof fetch,
      createDispatcher,
    });

    await fetchRemoteImage('https://images.example/photo', {
      fetch: transport.fetch,
      resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
    });

    expect(connectedAddress).toBe('93.184.216.34');
    expect(createDispatcher).toHaveBeenCalledOnce();
    transport.abort();
    expect(dispatcher.destroy).toHaveBeenCalledOnce();
  });

  it('destroys the dispatcher once the response body has been read', async () => {
    const dispatchers: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
    const transport = createPinnedFetchTransport({
      fetch: (async () =>
        new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1]))) as unknown as typeof fetch,
      createDispatcher: () => {
        const dispatcher = { destroy: vi.fn().mockResolvedValue(undefined) };
        dispatchers.push(dispatcher);
        return dispatcher;
      },
    });

    await fetchRemoteImage('https://images.example/photo', {
      fetch: transport.fetch,
      resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
    });

    // Destroyed by reaching the end of the body, without waiting for abort().
    expect(dispatchers).toHaveLength(1);
    expect(dispatchers[0].destroy).toHaveBeenCalledOnce();

    transport.abort();
    expect(dispatchers[0].destroy).toHaveBeenCalledOnce();
  });

  it('destroys the dispatcher when the caller cancels the body', async () => {
    const dispatcher = { destroy: vi.fn().mockResolvedValue(undefined) };
    const transport = createPinnedFetchTransport({
      fetch: (async () =>
        new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1]))) as unknown as typeof fetch,
      createDispatcher: () => dispatcher,
    });

    const response = await transport.fetch('https://images.example/photo', {
      [PINNED_REMOTE_ADDRESSES]: {
        hostname: 'images.example',
        addresses: ['93.184.216.34'],
      },
    } as PinnedRequestInit);
    expect(dispatcher.destroy).not.toHaveBeenCalled();

    await response.body?.cancel();
    expect(dispatcher.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'a hostname that does not match the validated addresses',
      {
        [PINNED_REMOTE_ADDRESSES]: {
          hostname: 'other.example',
          addresses: ['93.184.216.34'],
        },
      },
    ],
    ['no validated addresses', {}],
  ])('refuses %s', async (_label, init) => {
    const createDispatcher = vi.fn();
    const networkFetch = vi.fn();
    const transport = createPinnedFetchTransport({
      fetch: networkFetch as unknown as typeof fetch,
      createDispatcher,
    });

    await expect(
      transport.fetch('https://images.example/photo', init as PinnedRequestInit),
    ).rejects.toThrow(/validated addresses/);
    expect(createDispatcher).not.toHaveBeenCalled();
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['numeric IPv4', 4 as const, '93.184.216.34'],
    ['string IPv4', 'IPv4' as const, '93.184.216.34'],
    ['numeric IPv6', 6 as const, '2606:2800:220:1::1'],
    ['string IPv6', 'IPv6' as const, '2606:2800:220:1::1'],
  ])('resolves the pinned address for a %s family request', async (_label, family, expected) => {
    // Node may express the requested family either as a number or as 'IPv4'/'IPv6'.
    // Only matching the numeric form would strand the connection with no address.
    let lookup: PinnedLookup | undefined;
    const transport = createPinnedFetchTransport({
      createDispatcher: (candidate) => {
        lookup = candidate;
        return { destroy: vi.fn().mockResolvedValue(undefined) };
      },
      fetch: (async () =>
        new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1]))) as unknown as typeof fetch,
    });

    await fetchRemoteImage('https://images.example/photo', {
      fetch: transport.fetch,
      resolvePublicAddresses: vi
        .fn()
        .mockResolvedValue(['93.184.216.34', '2606:2800:220:1::1']),
    });

    const address = await new Promise<string>((resolve, reject) => {
      lookup?.('images.example', { family }, (error, value) => {
        if (error) reject(error);
        else resolve(value as string);
      });
    });
    expect(address).toBe(expected);
  });

  it('keeps concurrent imports on their own validated addresses', async () => {
    const lookups = new Map<string, PinnedLookup>();
    let releaseFirst: (() => void) | undefined;
    const firstIsInFlight = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const transport = createPinnedFetchTransport({
      createDispatcher: (lookup) => ({
        destroy: vi.fn().mockResolvedValue(undefined),
        lookup,
      }),
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const hostname = new URL(String(input)).hostname;
        const { lookup } = (init as RequestInit & {
          dispatcher: { lookup: PinnedLookup };
        }).dispatcher;
        lookups.set(hostname, lookup);
        // Hold the first request open so both are pinned at the same time.
        if (hostname === 'first.example') {
          releaseFirst?.();
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1]));
      }) as unknown as typeof fetch,
    });

    const first = fetchRemoteImage('https://first.example/photo', {
      fetch: transport.fetch,
      resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
    });
    await firstIsInFlight;
    const second = fetchRemoteImage('https://second.example/photo', {
      fetch: transport.fetch,
      resolvePublicAddresses: vi.fn().mockResolvedValue(['198.41.0.4']),
    });
    await Promise.all([first, second]);

    const resolveWith = (lookup: PinnedLookup, hostname: string) =>
      new Promise<string>((resolve, reject) => {
        lookup(hostname, {}, (error, address) => {
          if (error) reject(error);
          else resolve(address as string);
        });
      });

    expect(await resolveWith(lookups.get('first.example')!, 'first.example')).toBe(
      '93.184.216.34',
    );
    expect(await resolveWith(lookups.get('second.example')!, 'second.example')).toBe(
      '198.41.0.4',
    );
    await expect(
      resolveWith(lookups.get('first.example')!, 'second.example'),
    ).rejects.toThrow(/Pinned hostname mismatch/);
  });
});

describe('createCloudflareDnsResolver', () => {
  it('fails the combined lookup when AAAA has a DNS Status failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const type = new URL(input.toString()).searchParams.get('type');
      return Response.json(
        type === 'A'
          ? { Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }
          : { Status: 2 },
      );
    });

    await expect(
      createCloudflareDnsResolver(fetchImpl)('images.example'),
    ).rejects.toThrow('DNS resolution failed');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('aborts in-flight DNS-over-HTTPS requests when the caller aborts', async () => {
    const controller = new AbortController();
    const seenSignals: Array<AbortSignal | null | undefined> = [];
    const fetchImpl = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          seenSignals.push(init?.signal);
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    const pending = createCloudflareDnsResolver(fetchImpl)('images.example', controller.signal);
    const assertion = expect(pending).rejects.toThrow();
    controller.abort();
    await assertion;

    expect(seenSignals).toHaveLength(2);
    expect(seenSignals.every((signal) => signal === controller.signal)).toBe(true);
  });

  it('rejects a malformed DNS JSON payload', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({ Status: 0, Answer: { type: 1, data: '93.184.216.34' } }),
    );

    await expect(
      createCloudflareDnsResolver(fetchImpl)('images.example'),
    ).rejects.toThrow('DNS resolution failed');
  });

  it('accepts successful NODATA when the other family has an address', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const type = new URL(input.toString()).searchParams.get('type');
      return Response.json(
        type === 'A'
          ? { Status: 0 }
          : { Status: 0, Answer: [{ type: 28, data: '2606:2800:220:1:248:1893:25c8:1946' }] },
      );
    });

    await expect(
      createCloudflareDnsResolver(fetchImpl)('images.example'),
    ).resolves.toEqual(['2606:2800:220:1:248:1893:25c8:1946']);
  });

  it('combines successful A and AAAA answers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(new Headers(init?.headers).get('accept')).toBe('application/dns-json');
      const type = new URL(input.toString()).searchParams.get('type');
      return Response.json(
        type === 'A'
          ? { Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }
          : { Status: 0, Answer: [{ type: 28, data: '2606:2800:220:1::1' }] },
      );
    });

    await expect(
      createCloudflareDnsResolver(fetchImpl)('images.example'),
    ).resolves.toEqual(['93.184.216.34', '2606:2800:220:1::1']);
  });
});

describe('createPinnedRemoteImageFetcher', () => {
  const dnsFetch = (addresses: Record<'A' | 'AAAA', string[]>) =>
    vi.fn<typeof fetch>(async (input) => {
      const type = new URL(input.toString()).searchParams.get('type') as 'A' | 'AAAA';
      const answers = addresses[type].map((data) => ({
        type: type === 'A' ? 1 : 28,
        data,
      }));
      return Response.json({ Status: 0, Answer: answers });
    });

  it('imports an image and leaves no connection open', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const importImage = createPinnedRemoteImageFetcher({
      resolverFetch: dnsFetch({ A: ['93.184.216.34'], AAAA: [] }),
      transport: {
        createDispatcher: () => ({ destroy }),
        fetch: (async () =>
          new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1]))) as unknown as typeof fetch,
      },
    });

    await expect(importImage('https://images.example/photo.jpg')).resolves.toMatchObject({
      mimeType: 'image/jpeg',
      finalUrl: 'https://images.example/photo.jpg',
    });
    expect(destroy).toHaveBeenCalled();
  });

  it('reports no open connections once a transport has settled', async () => {
    const transport = createPinnedFetchTransport({
      createDispatcher: () => ({ destroy: vi.fn().mockResolvedValue(undefined) }),
      fetch: (async () =>
        new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1]))) as unknown as typeof fetch,
    });

    await fetchRemoteImage('https://images.example/photo', {
      fetch: transport.fetch,
      resolvePublicAddresses: vi.fn().mockResolvedValue(['93.184.216.34']),
    });

    expect(transport.openConnections).toBe(0);
  });

  it('still enforces the size guard through the pinned transport', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const importImage = createPinnedRemoteImageFetcher({
      resolverFetch: dnsFetch({ A: ['93.184.216.34'], AAAA: [] }),
      transport: {
        createDispatcher: () => ({ destroy }),
        fetch: (async () =>
          new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1]), {
            headers: { 'content-length': String(10 * 1024 * 1024 + 1) },
          })) as unknown as typeof fetch,
      },
    });

    await expect(importImage('https://images.example/photo.jpg')).rejects.toThrow(
      /maximum allowed size/,
    );
    expect(destroy).toHaveBeenCalled();
  });

  it('follows a redirect through the pinned transport and re-resolves the target', async () => {
    const resolved: string[] = [];
    const resolverFetch = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(input.toString());
      const hostname = url.searchParams.get('name') ?? '';
      if (url.searchParams.get('type') === 'A') resolved.push(hostname);
      return Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] });
    });
    const importImage = createPinnedRemoteImageFetcher({
      resolverFetch,
      transport: {
        createDispatcher: () => ({ destroy: vi.fn().mockResolvedValue(undefined) }),
        fetch: (async (input: RequestInfo | URL) =>
          String(input).includes('/start')
            ? new Response(new TextEncoder().encode('moved'), {
                status: 302,
                headers: { location: 'https://cdn.example/final.jpg' },
              })
            : new Response(Uint8Array.from([0xff, 0xd8, 0xff, 1]))) as unknown as typeof fetch,
      },
    });

    await expect(importImage('https://images.example/start')).resolves.toMatchObject({
      finalUrl: 'https://cdn.example/final.jpg',
    });
    expect(resolved).toEqual(['images.example', 'cdn.example']);
  });

  it('closes the transport when the import fails', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const importImage = createPinnedRemoteImageFetcher({
      resolverFetch: dnsFetch({ A: ['93.184.216.34'], AAAA: [] }),
      transport: {
        createDispatcher: () => ({ destroy }),
        fetch: (async () =>
          new Response(new TextEncoder().encode('<html>nope</html>'))) as unknown as typeof fetch,
      },
    });

    await expect(importImage('https://images.example/photo.jpg')).rejects.toThrow(
      'not a supported image',
    );
    expect(destroy).toHaveBeenCalled();
  });

  it('fails the import when a DNS family lookup fails', async () => {
    const networkFetch = vi.fn();
    const importImage = createPinnedRemoteImageFetcher({
      resolverFetch: vi.fn<typeof fetch>(async (input) =>
        Response.json(
          new URL(input.toString()).searchParams.get('type') === 'A'
            ? { Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }
            : { Status: 2 },
        ),
      ),
      transport: {
        createDispatcher: () => ({ destroy: vi.fn().mockResolvedValue(undefined) }),
        fetch: networkFetch as unknown as typeof fetch,
      },
    });

    await expect(importImage('https://images.example/photo.jpg')).rejects.toThrow(
      'Remote image host could not be safely resolved',
    );
    expect(networkFetch).not.toHaveBeenCalled();
  });
});

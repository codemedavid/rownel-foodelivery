import { Agent, fetch as undiciFetch } from 'undici';
import {
  fetchRemoteImage,
  normalizeHostname,
  PINNED_REMOTE_ADDRESSES,
  type PinnedRequestInit,
  type RemoteImage,
} from './remoteImport';

const CLOUDFLARE_DOH_URL = 'https://cloudflare-dns.com/dns-query';

interface DnsJsonAnswer {
  type?: unknown;
  data?: unknown;
}

interface DnsJsonResponse {
  Status?: unknown;
  Answer?: unknown;
}

interface LookupAddress {
  address: string;
  family: 4 | 6;
}

export interface PinnedLookupOptions {
  /** Node expresses the wanted family either numerically or as 'IPv4'/'IPv6'. */
  family?: number | 'IPv4' | 'IPv6';
  all?: boolean;
}

export type PinnedLookupCallback = (
  error: Error | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

export type PinnedLookup = (
  hostname: string,
  options: PinnedLookupOptions,
  callback: PinnedLookupCallback,
) => void;

interface PinnedDispatcher {
  destroy(error?: Error): Promise<void>;
}

type NetworkRequestInit = RequestInit & { dispatcher?: unknown };

interface PinnedTransportDependencies {
  fetch(input: RequestInfo | URL, init?: NetworkRequestInit): Promise<Response>;
  createDispatcher(lookup: PinnedLookup): PinnedDispatcher;
}

function addressFamily(address: string): 4 | 6 {
  return address.includes(':') ? 6 : 4;
}

/**
 * Normalize a requested address family. Node accepts both the numeric and the string
 * spelling, and `0`/undefined mean "either"; treating only the numeric form as valid
 * would leave a caller asking for 'IPv6' with no candidates at all.
 */
function wantedFamily(family: PinnedLookupOptions['family']): 4 | 6 | null {
  if (family === 4 || family === 'IPv4') return 4;
  if (family === 6 || family === 'IPv6') return 6;
  return null;
}

async function resolveDnsRecord(
  fetchImpl: typeof fetch,
  hostname: string,
  type: 'A' | 'AAAA',
  signal?: AbortSignal,
): Promise<string[]> {
  const url = new URL(CLOUDFLARE_DOH_URL);
  url.searchParams.set('name', hostname);
  url.searchParams.set('type', type);
  const response = await fetchImpl(url.toString(), {
    headers: { accept: 'application/dns-json' },
    credentials: 'omit',
    signal,
  });
  if (!response.ok) throw new Error('DNS resolution failed');

  const payload = (await response.json()) as DnsJsonResponse;
  if (payload.Status !== 0) throw new Error('DNS resolution failed');
  if (payload.Answer === undefined) return [];
  if (!Array.isArray(payload.Answer)) throw new Error('DNS resolution failed');
  const expectedType = type === 'A' ? 1 : 28;
  const addresses: string[] = [];
  for (const answer of payload.Answer as DnsJsonAnswer[]) {
    if (answer?.type !== expectedType) continue;
    if (typeof answer.data !== 'string') throw new Error('DNS resolution failed');
    addresses.push(answer.data);
  }
  return addresses;
}

export function createCloudflareDnsResolver(
  fetchImpl: typeof fetch = globalThis.fetch,
): (hostname: string, signal?: AbortSignal) => Promise<string[]> {
  return async (hostname, signal) => {
    const [ipv4, ipv6] = await Promise.all([
      resolveDnsRecord(fetchImpl, hostname, 'A', signal),
      resolveDnsRecord(fetchImpl, hostname, 'AAAA', signal),
    ]);
    return [...ipv4, ...ipv6];
  };
}

function createLookup(hostname: string, addresses: readonly string[]): PinnedLookup {
  const pinned = addresses.map((address) => ({ address, family: addressFamily(address) }));
  return (requestedHostname, options, callback) => {
    if (normalizeHostname(requestedHostname).toLowerCase() !== hostname.toLowerCase()) {
      callback(new Error('Pinned hostname mismatch'), '', 0);
      return;
    }
    const wanted = wantedFamily(options.family);
    const matching = wanted ? pinned.filter((candidate) => candidate.family === wanted) : pinned;
    if (matching.length === 0) {
      callback(new Error('Pinned address family is unavailable'), '', 0);
      return;
    }
    if (options.all) {
      callback(null, matching);
      return;
    }
    const selected = matching[0];
    callback(null, selected.address, selected.family);
  };
}

/**
 * Re-expose a response body so the dispatcher that produced it is destroyed as soon
 * as the body is finished, failed, or cancelled. Without this a completed request
 * would hold its connection pool open until the whole import was abandoned.
 */
function releaseOnBodyCompletion(
  body: ReadableStream<Uint8Array>,
  onSettled: () => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          controller.close();
          onSettled();
          return;
        }
        controller.enqueue(result.value);
      } catch (error) {
        controller.error(error);
        onSettled();
      }
    },
    cancel(reason) {
      onSettled();
      return reader.cancel(reason);
    },
  });
}

const defaultDependencies: PinnedTransportDependencies = {
  // undici declares its own nominal Request/Response types. They are the very types
  // backing Node's global fetch at runtime, so the mismatch is nominal only and these
  // casts translate between the two declarations rather than bypassing a real check.
  fetch(input, init) {
    return undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      init as Parameters<typeof undiciFetch>[1],
    ) as unknown as Promise<Response>;
  },
  createDispatcher(lookup) {
    // `lookup` is checked against undici's connector options, not cast past them: a
    // future signature change must fail here rather than at the first connection.
    return new Agent({ connect: { lookup } });
  },
};

export interface PinnedFetchTransport {
  /** A `fetch` that only connects to addresses already validated for the request. */
  fetch: typeof fetch;
  /** Destroy every connection still open. Safe to call more than once. */
  abort(): void;
  /** Dispatchers still holding a connection; used by tests to prove cleanup. */
  readonly openConnections: number;
}

export function createPinnedFetchTransport(
  dependencies: PinnedTransportDependencies = defaultDependencies,
): PinnedFetchTransport {
  const activeDispatchers = new Set<PinnedDispatcher>();

  const pinnedFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const pinned = (init as PinnedRequestInit | undefined)?.[PINNED_REMOTE_ADDRESSES];
    if (!pinned || pinned.addresses.length === 0) {
      throw new Error('Remote request is missing validated addresses');
    }
    const requestUrl = new URL(
      typeof input === 'string' || input instanceof URL ? input.toString() : input.url,
    );
    const requestHostname = normalizeHostname(requestUrl.hostname);
    if (requestHostname.toLowerCase() !== pinned.hostname.toLowerCase()) {
      throw new Error('Remote request hostname does not match validated addresses');
    }

    const dispatcher = dependencies.createDispatcher(
      createLookup(pinned.hostname, pinned.addresses),
    );
    activeDispatchers.add(dispatcher);
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      activeDispatchers.delete(dispatcher);
      void dispatcher.destroy().catch(() => undefined);
    };

    // Strip the pinned-addresses symbol before the init reaches the real fetch:
    // it is this module's private channel, not a request option. The discarded
    // binding is the removal, which is what the rule cannot see.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [PINNED_REMOTE_ADDRESSES]: _pinned, ...standardInit } = init as PinnedRequestInit;
    let response: Response;
    try {
      response = await dependencies.fetch(input, { ...standardInit, dispatcher });
    } catch (error) {
      release();
      throw error;
    }

    if (!response.body) {
      release();
      return response;
    }
    return new Response(releaseOnBodyCompletion(response.body, release), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  return {
    fetch: pinnedFetch as typeof fetch,
    abort() {
      for (const dispatcher of activeDispatchers) {
        void dispatcher.destroy(new Error('Remote image transport closed')).catch(() => undefined);
      }
      activeDispatchers.clear();
    },
    get openConnections() {
      return activeDispatchers.size;
    },
  };
}

export interface RemoteImageFetcherOptions {
  /** Overrides the undici-backed transport; tests inject a fake network here. */
  transport?: PinnedTransportDependencies;
  /** Overrides the `fetch` used to reach Cloudflare's DNS-over-HTTPS endpoint. */
  resolverFetch?: typeof fetch;
}

/**
 * Build the production `fetchRemoteImage` wiring: DNS answers are validated, the
 * connection is pinned to those answers, and the transport is torn down when the
 * import settles so no connection outlives the request that opened it.
 */
export function createPinnedRemoteImageFetcher(
  options: RemoteImageFetcherOptions = {},
): (sourceUrl: string) => Promise<RemoteImage> {
  const resolvePublicAddresses = createCloudflareDnsResolver(options.resolverFetch);
  return async (sourceUrl) => {
    const transport = createPinnedFetchTransport(options.transport);
    try {
      return await fetchRemoteImage(sourceUrl, {
        fetch: transport.fetch,
        resolvePublicAddresses,
      });
    } finally {
      transport.abort();
    }
  };
}

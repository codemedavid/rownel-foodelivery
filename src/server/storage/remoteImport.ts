import { MAX_IMAGE_BYTES } from '../../lib/storageTypes';

export interface RemoteImage {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  finalUrl: string;
}

export interface RemoteImportDependencies {
  fetch: typeof fetch;
  resolvePublicAddresses(hostname: string): Promise<string[]>;
}

export interface RemoteImportOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : -1));
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function isPublicIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIpv6(address: string): number[] | null {
  const normalized = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (!normalized.includes(':') || normalized.includes('%')) return null;
  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const readHalf = (half: string): number[] | null => {
    if (!half) return [];
    const values: number[] = [];
    for (const part of half.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      values.push(Number.parseInt(part, 16));
    }
    return values;
  };
  const left = readHalf(halves[0] ?? '');
  const right = readHalf(halves[1] ?? '');
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const omitted = 8 - left.length - right.length;
  if (omitted < 1) return null;
  return [...left, ...Array<number>(omitted).fill(0), ...right];
}

function isPublicIpv6(address: string): boolean {
  const groups = parseIpv6(address);
  if (!groups) return false;
  if (
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === 0xffff
  ) {
    const mapped = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return isPublicIpv4(mapped);
  }

  const first = groups[0];
  if (first < 0x2000 || first > 0x3fff) return false;
  // IANA special-purpose and documentation ranges within 2000::/3.
  if (first === 0x2001 && groups[1] <= 0x01ff) return false;
  if (first === 0x2001 && groups[1] === 0x0db8) return false;
  if (first === 0x3fff && groups[1] <= 0x0fff) return false;
  return true;
}

function addressKind(hostname: string): 'ipv4' | 'ipv6' | null {
  const unbracketed = hostname.replace(/^\[|\]$/g, '');
  if (parseIpv4(unbracketed)) return 'ipv4';
  if (parseIpv6(unbracketed)) return 'ipv6';
  return null;
}

function isPublicAddress(address: string): boolean {
  const unbracketed = address.replace(/^\[|\]$/g, '');
  const kind = addressKind(unbracketed);
  if (kind === 'ipv4') return isPublicIpv4(unbracketed);
  if (kind === 'ipv6') return isPublicIpv6(unbracketed);
  return false;
}

function detectMimeType(
  bytes: Uint8Array,
): RemoteImage['mimeType'] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    )
  ) {
    return 'image/png';
  }
  if (bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.slice(0, 6));
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Remote image import timed out'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('Remote image import timed out'));
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

async function readBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.body) throw new Error('Remote image response did not include a body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await abortable(reader.read(), signal);
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Remote image exceeds the maximum allowed size');
      }
      chunks.push(result.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function assertSafeUrl(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new Error('Remote image URL must use HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('Remote image URL must not include credentials');
  }
  if (url.port && url.port !== '443') {
    throw new Error('Remote image URL must use the default HTTPS port');
  }
  const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'local' ||
    hostname.endsWith('.local') ||
    hostname === 'internal' ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Remote image host must resolve only to public addresses');
  }
  const kind = addressKind(hostname);
  if (kind && !isPublicAddress(hostname)) {
    throw new Error('Remote image host must resolve only to public addresses');
  }
}

async function assertPublicDestination(
  url: URL,
  resolvePublicAddresses: RemoteImportDependencies['resolvePublicAddresses'],
  signal: AbortSignal,
): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (addressKind(hostname)) return;

  let addresses: string[];
  try {
    addresses = await abortable(resolvePublicAddresses(hostname), signal);
  } catch {
    throw new Error('Remote image host could not be safely resolved');
  }
  if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
    throw new Error('Remote image host must resolve only to public addresses');
  }
}

export async function fetchRemoteImage(
  sourceUrl: string,
  deps: RemoteImportDependencies,
  _options: RemoteImportOptions = {},
): Promise<RemoteImage> {
  const maxBytes = _options.maxBytes ?? MAX_IMAGE_BYTES;
  const timeoutMs = _options.timeoutMs ?? 20_000;
  const maxRedirects = _options.maxRedirects ?? 3;
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error('Remote image URL is invalid');
  }
  assertSafeUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let redirectCount = 0;
    while (true) {
      assertSafeUrl(url);
      await assertPublicDestination(url, deps.resolvePublicAddresses, controller.signal);
      let response: Response;
      try {
        response = await abortable(
          deps.fetch(url.toString(), {
            redirect: 'manual',
            credentials: 'omit',
            signal: controller.signal,
            headers: { accept: 'image/jpeg,image/png,image/webp,image/gif' },
          }),
          controller.signal,
        );
      } catch {
        if (controller.signal.aborted) throw new Error('Remote image import timed out');
        throw new Error('Remote image could not be fetched');
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Remote image redirect is missing Location');
        if (redirectCount >= maxRedirects) {
          throw new Error('Remote image import encountered too many redirects');
        }
        try {
          url = new URL(location, url);
        } catch {
          throw new Error('Remote image redirect URL is invalid');
        }
        redirectCount += 1;
        continue;
      }
      if (!response.ok) {
        throw new Error(`Remote image fetch failed with status ${response.status}`);
      }
      const contentLengthValue = response.headers.get('content-length');
      if (contentLengthValue && /^\d+$/.test(contentLengthValue)) {
        const contentLength = Number(contentLengthValue);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          throw new Error('Remote image exceeds the maximum allowed size');
        }
      }
      const bytes = await readBody(response, maxBytes, controller.signal);
      const mimeType = detectMimeType(bytes);
      if (!mimeType) throw new Error('Remote response is not a supported image');
      return { bytes, mimeType, finalUrl: url.toString() };
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Remote image import timed out');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

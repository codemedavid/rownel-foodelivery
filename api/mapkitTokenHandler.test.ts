// Exercises the deployed handler, not just the signing helper: a token that is
// cryptographically perfect is still useless if the function returns it with
// the wrong status, content type, or cache header.
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './mapkit-token.ts';
import { decodeSegment } from './_lib/mapkitJwt.ts';

// Deliberately corrupt: PEM markers around base64 that is not a P-256 key.
// Used only to assert the handler fails closed rather than serving a token.
const MALFORMED_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgevZzL1gdAFr88hb2
OF/2NxApJCzGCEDdfSp6VQO3kthRANCAAQRWz+jn65BtOMvdyHKcvjBeBSDZH2r
1RTwjmYSi9R/zpBnuQ4EiMnCqfMPWiZqB4QdbAd0E7oH50VpuZ1P087m
-----END PRIVATE KEY-----`;

/** A fresh throwaway key per run; the real one never belongs in a test. */
const generatePem = async (): Promise<string> => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const body = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
};

const get = () => handler(new Request('https://row-nel.com/api/mapkit-token'));

describe('GET /api/mapkit-token', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('MAPKIT_TEAM_ID', 'TEAMID1234');
    vi.stubEnv('MAPKIT_KEY_ID', 'KEYID12345');
    vi.stubEnv('MAPKIT_PRIVATE_KEY', await generatePem());
    vi.stubEnv('MAPKIT_ORIGIN', 'row-nel.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns a token MapKit can consume as plain text', async () => {
    // Arrange / Act
    const response = await get();

    // Assert — MapKit's authorizationCallback is handed response.text()
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toMatch(/text\/plain/);
    expect((await response.text()).split('.')).toHaveLength(3);
  });

  it('scopes the token to MapKit JS and pins it to the configured origin', async () => {
    // Arrange / Act
    const [, payload] = (await (await get()).text()).split('.');
    const claims = decodeSegment(payload) as Record<string, unknown>;

    // Assert — Apple refuses a signed MapKit JS token missing either claim
    expect(claims.scope).toBe('mapkit_js');
    expect(claims.origin).toBe('row-nel.com');
    expect(claims.iss).toBe('TEAMID1234');
  });

  it('expires the token well inside the hour', async () => {
    // Arrange / Act
    const [, payload] = (await (await get()).text()).split('.');
    const claims = decodeSegment(payload) as Record<string, number>;

    // Assert
    expect(claims.exp - claims.iat).toBe(30 * 60);
  });

  it('caches per browser only, never in a shared cache', async () => {
    // Arrange / Act
    const cacheControl = (await get()).headers.get('Cache-Control');

    // Assert — one origin-pinned token must not be served to every visitor
    expect(cacheControl).toContain('private');
  });

  it('stops caching before the token it returned expires', async () => {
    // Arrange / Act
    const cacheControl = (await get()).headers.get('Cache-Control') ?? '';
    const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1]);

    // Assert — otherwise a browser reuses a token Apple has already rejected
    expect(maxAge).toBeLessThan(30 * 60);
  });

  it('refuses anything but GET', async () => {
    // Arrange / Act
    const response = await handler(
      new Request('https://row-nel.com/api/mapkit-token', { method: 'POST' })
    );

    // Assert
    expect(response.status).toBe(405);
  });

  it('fails closed when the private key is missing, without naming it publicly', async () => {
    // Arrange
    vi.stubEnv('MAPKIT_PRIVATE_KEY', '');

    // Act
    const response = await get();

    // Assert — the deployer reads the cause in the logs, not the visitor
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/MAPKIT_PRIVATE_KEY/);
  });

  it('rejects an Apple identifier of the wrong length before calling Apple', async () => {
    // Arrange — a truncated paste is the common way this goes wrong
    vi.stubEnv('MAPKIT_TEAM_ID', 'KBC9YTF9');

    // Act / Assert
    expect((await get()).status).toBe(500);
  });

  it('reports a malformed private key rather than serving a broken token', async () => {
    // Arrange
    vi.stubEnv('MAPKIT_PRIVATE_KEY', MALFORMED_PEM);

    // Act / Assert
    expect((await get()).status).toBe(500);
  });
});

// Runs on Node rather than jsdom: the handler signs with Web Crypto, and only
// Node's implementation supports the ECDSA P-256 key import this needs.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildMapkitToken, decodeSegment, MapkitConfigError } from './mapkitJwt';

/** A throwaway P-256 key in the .p8 PEM shape Apple hands out. */
const generateTestKey = async (): Promise<{ pem: string; publicKey: CryptoKey }> => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const body = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  const lines = body.match(/.{1,64}/g)?.join('\n') ?? body;
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`,
    publicKey: pair.publicKey,
  };
};

const config = async () => ({
  teamId: 'ABCDE12345',
  keyId: 'KEY1234567',
  privateKeyPem: (await generateTestKey()).pem,
  scope: 'mapkit_js',
  origin: 'row-nel.com',
  ttlSeconds: 1800,
});

describe('buildMapkitToken', () => {
  it('signs a three-part JWT', async () => {
    // Arrange / Act
    const token = await buildMapkitToken(await config());

    // Assert
    expect(token.split('.')).toHaveLength(3);
  });

  it('declares ES256 and the key id in the header, as Apple requires', async () => {
    // Arrange
    const options = await config();

    // Act
    const [header] = (await buildMapkitToken(options)).split('.');

    // Assert
    expect(decodeSegment(header)).toEqual({
      alg: 'ES256',
      kid: 'KEY1234567',
      typ: 'JWT',
    });
  });

  it('issues the token in the team’s name and expires it', async () => {
    // Arrange
    const options = await config();
    const before = Math.floor(Date.now() / 1000);

    // Act
    const [, payload] = (await buildMapkitToken(options)).split('.');
    const claims = decodeSegment(payload) as Record<string, unknown>;

    // Assert
    expect(claims.iss).toBe('ABCDE12345');
    expect(claims.iat).toBeGreaterThanOrEqual(before);
    expect(claims.exp).toBe((claims.iat as number) + 1800);
  });

  it('authorises only the framework it is for, so one leak is not total', async () => {
    // Arrange
    const options = await config();

    // Act
    const [, payload] = (await buildMapkitToken(options)).split('.');

    // Assert — Apple rejects a MapKit JS token that does not claim this scope
    expect((decodeSegment(payload) as Record<string, unknown>).scope).toBe('mapkit_js');
  });

  it('carries a multi-framework scope as the space-separated list Apple expects', async () => {
    // Arrange
    const options = { ...(await config()), scope: 'mapkit_js server_api' };

    // Act
    const [, payload] = (await buildMapkitToken(options)).split('.');

    // Assert
    expect((decodeSegment(payload) as Record<string, unknown>).scope).toBe(
      'mapkit_js server_api'
    );
  });

  it('pins the token to one domain so a copied token is useless elsewhere', async () => {
    // Arrange
    const options = await config();

    // Act
    const [, payload] = (await buildMapkitToken(options)).split('.');

    // Assert — Apple wants a bare domain, no scheme
    expect((decodeSegment(payload) as Record<string, unknown>).origin).toBe('row-nel.com');
  });

  it('omits the origin claim when no domain is configured', async () => {
    // Arrange
    const options = { ...(await config()), origin: undefined };

    // Act
    const [, payload] = (await buildMapkitToken(options)).split('.');

    // Assert
    expect(decodeSegment(payload)).not.toHaveProperty('origin');
  });

  it('produces a signature the matching public key verifies', async () => {
    // Arrange — the round trip proves the key import and raw ECDSA encoding
    const { pem, publicKey } = await generateTestKey();
    const token = await buildMapkitToken({
      teamId: 'ABCDE12345',
      keyId: 'KEY1234567',
      privateKeyPem: pem,
      scope: 'mapkit_js',
      ttlSeconds: 600,
    });
    const [header, payload, signature] = token.split('.');

    // Act
    const isValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
        c.charCodeAt(0)
      ),
      new TextEncoder().encode(`${header}.${payload}`)
    );

    // Assert
    expect(isValid).toBe(true);
  });

  it('rejects a private key that is not a usable PEM', async () => {
    // Arrange
    const options = { ...(await config()), privateKeyPem: 'not-a-key' };

    // Act / Assert
    await expect(buildMapkitToken(options)).rejects.toThrow(MapkitConfigError);
  });

  it('accepts a PEM whose newlines arrived escaped, as env vars deliver them', async () => {
    // Arrange — Vercel stores multi-line secrets with literal \n sequences
    const { pem } = await generateTestKey();
    const options = {
      teamId: 'ABCDE12345',
      keyId: 'KEY1234567',
      privateKeyPem: pem.replace(/\n/g, '\\n'),
      scope: 'mapkit_js',
      ttlSeconds: 600,
    };

    // Act
    const token = await buildMapkitToken(options);

    // Assert
    expect(token.split('.')).toHaveLength(3);
  });
});

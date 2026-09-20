// Signs the short-lived Maps tokens MapKit JS authenticates with.
//
// Apple's MapKit JS never sees the private key: the browser asks this app for a
// token, and the token is an ES256 JWT signed here with the .p8 key from the
// Apple Developer account. Keeping the key server-side is the whole point, so
// nothing in this file may be imported from `src/` — Vite would inline it into
// the browser bundle.
//
// Token shape is fixed by Apple:
//   header  { alg: "ES256", kid: <10-char key id>, typ: "JWT" }
//   payload { iss: <10-char team id>, iat, exp, scope, origin }
//
// A dynamically signed token MUST carry `scope` and `origin`; Apple rejects a
// MapKit JS token that omits them, which is not obvious from the failure — the
// map simply never appears.
//
// See https://developer.apple.com/documentation/mapkitjs/creating-a-maps-token

/** A deployment problem — a missing or malformed key — never a caller's fault. */
export class MapkitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapkitConfigError';
  }
}

export interface MapkitTokenOptions {
  /** 10-character Apple Team ID; becomes the `iss` claim. */
  teamId: string;
  /** 10-character MapKit key ID; becomes the `kid` header. */
  keyId: string;
  /** Contents of the .p8 file, PEM-encoded PKCS#8. */
  privateKeyPem: string;
  /**
   * Space-separated Apple Maps frameworks this token may use — `mapkit_js`,
   * `server_api`, `embed_api`, `web_snapshots`. Keep it to the one framework
   * that needs it, so a leaked token cannot reach the others.
   */
  scope: string;
  /** Bare domain (no scheme) the token is valid for. Omit to allow any. */
  origin?: string;
  /** Lifetime in seconds. Short, because the browser can always ask again. */
  ttlSeconds: number;
}

const PEM_HEADER = '-----BEGIN PRIVATE KEY-----';
const PEM_FOOTER = '-----END PRIVATE KEY-----';

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const encodeJsonSegment = (value: unknown): string =>
  encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));

/** Reads one JWT segment back. Exported for tests and for diagnostics. */
export const decodeSegment = (segment: string): unknown => {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(padded));
};

/**
 * Environment variables cannot hold real newlines on every host, so a .p8
 * pasted into a dashboard usually arrives with literal `\n` sequences. Both
 * forms are accepted rather than making the deployer guess which one works.
 */
const importPrivateKey = async (privateKeyPem: string): Promise<CryptoKey> => {
  const normalized = privateKeyPem.replace(/\\n/g, '\n').trim();

  if (!normalized.includes(PEM_HEADER) || !normalized.includes(PEM_FOOTER)) {
    throw new MapkitConfigError(
      'MAPKIT_PRIVATE_KEY must be the full contents of the .p8 file, including the BEGIN/END lines.'
    );
  }

  const base64 = normalized
    .replace(PEM_HEADER, '')
    .replace(PEM_FOOTER, '')
    .replace(/\s+/g, '');

  let der: Uint8Array;
  try {
    der = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  } catch {
    throw new MapkitConfigError('MAPKIT_PRIVATE_KEY is not valid base64 between its PEM markers.');
  }

  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      der,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  } catch {
    throw new MapkitConfigError(
      'MAPKIT_PRIVATE_KEY is not a P-256 private key. Download the MapKit JS .p8 again.'
    );
  }
};

/** Builds and signs one Maps token. */
export const buildMapkitToken = async (options: MapkitTokenOptions): Promise<string> => {
  const key = await importPrivateKey(options.privateKeyPem);

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: options.keyId, typ: 'JWT' };
  const payload = {
    iss: options.teamId,
    iat: issuedAt,
    exp: issuedAt + options.ttlSeconds,
    scope: options.scope,
    // Apple wants a bare domain here; a scheme makes the token fail to validate.
    ...(options.origin ? { origin: options.origin } : {}),
  };

  const signingInput = `${encodeJsonSegment(header)}.${encodeJsonSegment(payload)}`;
  // Web Crypto emits the raw r||s pair ES256 expects, not the DER wrapper.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
};

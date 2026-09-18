import { AwsClient } from 'aws4fetch';
import {
  ALLOWED_IMAGE_TYPES,
  ASSET_CATEGORIES,
  type AssetCategory,
  type StorageContext,
} from '../../lib/storageTypes';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  privateBucket: string;
  publicUrl: string;
}

/** Server-only context; ownerId is intentionally not part of the browser API. */
export interface R2StorageContext extends StorageContext {
  ownerId?: string;
}

interface R2Dependencies {
  fetch?: typeof fetch;
  signer?: Pick<AwsClient, 'sign'>;
}

type AwsSignInit = RequestInit & { aws?: { signQuery?: boolean; allHeaders?: boolean } };

const MIME_EXTENSIONS: Record<(typeof ALLOWED_IMAGE_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const DEFAULT_EXPIRY_SECONDS = 300;
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

function encodePath(key: string): string {
  return key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function assertSafeSegment(value: string, field: string): void {
  if (!value || !SAFE_SEGMENT.test(value)) {
    throw new Error(`${field} must be a safe opaque path segment`);
  }
}

function assertSafeObjectKey(key: string): void {
  if (!key || key.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error('R2 object key must not contain path traversal');
  }
}

function extensionForMime(mimeType: string): string {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }
  return MIME_EXTENSIONS[mimeType as keyof typeof MIME_EXTENSIONS];
}

export function createR2Store(config: R2Config, dependencies: R2Dependencies = {}) {
  const signer =
    dependencies.signer ??
    new AwsClient({
      service: 's3',
      region: 'auto',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;

  const assertBucket = (bucket: string): void => {
    if (bucket !== config.publicBucket && bucket !== config.privateBucket) {
      throw new Error(`Unknown R2 bucket: ${bucket}`);
    }
  };

  const objectUrl = (bucket: string, key: string): string => {
    assertBucket(bucket);
    assertSafeObjectKey(key);
    return `https://${encodeURIComponent(config.accountId)}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${encodePath(key)}`;
  };

  const signedRequest = async (
    operation: string,
    bucket: string,
    key: string,
    init: AwsSignInit,
    input?: string,
  ): Promise<Request> => {
    const requestUrl = input ?? objectUrl(bucket, key);
    try {
      return await signer.sign(requestUrl, init);
    } catch {
      throw new Error(`R2 ${operation} signing failed`);
    }
  };

  const execute = async (
    operation: 'delete' | 'head' | 'put',
    bucket: string,
    key: string,
    init: AwsSignInit,
  ): Promise<Response> => {
    const request = await signedRequest(operation, bucket, key, init);
    try {
      return await fetchImpl(request);
    } catch {
      throw new Error(`R2 ${operation} operation failed (network error)`);
    }
  };

  return {
    createObjectKey(
      category: AssetCategory,
      mimeType: string,
      context: R2StorageContext,
      id?: string,
    ): string {
      const categoryConfig = ASSET_CATEGORIES[category];
      if (!categoryConfig) {
        throw new Error(`Unknown asset category: ${category}`);
      }
      const extension = extensionForMime(mimeType);
      const objectId = id ?? globalThis.crypto.randomUUID();
      assertSafeSegment(objectId, 'id');

      if (category === 'receipt') {
        if (!context.ownerId) {
          throw new Error('receipt object keys require ownerId');
        }
        assertSafeSegment(context.ownerId, 'ownerId');
        return `${categoryConfig.prefix}/${context.ownerId}/${objectId}.${extension}`;
      }

      if (category === 'rider-photo') {
        if (!context.riderId) {
          throw new Error('rider-photo object keys require riderId');
        }
        assertSafeSegment(context.riderId, 'riderId');
        return `${categoryConfig.prefix}/${context.riderId}/${objectId}.${extension}`;
      }

      return `${categoryConfig.prefix}/${objectId}.${extension}`;
    },

    publicUrl(key: string): string {
      assertSafeObjectKey(key);
      return `${config.publicUrl.replace(/\/+$/, '')}/${encodePath(key)}`;
    },

    async signPut(
      bucket: string,
      key: string,
      mimeType: string,
      expiresSeconds = DEFAULT_EXPIRY_SECONDS,
    ): Promise<string> {
      extensionForMime(mimeType);
      const url = new URL(objectUrl(bucket, key));
      url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
      const request = await signedRequest('PUT', bucket, key, {
        method: 'PUT',
        headers: { 'content-type': mimeType },
        aws: { signQuery: true, allHeaders: true },
      }, url.toString());
      return request.url;
    },

    async signGet(
      bucket: string,
      key: string,
      expiresSeconds = DEFAULT_EXPIRY_SECONDS,
    ): Promise<string> {
      const url = new URL(objectUrl(bucket, key));
      url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
      const request = await signedRequest('GET', bucket, key, {
        method: 'GET',
        aws: { signQuery: true, allHeaders: true },
      }, url.toString());
      return request.url;
    },

    async deleteObject(bucket: string, key: string): Promise<boolean> {
      const response = await execute('delete', bucket, key, { method: 'DELETE' });
      if (response.status === 404) return false;
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`R2 delete operation failed (${response.status})`);
      }
      return true;
    },

    async headObject(bucket: string, key: string): Promise<boolean> {
      const response = await execute('head', bucket, key, { method: 'HEAD' });
      if (response.status === 404) return false;
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`R2 head operation failed (${response.status})`);
      }
      return true;
    },

    async putObject(
      bucket: string,
      key: string,
      mimeType: string,
      bytes: Uint8Array,
    ): Promise<void> {
      extensionForMime(mimeType);
      const response = await execute('put', bucket, key, {
        method: 'PUT',
        headers: { 'content-type': mimeType },
        body: bytes as BodyInit,
        aws: { allHeaders: true },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`R2 put operation failed (${response.status})`);
      }
    },
  };
}

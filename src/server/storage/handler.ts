import {
  ALLOWED_IMAGE_TYPES,
  ASSET_CATEGORIES,
  MAX_IMAGE_BYTES,
  type AssetCategory,
  type StorageContext,
  type UploadGrant,
} from '../../lib/storageTypes.js';
import {
  authorizeStorageAction,
  type AuthorizationResult,
  type StorageAction,
  type StorageActor,
  type StorageRepository,
} from './authorization.js';
import type { R2StorageContext } from './r2.js';
import type { RemoteImage } from './remoteImport.js';

const GRANT_EXPIRY_SECONDS = 300;
const CONTEXT_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_KEY_SEGMENT = /^[A-Za-z0-9_-]+$/;
const SAFE_IMAGE_FILE = /^[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|gif)$/;
const MERCHANT_CONTEXT_CATEGORIES: readonly AssetCategory[] = [
  'menu-item',
  'merchant-logo',
  'merchant-cover',
];

export type StorageRequest =
  | {
      action: 'create-upload';
      category: AssetCategory;
      mimeType: string;
      size: number;
      context: StorageContext;
    }
  | {
      action: 'import-url';
      category: AssetCategory;
      sourceUrl: string;
      context: StorageContext;
    }
  | {
      action: 'create-download';
      category: 'receipt' | 'rider-photo';
      context: StorageContext;
    }
  | {
      action: 'delete';
      category: AssetCategory;
      reference: string;
      context: StorageContext;
    };

type StorageResponse =
  | UploadGrant
  | { objectKey: string; publicUrl?: string }
  | { downloadUrl: string; expiresAt: number }
  | { ok: true; deleted: boolean };

type ParsedStorageRequest =
  | Exclude<StorageRequest, { action: 'delete' }>
  | {
      action: 'delete';
      category: AssetCategory;
      reference: unknown;
      context: StorageContext;
    };

export interface StorageR2Operations {
  createObjectKey(
    category: AssetCategory,
    mimeType: string,
    context: R2StorageContext,
  ): string;
  publicUrl(key: string): string;
  signPut(bucket: string, key: string, mimeType: string, expiresSeconds?: number): Promise<string>;
  signGet(bucket: string, key: string, expiresSeconds?: number): Promise<string>;
  deleteObject(bucket: string, key: string): Promise<boolean>;
  putObject(bucket: string, key: string, mimeType: string, bytes: Uint8Array): Promise<void>;
  headObject(bucket: string, key: string): Promise<boolean>;
}

export interface StorageHandlerDependencies {
  authenticate(token: string): Promise<StorageActor | null>;
  repository: StorageRepository;
  authorize?: (
    repository: StorageRepository,
    actor: StorageActor,
    action: StorageAction,
    category: AssetCategory,
    context: StorageContext,
  ) => Promise<AuthorizationResult>;
  r2: StorageR2Operations;
  fetchRemoteImage(sourceUrl: string): Promise<RemoteImage>;
  config: {
    publicBucket: string;
    privateBucket: string;
    publicUrl: string;
  };
  clock?: () => number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCategory(value: unknown): value is AssetCategory {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(ASSET_CATEGORIES, value)
  );
}

function parseContext(value: unknown): StorageContext | null {
  if (!isRecord(value)) return null;
  const context: StorageContext = {};
  for (const key of ['merchantId', 'orderId', 'riderId'] as const) {
    const id = value[key];
    if (id === undefined) continue;
    if (typeof id !== 'string' || !CONTEXT_ID.test(id)) return null;
    context[key] = id;
  }
  return context;
}

function hasRequiredContext(category: AssetCategory, context: StorageContext): boolean {
  if (MERCHANT_CONTEXT_CATEGORIES.includes(category)) return Boolean(context.merchantId);
  if (category === 'receipt') return Boolean(context.orderId);
  if (category === 'rider-photo') return Boolean(context.riderId);
  return true;
}

function parseStorageRequest(value: unknown): ParsedStorageRequest | null {
  if (!isRecord(value) || !isCategory(value.category)) return null;
  const context = parseContext(value.context);
  if (!context || !hasRequiredContext(value.category, context)) return null;

  if (value.action === 'create-upload') {
    const normalizedMime =
      typeof value.mimeType === 'string' ? value.mimeType.toLowerCase() : null;
    if (
      !normalizedMime ||
      !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(normalizedMime) ||
      typeof value.size !== 'number' ||
      !Number.isFinite(value.size) ||
      !Number.isInteger(value.size) ||
      value.size <= 0 ||
      value.size > MAX_IMAGE_BYTES
    ) {
      return null;
    }
    return {
      action: value.action,
      category: value.category,
      mimeType: normalizedMime,
      size: value.size,
      context,
    };
  }

  if (value.action === 'import-url') {
    if (
      typeof value.sourceUrl !== 'string' ||
      value.sourceUrl.trim().length === 0 ||
      value.sourceUrl.length > 4096
    ) {
      return null;
    }
    return {
      action: value.action,
      category: value.category,
      sourceUrl: value.sourceUrl,
      context,
    };
  }

  if (value.action === 'create-download') {
    if (value.category !== 'receipt' && value.category !== 'rider-photo') return null;
    return { action: value.action, category: value.category, context };
  }

  if (value.action === 'delete') {
    return {
      action: value.action,
      category: value.category,
      reference: value.reference,
      context,
    };
  }

  return null;
}

function categoryScopeSegments(category: AssetCategory): number {
  if (category === 'receipt') return 2;
  if (
    category === 'menu-item' ||
    category === 'merchant-logo' ||
    category === 'merchant-cover' ||
    category === 'payment-qr' ||
    category === 'rider-photo'
  ) {
    return 1;
  }
  return 0;
}

function hasSafeCategoryKeyShape(key: string, category: AssetCategory): boolean {
  if (
    !key ||
    key.includes('\\') ||
    /%(?:2f|5c)/i.test(key) ||
    key.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return false;
  }

  const prefixSegments = ASSET_CATEGORIES[category].prefix.split('/');
  const segments = key.split('/');
  if (segments.length !== prefixSegments.length + categoryScopeSegments(category) + 1) {
    return false;
  }
  if (!prefixSegments.every((segment, index) => segments[index] === segment)) return false;
  return (
    segments.slice(prefixSegments.length, -1).every((segment) => SAFE_KEY_SEGMENT.test(segment)) &&
    SAFE_IMAGE_FILE.test(segments[segments.length - 1] ?? '')
  );
}

function rawUrlPathHasDotSegment(reference: string): boolean {
  const schemeEnd = reference.indexOf('://');
  if (schemeEnd < 0) return false;
  const pathStart = reference.indexOf('/', schemeEnd + 3);
  if (pathStart < 0) return false;
  const queryStart = reference.indexOf('?', pathStart);
  const fragmentStart = reference.indexOf('#', pathStart);
  const pathEnd = Math.min(
    queryStart < 0 ? reference.length : queryStart,
    fragmentStart < 0 ? reference.length : fragmentStart,
  );
  return reference
    .slice(pathStart, pathEnd)
    .split('/')
    .some((segment) => {
      try {
        const decoded = decodeURIComponent(segment);
        return decoded === '.' || decoded === '..';
      } catch {
        return false;
      }
    });
}

function publicKeyFromReference(
  reference: string,
  category: AssetCategory,
  configuredPublicUrl: string,
): string | null {
  // Matching control characters is the point here: a reference carrying NUL, a
  // C0/C1 control or DEL is rejected outright rather than parsed.
  /* eslint-disable no-control-regex */
  if (
    !/^https?:\/\/[^/\\?#\s\u0000-\u001F\u007F]/i.test(reference) ||
    /[\u0000-\u001F\u007F]/.test(reference) ||
    reference.includes('\\') ||
    rawUrlPathHasDotSegment(reference)
  ) {
    return null;
  }
  /* eslint-enable no-control-regex */
  let url: URL;
  let publicUrl: URL;
  try {
    url = new URL(reference);
    publicUrl = new URL(configuredPublicUrl);
  } catch {
    return null;
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.origin !== publicUrl.origin ||
    url.username ||
    url.password ||
    /^\/cdn-cgi(?:\/|$)/i.test(url.pathname) ||
    /%(?:2f|5c)/i.test(url.pathname)
  ) {
    return null;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (decodedPath.includes('\\') || /^\/cdn-cgi(?:\/|$)/i.test(decodedPath)) return null;

  const basePath = publicUrl.pathname.replace(/\/+$/, '');
  if (basePath && basePath !== '/') {
    if (!decodedPath.startsWith(`${basePath}/`)) return null;
    decodedPath = decodedPath.slice(basePath.length);
  }
  const key = decodedPath.replace(/^\//, '');
  return hasSafeCategoryKeyShape(key, category) ? key : null;
}

function canDeletePublicKeyScope(
  key: string,
  category: AssetCategory,
  actor: StorageActor,
  context: StorageContext,
): boolean {
  if (actor.role !== 'staff') return true;
  if (categoryScopeSegments(category) === 0) return true;
  const scopeIndex = ASSET_CATEGORIES[category].prefix.split('/').length;
  const merchantScope = key.split('/')[scopeIndex];
  return (
    Boolean(context.merchantId) &&
    merchantScope !== 'global' &&
    merchantScope === context.merchantId
  );
}

function privateKeyFromReference(
  reference: string,
  category: 'receipt' | 'rider-photo',
  actor: StorageActor,
  context: StorageContext,
): string | null {
  if (!hasSafeCategoryKeyShape(reference, category)) return null;
  const ownerIndex = ASSET_CATEGORIES[category].prefix.split('/').length;
  const segments = reference.split('/');
  const ownerId = segments[ownerIndex];
  if (category === 'receipt') {
    const orderId = segments[ownerIndex + 1];
    if (orderId !== context.orderId) return null;
    if (actor.role === 'customer' && ownerId !== actor.id) return null;
  }
  if (category === 'rider-photo' && actor.role === 'rider' && ownerId !== actor.id) {
    return null;
  }
  return reference;
}

export function createStorageHandler(deps: StorageHandlerDependencies) {
  const authorize = deps.authorize ?? authorizeStorageAction;
  const clock = deps.clock ?? Date.now;

  const handle = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const actor = await deps.authenticate(token);
    if (!actor) return json({ error: 'Unauthorized' }, 401);

    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
    const body = parseStorageRequest(parsed);
    if (!body) return json({ error: 'Invalid request' }, 400);
    const authorization = await authorize(
      deps.repository,
      actor,
      body.action,
      body.category,
      body.context,
    );
    if (!authorization.allowed) return json({ error: 'Forbidden' }, 403);

    if (body.action === 'create-download') {
      if (!authorization.objectKey) return json({ error: 'Forbidden' }, 403);
      const downloadUrl = await deps.r2.signGet(
        deps.config.privateBucket,
        authorization.objectKey,
        GRANT_EXPIRY_SECONDS,
      );
      const response: StorageResponse = {
        downloadUrl,
        expiresAt: clock() + GRANT_EXPIRY_SECONDS * 1_000,
      };
      return json(response);
    }

    if (body.action === 'delete') {
      if (typeof body.reference !== 'string' || body.reference.length === 0) {
        return json({ error: 'Invalid request' }, 400);
      }
      const categoryConfig = ASSET_CATEGORIES[body.category];
      const objectKey =
        categoryConfig.visibility === 'public'
          ? publicKeyFromReference(body.reference, body.category, deps.config.publicUrl)
          : privateKeyFromReference(
              body.reference,
              body.category as 'receipt' | 'rider-photo',
              actor,
              body.context,
            );
      if (!objectKey) return json({ error: 'Invalid request' }, 400);
      if (
        categoryConfig.visibility === 'public' &&
        !canDeletePublicKeyScope(objectKey, body.category, actor, body.context)
      ) {
        return json({ error: 'Invalid request' }, 400);
      }
      const bucket =
        categoryConfig.visibility === 'public'
          ? deps.config.publicBucket
          : deps.config.privateBucket;
      const deleted = await deps.r2.deleteObject(bucket, objectKey);
      const response: StorageResponse = { ok: true, deleted };
      return json(response);
    }

    if (body.action === 'import-url') {
      const image = await deps.fetchRemoteImage(body.sourceUrl);
      const categoryConfig = ASSET_CATEGORIES[body.category];
      const keyContext =
        body.category === 'receipt'
          ? { ...body.context, ownerId: actor.id }
          : body.context;
      const objectKey = deps.r2.createObjectKey(
        body.category,
        image.mimeType,
        keyContext,
      );
      const bucket =
        categoryConfig.visibility === 'public'
          ? deps.config.publicBucket
          : deps.config.privateBucket;
      await deps.r2.putObject(bucket, objectKey, image.mimeType, image.bytes);
      if (!(await deps.r2.headObject(bucket, objectKey))) {
        throw new Error('Storage verification failed');
      }
      const response: StorageResponse = {
        objectKey,
        ...(categoryConfig.visibility === 'public'
          ? { publicUrl: deps.r2.publicUrl(objectKey) }
          : {}),
      };
      return json(response);
    }

    const categoryConfig = ASSET_CATEGORIES[body.category];
    const normalizedMime = body.mimeType;
    const keyContext =
      body.category === 'receipt'
        ? { ...body.context, ownerId: actor.id }
        : body.context;
    const objectKey = deps.r2.createObjectKey(body.category, normalizedMime, keyContext);
    const bucket =
      categoryConfig.visibility === 'public'
        ? deps.config.publicBucket
        : deps.config.privateBucket;
    const uploadUrl = await deps.r2.signPut(
      bucket,
      objectKey,
      normalizedMime,
      GRANT_EXPIRY_SECONDS,
    );
    const response: StorageResponse = {
      uploadUrl,
      objectKey,
      ...(categoryConfig.visibility === 'public'
        ? { publicUrl: deps.r2.publicUrl(objectKey) }
        : {}),
      expiresAt: clock() + GRANT_EXPIRY_SECONDS * 1_000,
    };
    return json(response);
  };

  return async (request: Request): Promise<Response> => {
    try {
      return await handle(request);
    } catch {
      return json({ error: 'Storage operation failed' }, 500);
    }
  };
}

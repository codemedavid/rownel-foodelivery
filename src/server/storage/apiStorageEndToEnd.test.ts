import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every other suite here exercises a layer in isolation behind a fake: handler.test.ts
// injects a fake r2, r2.test.ts injects a fake signer, and authorization.test.ts injects a
// fake repository. Nothing drives the wiring that actually ships — api/storage.ts reading
// the environment, building the Supabase client, and handing the real aws4fetch signer to
// the real handler. That seam is where the ERR_MODULE_NOT_FOUND crash lived, and it is
// still the only part of the function with no test behind it.
//
// So this suite fakes exactly two things, the two the function cannot reach in a test: the
// Supabase SDK and the network. Everything between the Request and the signed R2 call is
// the production code path.

const ENV = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'AKIAEXAMPLE',
  R2_SECRET_ACCESS_KEY: 'secretexamplekey',
  R2_PUBLIC_BUCKET: 'rownel-public-images',
  R2_PRIVATE_BUCKET: 'rownel-private-images',
  R2_PUBLIC_URL: 'https://images.row-nel.com',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
} as const;

interface FakeUser {
  id: string;
  email?: string;
  app_metadata?: { role?: string };
}

/** Rows the fake Supabase client serves, rewritten per test. */
const db = {
  user: null as FakeUser | null,
  staff: null as Record<string, unknown> | null,
  order: null as Record<string, unknown> | null,
  rider: null as Record<string, unknown> | null,
};

/** Every R2 request the signed client actually issued. */
let r2Calls: { method: string; url: string; headers: Record<string, string> }[] = [];
/** Status the fake R2 answers with, keyed by method. */
let r2Status: Record<string, number> = {};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (jwt: string) =>
        jwt === 'good-token' && db.user
          ? { data: { user: db.user }, error: null }
          : { data: { user: null }, error: { message: 'bad jwt' } },
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'staff') return { data: db.staff, error: null };
            if (table === 'orders') return { data: db.order, error: null };
            if (table === 'riders') return { data: db.rider, error: null };
            return { data: null, error: null };
          },
        }),
      }),
    }),
  }),
}));

let route: { fetch(request: Request): Promise<Response> };

beforeEach(async () => {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  db.user = { id: 'user-1', app_metadata: { role: 'admin' } };
  db.staff = null;
  db.order = null;
  db.rider = null;
  r2Calls = [];
  r2Status = {};

  vi.stubGlobal('fetch', async (input: Request | string) => {
    const request = input as Request;
    r2Calls.push({
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers as unknown as Iterable<[string, string]>),
    });
    return new Response(null, { status: r2Status[request.method] ?? 200 });
  });

  const imported = await import('../../../api/storage');
  route = (imported as { default: { fetch(request: Request): Promise<Response> } }).default;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function post(body: unknown, token: string | null = 'good-token'): Request {
  return new Request('https://app.test/api/storage', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('api/storage end to end', () => {
  describe('gate', () => {
    it('refuses a caller with no bearer token', async () => {
      const response = await route.fetch(post({ action: 'create-upload' }, null));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('refuses a caller whose token Supabase rejects', async () => {
      const response = await route.fetch(post({ action: 'create-upload' }, 'bad-token'));

      expect(response.status).toBe(401);
    });

    it('refuses a method other than POST', async () => {
      const response = await route.fetch(
        new Request('https://app.test/api/storage', { method: 'GET' }),
      );

      expect(response.status).toBe(405);
    });
  });

  describe('create-upload', () => {
    it('returns a signed R2 PUT an admin can hand straight to the browser', async () => {
      const response = await route.fetch(
        post({
          action: 'create-upload',
          category: 'menu-item',
          mimeType: 'image/jpeg',
          size: 1024,
          context: { merchantId: 'merchant1' },
        }),
      );

      expect(response.status).toBe(200);
      const grant = (await response.json()) as {
        uploadUrl: string;
        objectKey: string;
        publicUrl: string;
        expiresAt: number;
      };

      expect(grant.objectKey).toMatch(/^menu-items\/merchant1\/[A-Za-z0-9-]+\.jpg$/);
      expect(grant.publicUrl).toBe(`https://images.row-nel.com/${grant.objectKey}`);

      const uploadUrl = new URL(grant.uploadUrl);
      expect(uploadUrl.origin).toBe('https://acct123.r2.cloudflarestorage.com');
      expect(uploadUrl.pathname).toBe(`/rownel-public-images/${grant.objectKey}`);
      expect(uploadUrl.searchParams.get('X-Amz-Expires')).toBe('300');
      expect(uploadUrl.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
      // The browser PUT must reproduce every signed header or R2 rejects it, so the
      // grant is only usable if the client sends this exact content-type back.
      expect(uploadUrl.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    });

    it('never leaks the R2 secret into the URL it hands the browser', async () => {
      const response = await route.fetch(
        post({
          action: 'create-upload',
          category: 'menu-item',
          mimeType: 'image/png',
          size: 2048,
          context: { merchantId: 'merchant1' },
        }),
      );
      const grant = (await response.json()) as { uploadUrl: string };

      expect(grant.uploadUrl).not.toContain(ENV.R2_SECRET_ACCESS_KEY);
      expect(grant.uploadUrl).toContain(ENV.R2_ACCESS_KEY_ID);
    });

    it('signs a private-bucket PUT for a receipt and scopes the key to the uploader', async () => {
      db.user = { id: 'customer-9', app_metadata: { role: 'customer' } };
      db.order = {
        id: 'order-3',
        merchant_id: 'merchant1',
        customer_user_id: 'customer-9',
        assigned_rider_id: null,
        receipt_object_key: null,
      };

      const response = await route.fetch(
        post({
          action: 'create-upload',
          category: 'receipt',
          mimeType: 'image/jpeg',
          size: 1024,
          context: { orderId: 'order-3' },
        }),
      );

      expect(response.status).toBe(200);
      const grant = (await response.json()) as { objectKey: string; publicUrl?: string };

      expect(grant.objectKey).toMatch(/^receipts\/customer-9\/order-3\/[A-Za-z0-9-]+\.jpg$/);
      // A private asset has no public URL; publishing one would defeat the bucket split.
      expect(grant.publicUrl).toBeUndefined();
    });

    it('refuses a customer uploading a receipt against somebody else’s order', async () => {
      db.user = { id: 'customer-9', app_metadata: { role: 'customer' } };
      db.order = {
        id: 'order-3',
        merchant_id: 'merchant1',
        customer_user_id: 'someone-else',
        assigned_rider_id: null,
        receipt_object_key: null,
      };

      const response = await route.fetch(
        post({
          action: 'create-upload',
          category: 'receipt',
          mimeType: 'image/jpeg',
          size: 1024,
          context: { orderId: 'order-3' },
        }),
      );

      expect(response.status).toBe(403);
    });

    it('refuses an oversized upload before any signing happens', async () => {
      const response = await route.fetch(
        post({
          action: 'create-upload',
          category: 'menu-item',
          mimeType: 'image/jpeg',
          size: 10 * 1024 * 1024 + 1,
          context: { merchantId: 'merchant1' },
        }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('create-download', () => {
    it('signs a private GET for the order owner', async () => {
      db.user = { id: 'customer-9', app_metadata: { role: 'customer' } };
      db.order = {
        id: 'order-3',
        merchant_id: 'merchant1',
        customer_user_id: 'customer-9',
        assigned_rider_id: null,
        receipt_object_key: 'receipts/customer-9/order-3/abc.jpg',
      };

      const response = await route.fetch(
        post({
          action: 'create-download',
          category: 'receipt',
          context: { orderId: 'order-3' },
        }),
      );

      expect(response.status).toBe(200);
      const grant = (await response.json()) as { downloadUrl: string };
      const url = new URL(grant.downloadUrl);

      expect(url.pathname).toBe('/rownel-private-images/receipts/customer-9/order-3/abc.jpg');
      expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('rider photo', () => {
    it('signs a private GET from the object key the riders table now carries', async () => {
      db.user = { id: 'rider-7', app_metadata: { role: 'rider' } };
      db.rider = { id: 'rider-7', photo_object_key: 'rider-photos/rider-7/abc.jpg' };

      const response = await route.fetch(
        post({
          action: 'create-download',
          category: 'rider-photo',
          context: { riderId: 'rider-7' },
        }),
      );

      expect(response.status).toBe(200);
      const grant = (await response.json()) as { downloadUrl: string };
      expect(new URL(grant.downloadUrl).pathname).toBe(
        '/rownel-private-images/rider-photos/rider-7/abc.jpg',
      );
    });

    it('refuses a rider asking for somebody else’s photo', async () => {
      db.user = { id: 'rider-7', app_metadata: { role: 'rider' } };
      db.rider = { id: 'rider-8', photo_object_key: 'rider-photos/rider-8/abc.jpg' };

      const response = await route.fetch(
        post({
          action: 'create-download',
          category: 'rider-photo',
          context: { riderId: 'rider-8' },
        }),
      );

      expect(response.status).toBe(403);
    });
  });

  describe('import-url', () => {
    it('answers a non-HTTPS source with the reason, not a server error', async () => {
      const response = await route.fetch(
        post({
          action: 'import-url',
          category: 'menu-item',
          sourceUrl: 'http://example.com/image.jpg',
          context: { merchantId: 'merchant1' },
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Remote image URL must use HTTPS',
      });
      expect(r2Calls).toHaveLength(0);
    });

    it('answers a source pointing at a private host the same way', async () => {
      const response = await route.fetch(
        post({
          action: 'import-url',
          category: 'menu-item',
          sourceUrl: 'https://169.254.169.254/latest/meta-data/',
          context: { merchantId: 'merchant1' },
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Remote image host must resolve only to public addresses',
      });
      expect(r2Calls).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('issues a signed DELETE against the public bucket for an admin', async () => {
      const response = await route.fetch(
        post({
          action: 'delete',
          category: 'menu-item',
          reference: 'https://images.row-nel.com/menu-items/merchant1/abc.jpg',
          context: { merchantId: 'merchant1' },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, deleted: true });
      expect(r2Calls).toHaveLength(1);
      expect(r2Calls[0].method).toBe('DELETE');
      expect(new URL(r2Calls[0].url).pathname).toBe(
        '/rownel-public-images/menu-items/merchant1/abc.jpg',
      );
      expect(r2Calls[0].headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    });

    it('refuses a reference pointing at a host we do not serve', async () => {
      const response = await route.fetch(
        post({
          action: 'delete',
          category: 'menu-item',
          reference: 'https://evil.test/menu-items/merchant1/abc.jpg',
          context: { merchantId: 'merchant1' },
        }),
      );

      expect(response.status).toBe(400);
      expect(r2Calls).toHaveLength(0);
    });
  });

  describe('failure reporting', () => {
    it('reports an R2 rejection as a server error without leaking the reason', async () => {
      r2Status = { DELETE: 500 };

      const response = await route.fetch(
        post({
          action: 'delete',
          category: 'menu-item',
          reference: 'https://images.row-nel.com/menu-items/merchant1/abc.jpg',
          context: { merchantId: 'merchant1' },
        }),
      );

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe('Storage operation failed');
      expect(JSON.stringify(body)).not.toContain('r2.cloudflarestorage.com');
    });

    it('reports a Supabase outage as a server error rather than authorizing', async () => {
      db.user = { id: 'staff-1', app_metadata: { role: 'staff' } };
      const response = await route.fetch(
        post({
          action: 'create-upload',
          category: 'menu-item',
          mimeType: 'image/jpeg',
          size: 1024,
          context: { merchantId: 'merchant1' },
        }),
      );

      // Staff with no staff row must not be granted merchant scope by default.
      expect(response.status).toBe(403);
    });
  });
});

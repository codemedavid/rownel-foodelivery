import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import {
  type StorageActor,
  type StorageRepository,
} from '../src/server/storage/authorization';
import { createStorageHandler } from '../src/server/storage/handler';
import { createR2Store, type R2Config } from '../src/server/storage/r2';
import { fetchRemoteImage as fetchRemoteImageFromUrl } from '../src/server/storage/remoteImport';

export const config = { runtime: 'edge' };

const LEGACY_ADMIN_EMAIL = 'admin@clickeats.com';
const CLOUDFLARE_DOH_URL = 'https://cloudflare-dns.com/dns-query';

interface ServerConfig extends R2Config {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function readServerConfig(): ServerConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicBucket = process.env.R2_PUBLIC_BUCKET;
  const privateBucket = process.env.R2_PRIVATE_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicBucket ||
    !privateBucket ||
    !publicUrl ||
    !supabaseUrl ||
    !supabaseServiceRoleKey
  ) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    publicBucket,
    privateBucket,
    publicUrl,
    supabaseUrl,
    supabaseServiceRoleKey,
  };
}

function actorForUser(user: User): StorageActor {
  const metadataRole = user.app_metadata?.role;
  if (
    metadataRole === 'admin' ||
    user.email?.toLowerCase() === LEGACY_ADMIN_EMAIL
  ) {
    return { id: user.id, role: 'admin' };
  }
  if (metadataRole === 'staff' || metadataRole === 'rider') {
    return { id: user.id, role: metadataRole };
  }
  return { id: user.id, role: 'customer' };
}

function createRepository(admin: SupabaseClient): StorageRepository {
  return {
    async getStaff(userId) {
      const { data, error } = await admin
        .from('staff')
        .select('is_active,all_merchants,merchant_ids')
        .eq('supabase_user_id', userId)
        .maybeSingle();
      if (error) throw new Error('Storage repository query failed');
      if (!data) return null;
      return {
        active: Boolean(data.is_active),
        allMerchants: Boolean(data.all_merchants),
        merchantIds: Array.isArray(data.merchant_ids) ? data.merchant_ids : [],
      };
    },

    async getOrder(orderId) {
      const { data, error } = await admin
        .from('orders')
        .select('id,merchant_id,customer_user_id,assigned_rider_id,receipt_object_key')
        .eq('id', orderId)
        .maybeSingle();
      if (error) throw new Error('Storage repository query failed');
      if (!data) return null;
      return {
        id: data.id,
        merchantId: data.merchant_id,
        customerUserId: data.customer_user_id ?? null,
        assignedRiderId: data.assigned_rider_id ?? null,
        receiptObjectKey: data.receipt_object_key ?? null,
      };
    },

    async getRider(riderId) {
      const { data, error } = await admin
        .from('riders')
        .select('id,photo_object_key')
        .eq('id', riderId)
        .maybeSingle();
      if (error) throw new Error('Storage repository query failed');
      if (!data) return null;
      return {
        id: data.id,
        photoObjectKey: data.photo_object_key ?? null,
      };
    },
  };
}

interface DnsJsonAnswer {
  type?: unknown;
  data?: unknown;
}

interface DnsJsonResponse {
  Answer?: unknown;
}

async function resolveDnsRecord(hostname: string, type: 'A' | 'AAAA'): Promise<string[]> {
  const url = new URL(CLOUDFLARE_DOH_URL);
  url.searchParams.set('name', hostname);
  url.searchParams.set('type', type);
  const response = await globalThis.fetch(url.toString(), {
    headers: { accept: 'application/dns-json' },
    credentials: 'omit',
  });
  if (!response.ok) throw new Error('DNS resolution failed');

  const payload = (await response.json()) as DnsJsonResponse;
  if (payload.Answer === undefined) return [];
  if (!Array.isArray(payload.Answer)) throw new Error('DNS resolution failed');
  const expectedType = type === 'A' ? 1 : 28;
  return (payload.Answer as DnsJsonAnswer[])
    .filter(
      (answer): answer is DnsJsonAnswer & { data: string } =>
        answer?.type === expectedType && typeof answer.data === 'string',
    )
    .map((answer) => answer.data);
}

async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  const [ipv4, ipv6] = await Promise.all([
    resolveDnsRecord(hostname, 'A'),
    resolveDnsRecord(hostname, 'AAAA'),
  ]);
  return [...ipv4, ...ipv6];
}

export default async function handler(request: Request): Promise<Response> {
  const serverConfig = readServerConfig();
  if (!serverConfig) return json({ error: 'Storage service is not configured' }, 500);

  try {
    const admin = createClient(
      serverConfig.supabaseUrl,
      serverConfig.supabaseServiceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const repository = createRepository(admin);
    const r2 = createR2Store(serverConfig);
    return await createStorageHandler({
      async authenticate(jwt) {
        const { data, error } = await admin.auth.getUser(jwt);
        if (error || !data.user) return null;
        return actorForUser(data.user);
      },
      repository,
      r2,
      fetchRemoteImage(sourceUrl) {
        return fetchRemoteImageFromUrl(sourceUrl, {
          fetch: globalThis.fetch,
          resolvePublicAddresses,
        });
      },
      config: {
        publicBucket: serverConfig.publicBucket,
        privateBucket: serverConfig.privateBucket,
        publicUrl: serverConfig.publicUrl,
      },
    })(request);
  } catch {
    return json({ error: 'Storage operation failed' }, 500);
  }
}

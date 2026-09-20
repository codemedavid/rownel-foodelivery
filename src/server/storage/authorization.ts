import {
  ASSET_CATEGORIES,
  type AssetCategory,
  type StorageContext,
} from '../../lib/storageTypes.js';

export interface StorageActor {
  id: string;
  role: 'admin' | 'staff' | 'rider' | 'customer';
}

export type StorageAction = 'create-upload' | 'create-download' | 'delete' | 'import-url';

export interface StaffAccess {
  active: boolean;
  allMerchants: boolean;
  merchantIds: string[];
}

export interface OrderStorageRecord {
  id: string;
  merchantId: string;
  customerUserId: string | null;
  assignedRiderId: string | null;
  receiptObjectKey: string | null;
}

export interface RiderStorageRecord {
  id: string;
  photoObjectKey: string | null;
}

export interface StorageRepository {
  getStaff(userId: string): Promise<StaffAccess | null>;
  getOrder(orderId: string): Promise<OrderStorageRecord | null>;
  getRider(riderId: string): Promise<RiderStorageRecord | null>;
}

export type AuthorizationResult = { allowed: true; objectKey?: string } | { allowed: false };

const ALLOWED: AuthorizationResult = { allowed: true };
const DENIED: AuthorizationResult = { allowed: false };
const PUBLIC_MUTATIONS: readonly StorageAction[] = ['create-upload', 'import-url', 'delete'];
const GLOBAL_PUBLIC_CATEGORIES: readonly AssetCategory[] = ['site-logo', 'promotion'];

async function hasMerchantAccess(
  repo: StorageRepository,
  userId: string,
  merchantId: string,
): Promise<boolean> {
  const access = await repo.getStaff(userId);
  return Boolean(
    access?.active && (access.allMerchants || access.merchantIds.includes(merchantId)),
  );
}

async function authorizeRiderPhoto(
  repo: StorageRepository,
  actor: StorageActor,
  action: StorageAction,
  context: StorageContext,
): Promise<AuthorizationResult> {
  if (!context.riderId) return DENIED;

  if (action !== 'create-download') {
    if (!PUBLIC_MUTATIONS.includes(action)) return DENIED;
    if (actor.role === 'admin') return ALLOWED;
    return actor.role === 'rider' && actor.id === context.riderId ? ALLOWED : DENIED;
  }

  if (actor.role === 'customer' && !context.orderId) return DENIED;
  if (actor.role === 'rider' && actor.id !== context.riderId) return DENIED;
  const rider = await repo.getRider(context.riderId);
  if (!rider?.photoObjectKey) return DENIED;

  if (actor.role === 'admin' || (actor.role === 'rider' && actor.id === context.riderId)) {
    return { allowed: true, objectKey: rider.photoObjectKey };
  }
  if (actor.role === 'staff') {
    const access = await repo.getStaff(actor.id);
    return access?.active
      ? { allowed: true, objectKey: rider.photoObjectKey }
      : DENIED;
  }
  if (actor.role === 'customer') {
    const orderId = context.orderId;
    if (!orderId) return DENIED;
    const order = await repo.getOrder(orderId);
    if (
      order?.customerUserId === actor.id &&
      order.assignedRiderId === context.riderId
    ) {
      return { allowed: true, objectKey: rider.photoObjectKey };
    }
  }

  return DENIED;
}

async function authorizeReceipt(
  repo: StorageRepository,
  actor: StorageActor,
  action: StorageAction,
  context: StorageContext,
): Promise<AuthorizationResult> {
  if (!context.orderId) return DENIED;

  if (action === 'create-upload' || action === 'import-url') {
    if (actor.role !== 'admin' && actor.role !== 'customer') return DENIED;
    const order = await repo.getOrder(context.orderId);
    if (!order) return DENIED;
    return actor.role === 'admin' || order.customerUserId === actor.id ? ALLOWED : DENIED;
  }

  if (action !== 'create-download' && action !== 'delete') return DENIED;
  if (actor.role === 'rider') return DENIED;
  const order = await repo.getOrder(context.orderId);
  if (!order) return DENIED;
  const receiptObjectKey = order.receiptObjectKey;
  if (action === 'create-download' && !receiptObjectKey) return DENIED;

  let authorized = actor.role === 'admin';
  if (actor.role === 'customer') authorized = order.customerUserId === actor.id;
  if (actor.role === 'staff') {
    authorized = await hasMerchantAccess(repo, actor.id, order.merchantId);
  }
  if (!authorized) return DENIED;

  if (action === 'create-download') {
    if (!receiptObjectKey) return DENIED;
    return { allowed: true, objectKey: receiptObjectKey };
  }
  return ALLOWED;
}

export async function authorizeStorageAction(
  repo: StorageRepository,
  actor: StorageActor,
  action: StorageAction,
  category: AssetCategory,
  context: StorageContext,
): Promise<AuthorizationResult> {
  if (!Object.prototype.hasOwnProperty.call(ASSET_CATEGORIES, category)) return DENIED;

  if (ASSET_CATEGORIES[category].visibility === 'public') {
    if (!PUBLIC_MUTATIONS.includes(action)) return DENIED;
    if (actor.role === 'admin') return ALLOWED;
    if (GLOBAL_PUBLIC_CATEGORIES.includes(category)) return DENIED;
    if (actor.role !== 'staff' || !context.merchantId) return DENIED;
    if (await hasMerchantAccess(repo, actor.id, context.merchantId)) return ALLOWED;
  }

  if (category === 'rider-photo') {
    return authorizeRiderPhoto(repo, actor, action, context);
  }

  if (category === 'receipt') {
    return authorizeReceipt(repo, actor, action, context);
  }

  return DENIED;
}

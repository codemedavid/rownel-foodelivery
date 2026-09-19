export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type AssetCategory =
  | 'menu-item'
  | 'merchant-logo'
  | 'merchant-cover'
  | 'site-logo'
  | 'promotion'
  | 'payment-qr'
  | 'receipt'
  | 'rider-photo';

export type AssetVisibility = 'public' | 'private';

export const ASSET_CATEGORIES: Record<
  AssetCategory,
  { visibility: AssetVisibility; prefix: string }
> = {
  'menu-item': { visibility: 'public', prefix: 'menu-items' },
  'merchant-logo': { visibility: 'public', prefix: 'merchants/logos' },
  'merchant-cover': { visibility: 'public', prefix: 'merchants/covers' },
  'site-logo': { visibility: 'public', prefix: 'site/logo' },
  promotion: { visibility: 'public', prefix: 'promotions' },
  'payment-qr': { visibility: 'public', prefix: 'payment-methods' },
  receipt: { visibility: 'private', prefix: 'receipts' },
  'rider-photo': { visibility: 'private', prefix: 'rider-photos' },
};

export interface StorageContext {
  merchantId?: string;
  orderId?: string;
  riderId?: string;
}

export interface ImageTransform {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'jpg' | 'png';
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  dpr?: number;
}

export interface UploadGrant {
  uploadUrl: string;
  objectKey: string;
  /**
   * The exact Content-Type the PUT must carry. It is signed into the upload URL, so R2
   * rejects the upload if the browser sends anything else — including the same type in a
   * different case. Always send this value rather than the one you asked for.
   */
  mimeType: string;
  publicUrl?: string;
  expiresAt: number;
}

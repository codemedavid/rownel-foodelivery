/**
 * Pure logic for the catalog image-sourcing pipeline.
 *
 * The catalog holds one row per merchant branch, so the same product appears
 * many times over ("Palabok" at eight Jollibee branches). Everything here works
 * on a *manifest* keyed by brand + product, so each photo is sourced, reviewed
 * and uploaded once, then fanned back out to every row that shares it.
 *
 * All transitions return new objects; nothing here mutates its input.
 */

/** Chains that operate multiple branches. The branch suffix is not part of the product identity. */
const KNOWN_BRANDS = [
  "Pareng Jay's Lechon",
  'Chooks-to-Go',
  'Kapyem Coffee',
  'Minute Burger',
  'Potato Corner',
  'Mang Inasal',
  'Red Ribbon',
  'Goldilocks',
  'Shawarma Shack',
  'Big Brew',
  'Don Benitos',
  'Jollibee',
  'Chowking',
  'Andoks',
  'Choylin',
  'Bontea',
  'McDo',
  'Mrs G',
] as const;

/**
 * Cloudinary cloud `dnxwoqezb` was disabled, so every asset on it now answers
 * 401 (`x-cld-error: cloud_name dnxwoqezb is disabled`). Those URLs are still
 * stored on the rows, but they render nothing — the pipeline has to read them
 * as an empty slot, not as a photo worth protecting.
 */
const DISABLED_CLOUDINARY_CLOUDS = ['dnxwoqezb'] as const;

/** Which merchant column a `<id>::<suffix>` pseudo-row writes back to. */
const MERCHANT_COLUMN_BY_SUFFIX = {
  logo: 'logo_url',
  cover: 'cover_image_url',
} as const;

/** Ranked best-first: an official brand asset always outranks a scraped one. */
const CONFIDENCE_RANK: Record<CandidateConfidence, number> = {
  official: 0,
  likely: 1,
  generic: 2,
};

export type CandidateConfidence = 'official' | 'likely' | 'generic';

export type ManifestStatus =
  | 'needs-candidates'
  | 'pending-review'
  | 'approved'
  | 'rejected'
  | 'no-candidate'
  | 'uploaded'
  | 'withheld';

export interface CatalogMerchant {
  id: string;
  name: string;
}

export interface CatalogItemRow {
  id: string;
  name: string;
  merchantId: string;
  imageUrl: string | null;
}

export interface ImageCandidate {
  url: string;
  source: string;
  confidence: CandidateConfidence;
}

export interface ManifestEntry {
  key: string;
  brand: string;
  productName: string;
  rowIds: string[];
  candidates: ImageCandidate[];
  chosenUrl: string | null;
  imagekitUrl: string | null;
  status: ManifestStatus;
  /** Rows this entry may write to. Absent means every row in `rowIds`. */
  targetRowIds?: string[];
}

export interface RowUpdate {
  rowId: string;
  imageUrl: string | null;
}

export type MerchantImageColumn = (typeof MERCHANT_COLUMN_BY_SUFFIX)[keyof typeof MERCHANT_COLUMN_BY_SUFFIX];

export interface MerchantRowUpdate {
  merchantId: string;
  column: MerchantImageColumn;
  imageUrl: string | null;
}

/**
 * Whether a stored URL still renders. A slot pointing at a disabled cloud is
 * indistinguishable from an empty one for every decision the pipeline makes.
 */
export const isLiveImageUrl = (url: string | null | undefined): boolean => {
  if (!url || !url.trim()) return false;
  return !DISABLED_CLOUDINARY_CLOUDS.some((cloud) => url.includes(`res.cloudinary.com/${cloud}/`));
};

/** Splits a merchant pseudo-row id into the merchant and the column it targets. */
export const parseMerchantRowId = (
  rowId: string,
): { merchantId: string; column: MerchantImageColumn } | null => {
  const separator = rowId.lastIndexOf('::');
  if (separator < 0) return null;

  const suffix = rowId.slice(separator + 2);
  const column = MERCHANT_COLUMN_BY_SUFFIX[suffix as keyof typeof MERCHANT_COLUMN_BY_SUFFIX];
  if (!column) return null;

  return { merchantId: rowId.slice(0, separator), column };
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Resolves a merchant name to its chain brand, or the merchant itself when independent. */
export const deriveBrand = (merchantName: string): string => {
  const trimmed = merchantName.trim();
  const match = KNOWN_BRANDS.find((brand) => trimmed.toLowerCase().startsWith(brand.toLowerCase()));
  return match ?? trimmed;
};

export const buildProductKey = (brand: string, productName: string): string =>
  `${slugify(brand)}::${slugify(productName)}`;

/** Collapses catalog rows into one entry per brand + product, preserving row order. */
export const buildManifest = (merchants: CatalogMerchant[], items: CatalogItemRow[]): ManifestEntry[] => {
  const brandByMerchantId = new Map(merchants.map((m) => [m.id, deriveBrand(m.name)]));
  const entries = new Map<string, ManifestEntry>();

  for (const item of items) {
    const brand = brandByMerchantId.get(item.merchantId);
    if (!brand || !item.name.trim()) continue;

    const key = buildProductKey(brand, item.name);
    const existing = entries.get(key);

    if (existing) {
      entries.set(key, { ...existing, rowIds: [...existing.rowIds, item.id] });
      continue;
    }

    entries.set(key, {
      key,
      brand,
      productName: item.name.trim(),
      rowIds: [item.id],
      candidates: [],
      chosenUrl: null,
      imagekitUrl: null,
      status: 'needs-candidates',
    });
  }

  return [...entries.values()];
};

/** Attaches search results, ranked best-first, and parks the entry for human review. */
export const withCandidates = (entry: ManifestEntry, candidates: ImageCandidate[]): ManifestEntry => {
  const seen = new Set<string>();
  const unique = candidates.filter((c) => !seen.has(c.url) && seen.add(c.url));
  const ranked = [...unique].sort((a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]);

  if (ranked.length === 0) {
    return { ...entry, candidates: [], chosenUrl: null, status: 'no-candidate' };
  }

  return { ...entry, candidates: ranked, chosenUrl: ranked[0].url, status: 'pending-review' };
};

/** Records the CDN URL for an approved entry. Approval is the gate; this enforces it. */
export const withUpload = (entry: ManifestEntry, imagekitUrl: string): ManifestEntry => {
  if (entry.status !== 'approved') {
    throw new Error(`Cannot upload "${entry.key}": status is "${entry.status}", expected "approved".`);
  }
  return { ...entry, imagekitUrl, status: 'uploaded' };
};

/**
 * Applies the review policy that a brand-accurate photo may replace anything,
 * but a merely generic one may only fill an empty slot — overwriting a
 * merchant's real photo of their real dish with stock imagery is a downgrade.
 */
export const autoApprove = (manifest: ManifestEntry[], items: CatalogItemRow[]): ManifestEntry[] => {
  const hasImageByRowId = new Map(items.map((item) => [item.id, isLiveImageUrl(item.imageUrl)]));

  return manifest.map((entry) => {
    if (entry.status !== 'pending-review') return entry;

    const topConfidence = entry.candidates[0]?.confidence;
    if (topConfidence !== 'generic') {
      return { ...entry, status: 'approved', targetRowIds: [...entry.rowIds] };
    }

    const emptyRowIds = entry.rowIds.filter((rowId) => !hasImageByRowId.get(rowId));
    if (emptyRowIds.length === 0) {
      return { ...entry, status: 'rejected', targetRowIds: [] };
    }
    return { ...entry, status: 'approved', targetRowIds: emptyRowIds };
  });
};

/**
 * Holds uploaded generic-tier entries back from the database write. The asset
 * stays on the CDN and the URL is kept, so re-approving one later costs nothing.
 */
export const withholdGeneric = (manifest: ManifestEntry[]): ManifestEntry[] =>
  manifest.map((entry) =>
    entry.status === 'uploaded' && entry.candidates[0]?.confidence === 'generic'
      ? { ...entry, status: 'withheld' }
      : entry,
  );

export const selectPendingReview = (manifest: ManifestEntry[]): ManifestEntry[] =>
  manifest.filter((entry) => entry.status === 'pending-review');

export const selectPendingUploads = (manifest: ManifestEntry[]): ManifestEntry[] =>
  manifest.filter((entry) => entry.status === 'approved' && Boolean(entry.chosenUrl));

/** Expands uploaded entries back into one update per catalog row. */
export const buildRowUpdates = (manifest: ManifestEntry[]): RowUpdate[] =>
  manifest
    .filter((entry) => entry.status === 'uploaded' && entry.imagekitUrl)
    .flatMap((entry) =>
      (entry.targetRowIds ?? entry.rowIds).map((rowId) => ({ rowId, imageUrl: entry.imagekitUrl as string })),
    );

/** Expands uploaded entries into merchant column writes, dropping unroutable row ids. */
export const buildMerchantRowUpdates = (manifest: ManifestEntry[]): MerchantRowUpdate[] =>
  manifest
    .filter((entry) => entry.status === 'uploaded' && entry.imagekitUrl)
    .flatMap((entry) =>
      (entry.targetRowIds ?? entry.rowIds).flatMap((rowId) => {
        const target = parseMerchantRowId(rowId);
        if (!target) return [];
        return [{ ...target, imageUrl: entry.imagekitUrl as string }];
      }),
    );

/** Snapshots the current URL of every row an update would overwrite. */
export const buildRollback = (updates: RowUpdate[], items: CatalogItemRow[]): RowUpdate[] => {
  const imageUrlByRowId = new Map(items.map((item) => [item.id, item.imageUrl]));
  return updates
    .filter((update) => imageUrlByRowId.has(update.rowId))
    .map((update) => ({ rowId: update.rowId, imageUrl: imageUrlByRowId.get(update.rowId) ?? null }));
};

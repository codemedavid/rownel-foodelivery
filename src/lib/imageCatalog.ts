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
  | 'uploaded';

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
}

export interface RowUpdate {
  rowId: string;
  imageUrl: string | null;
}

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

export const selectPendingReview = (manifest: ManifestEntry[]): ManifestEntry[] =>
  manifest.filter((entry) => entry.status === 'pending-review');

export const selectPendingUploads = (manifest: ManifestEntry[]): ManifestEntry[] =>
  manifest.filter((entry) => entry.status === 'approved' && Boolean(entry.chosenUrl));

/** Expands uploaded entries back into one update per catalog row. */
export const buildRowUpdates = (manifest: ManifestEntry[]): RowUpdate[] =>
  manifest
    .filter((entry) => entry.status === 'uploaded' && entry.imagekitUrl)
    .flatMap((entry) => entry.rowIds.map((rowId) => ({ rowId, imageUrl: entry.imagekitUrl as string })));

/** Snapshots the current URL of every row an update would overwrite. */
export const buildRollback = (updates: RowUpdate[], items: CatalogItemRow[]): RowUpdate[] => {
  const imageUrlByRowId = new Map(items.map((item) => [item.id, item.imageUrl]));
  return updates
    .filter((update) => imageUrlByRowId.has(update.rowId))
    .map((update) => ({ rowId: update.rowId, imageUrl: imageUrlByRowId.get(update.rowId) ?? null }));
};

import { describe, it, expect } from 'vitest';
import {
  deriveBrand,
  buildProductKey,
  buildManifest,
  withCandidates,
  withUpload,
  autoApprove,
  withholdGeneric,
  selectPendingUploads,
  selectPendingReview,
  buildRowUpdates,
  buildRollback,
  type CatalogItemRow,
  type CatalogMerchant,
  type ImageCandidate,
  type ManifestEntry,
} from './imageCatalog';

const merchants: CatalogMerchant[] = [
  { id: 'm-jb-bangued', name: 'Jollibee Bangued' },
  { id: 'm-jb-candon', name: 'Jollibee Candon' },
  { id: 'm-kusina', name: 'Kusina ni Maria' },
];

const items: CatalogItemRow[] = [
  { id: 'i1', name: '1pc Chickenjoy', merchantId: 'm-jb-bangued', imageUrl: 'https://old.example/a.jpg' },
  { id: 'i2', name: '1pc Chickenjoy', merchantId: 'm-jb-candon', imageUrl: null },
  { id: 'i3', name: 'Sinigang', merchantId: 'm-kusina', imageUrl: 'https://old.example/b.jpg' },
];

const candidate = (url: string, confidence: ImageCandidate['confidence'], source = 'example.com'): ImageCandidate => ({
  url,
  source,
  confidence,
});

const entryFor = (key: string, manifest: ManifestEntry[]): ManifestEntry => {
  const found = manifest.find((e) => e.key === key);
  if (!found) throw new Error(`no manifest entry for ${key}`);
  return found;
};

describe('deriveBrand', () => {
  it('strips the branch suffix from a known chain', () => {
    expect(deriveBrand('Jollibee Bangued')).toBe('Jollibee');
  });

  it('recognises a multi-word chain name', () => {
    expect(deriveBrand('Mang Inasal Bacnotan')).toBe('Mang Inasal');
  });

  it.each([
    ['Red Ribbon Bauang', 'Red Ribbon'],
    ['Goldilocks Naguilian', 'Goldilocks'],
    ['Kapyem Coffee Luna Main', 'Kapyem Coffee'],
    ['Potato Corner Naguilian', 'Potato Corner'],
    ['Minute Burger Naguilian', 'Minute Burger'],
    ["Pareng Jay's Lechon (Luna)", "Pareng Jay's Lechon"],
  ])('collapses branches of %s onto one brand', (merchantName, expected) => {
    expect(deriveBrand(merchantName)).toBe(expected);
  });

  it('keeps the full name for an independent merchant', () => {
    expect(deriveBrand('Kusina ni Maria')).toBe('Kusina ni Maria');
  });

  it('trims surrounding whitespace', () => {
    expect(deriveBrand('  Chowking Bauang  ')).toBe('Chowking');
  });
});

describe('buildProductKey', () => {
  it('joins slugified brand and product', () => {
    expect(buildProductKey('Jollibee', '1pc Chickenjoy')).toBe('jollibee::1pc-chickenjoy');
  });

  it('is stable across casing and punctuation differences', () => {
    expect(buildProductKey('Jollibee', 'Palabok Fiesta!')).toBe(buildProductKey('jollibee', '  palabok   fiesta '));
  });
});

describe('buildManifest', () => {
  it('collapses the same product across branches into one entry', () => {
    const manifest = buildManifest(merchants, items);
    expect(manifest).toHaveLength(2);
    expect(entryFor('jollibee::1pc-chickenjoy', manifest).rowIds).toEqual(['i1', 'i2']);
  });

  it('records the brand and a readable product name', () => {
    const entry = entryFor('jollibee::1pc-chickenjoy', buildManifest(merchants, items));
    expect(entry.brand).toBe('Jollibee');
    expect(entry.productName).toBe('1pc Chickenjoy');
  });

  it('starts every entry awaiting candidates with nothing chosen', () => {
    const entry = entryFor('jollibee::1pc-chickenjoy', buildManifest(merchants, items));
    expect(entry.status).toBe('needs-candidates');
    expect(entry.chosenUrl).toBeNull();
    expect(entry.imagekitUrl).toBeNull();
  });

  it('skips items whose merchant is unknown', () => {
    const orphan: CatalogItemRow = { id: 'i9', name: 'Ghost', merchantId: 'nope', imageUrl: null };
    expect(buildManifest(merchants, [...items, orphan])).toHaveLength(2);
  });

  it('skips items with a blank name', () => {
    const blank: CatalogItemRow = { id: 'i8', name: '   ', merchantId: 'm-kusina', imageUrl: null };
    expect(buildManifest(merchants, [...items, blank])).toHaveLength(2);
  });

  it('returns an empty manifest for an empty catalog', () => {
    expect(buildManifest([], [])).toEqual([]);
  });
});

describe('withCandidates', () => {
  const base = () => entryFor('jollibee::1pc-chickenjoy', buildManifest(merchants, items));

  it('ranks official sources above likely and generic ones', () => {
    const result = withCandidates(base(), [
      candidate('https://blog.example/x.jpg', 'generic'),
      candidate('https://jollibee.com.ph/chickenjoy.jpg', 'official'),
      candidate('https://news.example/y.jpg', 'likely'),
    ]);
    expect(result.candidates.map((c) => c.confidence)).toEqual(['official', 'likely', 'generic']);
  });

  it('chooses the highest ranked candidate and holds it for review', () => {
    const result = withCandidates(base(), [
      candidate('https://blog.example/x.jpg', 'generic'),
      candidate('https://jollibee.com.ph/chickenjoy.jpg', 'official'),
    ]);
    expect(result.chosenUrl).toBe('https://jollibee.com.ph/chickenjoy.jpg');
    expect(result.status).toBe('pending-review');
  });

  it('drops duplicate urls', () => {
    const result = withCandidates(base(), [
      candidate('https://a.example/x.jpg', 'likely'),
      candidate('https://a.example/x.jpg', 'generic'),
    ]);
    expect(result.candidates).toHaveLength(1);
  });

  it('marks an entry with no candidates so it keeps its current image', () => {
    const result = withCandidates(base(), []);
    expect(result.status).toBe('no-candidate');
    expect(result.chosenUrl).toBeNull();
  });

  it('does not mutate the original entry', () => {
    const original = base();
    withCandidates(original, [candidate('https://a.example/x.jpg', 'official')]);
    expect(original.candidates).toEqual([]);
    expect(original.status).toBe('needs-candidates');
  });
});

describe('withUpload', () => {
  const approved = (): ManifestEntry => ({
    ...withCandidates(entryFor('jollibee::1pc-chickenjoy', buildManifest(merchants, items)), [
      candidate('https://jollibee.com.ph/c.jpg', 'official'),
    ]),
    status: 'approved',
  });

  it('records the imagekit url and marks the entry uploaded', () => {
    const result = withUpload(approved(), 'https://ik.imagekit.io/x/menu-items/c.jpg');
    expect(result.imagekitUrl).toBe('https://ik.imagekit.io/x/menu-items/c.jpg');
    expect(result.status).toBe('uploaded');
  });

  it('refuses to upload an entry that has not been approved', () => {
    const pending = withCandidates(entryFor('jollibee::1pc-chickenjoy', buildManifest(merchants, items)), [
      candidate('https://jollibee.com.ph/c.jpg', 'official'),
    ]);
    expect(() => withUpload(pending, 'https://ik.imagekit.io/x/c.jpg')).toThrow(/approved/i);
  });

  it('does not mutate the original entry', () => {
    const original = approved();
    withUpload(original, 'https://ik.imagekit.io/x/c.jpg');
    expect(original.imagekitUrl).toBeNull();
  });
});

describe('selectPendingReview', () => {
  it('returns only entries awaiting a human decision', () => {
    const manifest: ManifestEntry[] = [
      { ...entryFor('jollibee::1pc-chickenjoy', buildManifest(merchants, items)), status: 'pending-review' },
      { ...entryFor('kusina-ni-maria::sinigang', buildManifest(merchants, items)), status: 'no-candidate' },
    ];
    expect(selectPendingReview(manifest).map((e) => e.key)).toEqual(['jollibee::1pc-chickenjoy']);
  });
});

describe('selectPendingUploads', () => {
  const manifestWith = (overrides: Partial<ManifestEntry>): ManifestEntry => ({
    ...entryFor('jollibee::1pc-chickenjoy', buildManifest(merchants, items)),
    chosenUrl: 'https://jollibee.com.ph/c.jpg',
    ...overrides,
  });

  it('returns approved entries that have not been uploaded yet', () => {
    expect(selectPendingUploads([manifestWith({ status: 'approved' })])).toHaveLength(1);
  });

  it('skips entries that are already uploaded, so re-runs are idempotent', () => {
    const done = manifestWith({ status: 'uploaded', imagekitUrl: 'https://ik.imagekit.io/x/c.jpg' });
    expect(selectPendingUploads([done])).toEqual([]);
  });

  it('skips entries still pending review', () => {
    expect(selectPendingUploads([manifestWith({ status: 'pending-review' })])).toEqual([]);
  });

  it('skips approved entries with no chosen url', () => {
    expect(selectPendingUploads([manifestWith({ status: 'approved', chosenUrl: null })])).toEqual([]);
  });
});

describe('autoApprove', () => {
  const pendingWith = (confidence: ImageCandidate['confidence']): ManifestEntry =>
    withCandidates(entryFor('jollibee::1pc-chickenjoy', buildManifest(merchants, items)), [
      candidate('https://src.example/x.jpg', confidence),
    ]);

  it('approves an official candidate for every row', () => {
    const [entry] = autoApprove([pendingWith('official')], items);
    expect(entry.status).toBe('approved');
    expect(entry.targetRowIds).toEqual(['i1', 'i2']);
  });

  it('approves a likely candidate for every row', () => {
    expect(autoApprove([pendingWith('likely')], items)[0].status).toBe('approved');
  });

  it('limits a generic candidate to rows that have no image yet', () => {
    const [entry] = autoApprove([pendingWith('generic')], items);
    expect(entry.status).toBe('approved');
    expect(entry.targetRowIds).toEqual(['i2']);
  });

  it('rejects a generic candidate when every row already has an image', () => {
    const allHaveImages = items.map((item) => ({ ...item, imageUrl: 'https://old.example/x.jpg' }));
    const [entry] = autoApprove([pendingWith('generic')], allHaveImages);
    expect(entry.status).toBe('rejected');
    expect(entry.targetRowIds).toEqual([]);
  });

  it('leaves entries that are not pending review untouched', () => {
    const manifest = buildManifest(merchants, items);
    expect(autoApprove(manifest, items)).toEqual(manifest);
  });

  it('does not mutate the input manifest', () => {
    const input = [pendingWith('official')];
    autoApprove(input, items);
    expect(input[0].status).toBe('pending-review');
  });
});

describe('withholdGeneric', () => {
  const uploaded = (confidence: ImageCandidate['confidence']): ManifestEntry => ({
    ...withCandidates(entryFor('jollibee::1pc-chickenjoy', buildManifest(merchants, items)), [
      candidate('https://src.example/x.jpg', confidence),
    ]),
    status: 'uploaded',
    imagekitUrl: 'https://ik.imagekit.io/x/c.jpg',
    targetRowIds: ['i2'],
  });

  it('withholds an uploaded generic entry from the write', () => {
    const [entry] = withholdGeneric([uploaded('generic')]);
    expect(entry.status).toBe('withheld');
    expect(buildRowUpdates([entry])).toEqual([]);
  });

  it('keeps the imagekit url so re-approving needs no re-upload', () => {
    expect(withholdGeneric([uploaded('generic')])[0].imagekitUrl).toBe('https://ik.imagekit.io/x/c.jpg');
  });

  it('leaves official entries writable', () => {
    const [entry] = withholdGeneric([uploaded('official')]);
    expect(entry.status).toBe('uploaded');
    expect(buildRowUpdates([entry])).toHaveLength(1);
  });

  it('leaves likely entries writable', () => {
    expect(withholdGeneric([uploaded('likely')])[0].status).toBe('uploaded');
  });

  it('does not mutate the input', () => {
    const input = [uploaded('generic')];
    withholdGeneric(input);
    expect(input[0].status).toBe('uploaded');
  });
});

describe('buildRowUpdates', () => {
  it('updates only the targeted rows when an entry is row-limited', () => {
    const entry: ManifestEntry = {
      ...entryFor('jollibee::1pc-chickenjoy', buildManifest(merchants, items)),
      status: 'uploaded',
      imagekitUrl: 'https://ik.imagekit.io/x/c.jpg',
      targetRowIds: ['i2'],
    };
    expect(buildRowUpdates([entry])).toEqual([{ rowId: 'i2', imageUrl: 'https://ik.imagekit.io/x/c.jpg' }]);
  });

  it('fans one uploaded image out to every row that shares the product', () => {
    const entry: ManifestEntry = {
      ...entryFor('jollibee::1pc-chickenjoy', buildManifest(merchants, items)),
      status: 'uploaded',
      imagekitUrl: 'https://ik.imagekit.io/x/c.jpg',
    };
    expect(buildRowUpdates([entry])).toEqual([
      { rowId: 'i1', imageUrl: 'https://ik.imagekit.io/x/c.jpg' },
      { rowId: 'i2', imageUrl: 'https://ik.imagekit.io/x/c.jpg' },
    ]);
  });

  it('ignores entries that have not been uploaded', () => {
    const manifest = buildManifest(merchants, items);
    expect(buildRowUpdates(manifest)).toEqual([]);
  });
});

describe('buildRollback', () => {
  it('captures the previous url for every row about to change', () => {
    const updates = [{ rowId: 'i1', imageUrl: 'https://ik.imagekit.io/x/c.jpg' }];
    expect(buildRollback(updates, items)).toEqual([{ rowId: 'i1', imageUrl: 'https://old.example/a.jpg' }]);
  });

  it('records null for a row that had no image', () => {
    const updates = [{ rowId: 'i2', imageUrl: 'https://ik.imagekit.io/x/c.jpg' }];
    expect(buildRollback(updates, items)).toEqual([{ rowId: 'i2', imageUrl: null }]);
  });

  it('omits rows that are not in the catalog', () => {
    const updates = [{ rowId: 'missing', imageUrl: 'https://ik.imagekit.io/x/c.jpg' }];
    expect(buildRollback(updates, items)).toEqual([]);
  });
});

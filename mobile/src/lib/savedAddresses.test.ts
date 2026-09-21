import {
  ADDRESS_LABEL_MAX_LENGTH,
  ADDRESS_NOTES_MAX_LENGTH,
  MAX_SAVED_ADDRESSES,
  buildAddress,
  canAddAddress,
  createEmptyDraft,
  deriveStreet,
  draftFromAddress,
  findAddress,
  parseLegacyLocation,
  parseSavedAddresses,
  removeAddress,
  selectDefaultAddress,
  setDefaultAddress,
  sortAddresses,
  upsertAddress,
  validateAddressDraft,
  type SavedAddress,
} from './savedAddresses';

const makeAddress = (overrides: Partial<SavedAddress> = {}): SavedAddress => ({
  id: 'addr-1',
  label: 'Home',
  displayName: '12 Rizal Street, Vigan, Ilocos Sur',
  street: '12 Rizal Street',
  latitude: 17.5747,
  longitude: 120.3869,
  notes: '',
  isDefault: false,
  updatedAt: 1_000,
  ...overrides,
});

describe('deriveStreet', () => {
  test('takes the first comma-separated segment as the short line', () => {
    expect(deriveStreet('12 Rizal Street, Vigan, Ilocos Sur')).toBe('12 Rizal Street');
  });

  test('returns the whole line when there is no comma', () => {
    expect(deriveStreet('Plaza Burgos')).toBe('Plaza Burgos');
  });

  test('falls back to the full line when the first segment is blank', () => {
    expect(deriveStreet('  , Vigan')).toBe(', Vigan');
  });
});

describe('validateAddressDraft', () => {
  const validDraft = {
    label: 'Home',
    displayName: '12 Rizal Street, Vigan',
    latitude: 17.5747,
    longitude: 120.3869,
    notes: '',
    isDefault: false,
  };

  test('accepts a complete draft', () => {
    // Arrange / Act
    const result = validateAddressDraft(validDraft);

    // Assert
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  test('requires a label', () => {
    const result = validateAddressDraft({ ...validDraft, label: '   ' });

    expect(result.valid).toBe(false);
    expect(result.errors.label).toBeTruthy();
  });

  test('rejects a label longer than the limit', () => {
    const result = validateAddressDraft({
      ...validDraft,
      label: 'x'.repeat(ADDRESS_LABEL_MAX_LENGTH + 1),
    });

    expect(result.errors.label).toBeTruthy();
  });

  test('requires an address line long enough to find a door', () => {
    const result = validateAddressDraft({ ...validDraft, displayName: 'abc' });

    expect(result.valid).toBe(false);
    expect(result.errors.displayName).toBeTruthy();
  });

  test('rejects notes longer than the limit', () => {
    const result = validateAddressDraft({
      ...validDraft,
      notes: 'x'.repeat(ADDRESS_NOTES_MAX_LENGTH + 1),
    });

    expect(result.errors.notes).toBeTruthy();
  });

  test('requires coordinates so the rider has somewhere to navigate', () => {
    const result = validateAddressDraft({ ...validDraft, latitude: null, longitude: null });

    expect(result.valid).toBe(false);
    expect(result.errors.coordinates).toBeTruthy();
  });

  test('rejects coordinates outside the Philippines', () => {
    const result = validateAddressDraft({ ...validDraft, latitude: 48.85, longitude: 2.35 });

    expect(result.errors.coordinates).toBeTruthy();
  });
});

describe('buildAddress', () => {
  test('trims the text fields and derives the short street line', () => {
    const address = buildAddress(
      {
        label: '  Home  ',
        displayName: '  12 Rizal Street, Vigan  ',
        latitude: 17.5747,
        longitude: 120.3869,
        notes: '  Green gate  ',
        isDefault: true,
      },
      { id: 'addr-9', now: 5_000 }
    );

    expect(address).toEqual({
      id: 'addr-9',
      label: 'Home',
      displayName: '12 Rizal Street, Vigan',
      street: '12 Rizal Street',
      latitude: 17.5747,
      longitude: 120.3869,
      notes: 'Green gate',
      isDefault: true,
      updatedAt: 5_000,
    });
  });

  test('keeps the draft id when the draft is an edit of a saved address', () => {
    const address = buildAddress(
      {
        id: 'addr-existing',
        label: 'Work',
        displayName: 'Vigan City Hall',
        latitude: 17.57,
        longitude: 120.38,
        notes: '',
        isDefault: false,
      },
      { id: 'addr-generated', now: 1 }
    );

    expect(address.id).toBe('addr-existing');
  });
});

describe('upsertAddress', () => {
  test('appends a new address without touching the original list', () => {
    const list = [makeAddress()];

    const next = upsertAddress(list, makeAddress({ id: 'addr-2', label: 'Work' }));

    expect(next).toHaveLength(2);
    expect(list).toHaveLength(1);
  });

  test('replaces the matching address in place', () => {
    const list = [makeAddress(), makeAddress({ id: 'addr-2', label: 'Work' })];

    const next = upsertAddress(list, makeAddress({ id: 'addr-2', label: 'Office' }));

    expect(next).toHaveLength(2);
    expect(next[1].label).toBe('Office');
  });

  test('clears the flag on every other address when the new one is default', () => {
    const list = [makeAddress({ isDefault: true }), makeAddress({ id: 'addr-2' })];

    const next = upsertAddress(list, makeAddress({ id: 'addr-2', isDefault: true }));

    expect(next.filter((entry) => entry.isDefault).map((entry) => entry.id)).toEqual(['addr-2']);
  });

  test('makes the very first address the default automatically', () => {
    const next = upsertAddress([], makeAddress({ isDefault: false }));

    expect(next[0].isDefault).toBe(true);
  });
});

describe('removeAddress', () => {
  test('drops the matching address', () => {
    const list = [makeAddress(), makeAddress({ id: 'addr-2' })];

    expect(removeAddress(list, 'addr-1').map((entry) => entry.id)).toEqual(['addr-2']);
  });

  test('promotes the most recent remaining address when the default is removed', () => {
    const list = [
      makeAddress({ id: 'addr-1', isDefault: true, updatedAt: 3_000 }),
      makeAddress({ id: 'addr-2', updatedAt: 1_000 }),
      makeAddress({ id: 'addr-3', updatedAt: 2_000 }),
    ];

    const next = removeAddress(list, 'addr-1');

    expect(next.find((entry) => entry.isDefault)?.id).toBe('addr-3');
  });

  test('leaves the list alone when the id is unknown', () => {
    const list = [makeAddress()];

    expect(removeAddress(list, 'missing')).toEqual(list);
  });
});

describe('setDefaultAddress', () => {
  test('marks exactly one address as default', () => {
    const list = [makeAddress({ isDefault: true }), makeAddress({ id: 'addr-2' })];

    const next = setDefaultAddress(list, 'addr-2');

    expect(next.map((entry) => entry.isDefault)).toEqual([false, true]);
  });

  test('ignores an unknown id rather than clearing every default', () => {
    const list = [makeAddress({ isDefault: true })];

    expect(setDefaultAddress(list, 'missing')).toEqual(list);
  });
});

describe('selectDefaultAddress', () => {
  test('returns the flagged default', () => {
    const list = [makeAddress({ updatedAt: 9_000 }), makeAddress({ id: 'addr-2', isDefault: true })];

    expect(selectDefaultAddress(list)?.id).toBe('addr-2');
  });

  test('falls back to the most recently updated address', () => {
    const list = [makeAddress({ updatedAt: 1_000 }), makeAddress({ id: 'addr-2', updatedAt: 9_000 })];

    expect(selectDefaultAddress(list)?.id).toBe('addr-2');
  });

  test('returns null for an empty list', () => {
    expect(selectDefaultAddress([])).toBeNull();
  });
});

describe('sortAddresses', () => {
  test('puts the default first, then the most recently updated', () => {
    const list = [
      makeAddress({ id: 'addr-1', updatedAt: 1_000 }),
      makeAddress({ id: 'addr-2', updatedAt: 3_000 }),
      makeAddress({ id: 'addr-3', updatedAt: 2_000, isDefault: true }),
    ];

    expect(sortAddresses(list).map((entry) => entry.id)).toEqual(['addr-3', 'addr-2', 'addr-1']);
  });
});

describe('findAddress', () => {
  test('finds by id and returns null when absent', () => {
    const list = [makeAddress()];

    expect(findAddress(list, 'addr-1')?.label).toBe('Home');
    expect(findAddress(list, 'nope')).toBeNull();
    expect(findAddress(list, null)).toBeNull();
  });
});

describe('canAddAddress', () => {
  test('stops at the cap', () => {
    const full = Array.from({ length: MAX_SAVED_ADDRESSES }, (_, index) =>
      makeAddress({ id: `addr-${index}` })
    );

    expect(canAddAddress(full)).toBe(false);
    expect(canAddAddress(full.slice(1))).toBe(true);
  });
});

describe('parseSavedAddresses', () => {
  test('returns an empty list for missing or malformed storage', () => {
    expect(parseSavedAddresses(null)).toEqual([]);
    expect(parseSavedAddresses('not json')).toEqual([]);
    expect(parseSavedAddresses('{"nope":true}')).toEqual([]);
  });

  test('keeps well-formed entries and drops the rest', () => {
    const raw = JSON.stringify([
      makeAddress(),
      { id: 'bad', label: 'Work' },
      makeAddress({ id: 'addr-2', latitude: 'x' as unknown as number }),
    ]);

    const parsed = parseSavedAddresses(raw);

    expect(parsed.map((entry) => entry.id)).toEqual(['addr-1']);
  });

  test('fills in optional fields that an older build did not write', () => {
    const raw = JSON.stringify([
      {
        id: 'addr-1',
        label: 'Home',
        displayName: '12 Rizal Street, Vigan',
        latitude: 17.5747,
        longitude: 120.3869,
      },
    ]);

    const [parsed] = parseSavedAddresses(raw);

    expect(parsed.notes).toBe('');
    expect(parsed.street).toBe('12 Rizal Street');
    expect(parsed.isDefault).toBe(false);
    expect(typeof parsed.updatedAt).toBe('number');
  });

  test('caps a storage file that somehow grew past the limit', () => {
    const raw = JSON.stringify(
      Array.from({ length: MAX_SAVED_ADDRESSES + 5 }, (_, index) =>
        makeAddress({ id: `addr-${index}` })
      )
    );

    expect(parseSavedAddresses(raw)).toHaveLength(MAX_SAVED_ADDRESSES);
  });

  test('keeps only the first default when storage holds several', () => {
    const raw = JSON.stringify([
      makeAddress({ id: 'addr-1', isDefault: true }),
      makeAddress({ id: 'addr-2', isDefault: true }),
    ]);

    expect(parseSavedAddresses(raw).map((entry) => entry.isDefault)).toEqual([true, false]);
  });
});

describe('draft round-trip', () => {
  test('createEmptyDraft starts blank and not default', () => {
    expect(createEmptyDraft()).toEqual({
      label: '',
      displayName: '',
      latitude: null,
      longitude: null,
      notes: '',
      isDefault: false,
    });
  });

  test('draftFromAddress carries every editable field back into the form', () => {
    const address = makeAddress({ notes: 'Green gate', isDefault: true });

    expect(draftFromAddress(address)).toEqual({
      id: 'addr-1',
      label: 'Home',
      displayName: '12 Rizal Street, Vigan, Ilocos Sur',
      latitude: 17.5747,
      longitude: 120.3869,
      notes: 'Green gate',
      isDefault: true,
    });
  });
});

describe('parseLegacyLocation', () => {
  const LEGACY = JSON.stringify({
    latitude: 17.5747,
    longitude: 120.3869,
    displayName: '12 Rizal Street, Vigan, Ilocos Sur',
    street: '12 Rizal Street',
  });

  test('turns the single stored location into the first saved address', () => {
    const migrated = parseLegacyLocation(LEGACY, { id: 'addr-1', now: 7_000 });

    expect(migrated).toEqual({
      id: 'addr-1',
      label: 'Saved location',
      displayName: '12 Rizal Street, Vigan, Ilocos Sur',
      street: '12 Rizal Street',
      latitude: 17.5747,
      longitude: 120.3869,
      notes: '',
      isDefault: true,
      updatedAt: 7_000,
    });
  });

  test('returns null when there is nothing worth migrating', () => {
    expect(parseLegacyLocation(null, { id: 'a', now: 1 })).toBeNull();
    expect(parseLegacyLocation('not json', { id: 'a', now: 1 })).toBeNull();
    expect(parseLegacyLocation('{"latitude":1}', { id: 'a', now: 1 })).toBeNull();
  });

  test('drops a coordinate-only label rather than saving "17.57, 120.38" as an address', () => {
    const coordsOnly = JSON.stringify({
      latitude: 17.5747,
      longitude: 120.3869,
      displayName: '17.57470, 120.38690',
      street: 'Current location',
    });

    expect(parseLegacyLocation(coordsOnly, { id: 'a', now: 1 })).toBeNull();
  });
});

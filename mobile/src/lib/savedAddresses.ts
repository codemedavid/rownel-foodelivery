// The customer's address book.
//
// Every function here is pure: it takes a list and returns a new one. The
// context owns persistence, the screens own the forms, and this file owns the
// rules — which address is the default, what makes a draft valid, and how a
// storage file written by an older build is read without crashing.
//
// Coordinates are required on a saved address, but the *wording* is not ours.
// `displayName` is whatever the customer typed or picked; we never overwrite it
// with a geocoder's version. A Philippine address is half landmark ("beside the
// blue gate, across San Vicente church") and a map service will not say that
// back to them.

import { isWithinPhilippines } from './geocoding';

/** Enough for home, work, a partner's place and a handful of one-offs. */
export const MAX_SAVED_ADDRESSES = 12;

export const ADDRESS_LABEL_MAX_LENGTH = 24;
export const ADDRESS_NOTES_MAX_LENGTH = 160;
export const ADDRESS_LINE_MAX_LENGTH = 220;

/** Shorter than this and a rider cannot find the place from the text alone. */
const MIN_ADDRESS_LINE_LENGTH = 6;

/** One-tap labels in the editor; the customer can type their own instead. */
export const SUGGESTED_ADDRESS_LABELS = ['Home', 'Work', 'Partner', 'Other'] as const;

export interface SavedAddress {
  id: string;
  /** "Home", "Work", or whatever the customer called it. */
  label: string;
  /** The address line exactly as the customer wrote or picked it. */
  displayName: string;
  /** Short first line, for compact rows. Derived from `displayName`. */
  street: string;
  latitude: number;
  longitude: number;
  /** Unit, floor, gate colour — anything the rider needs at the door. */
  notes: string;
  isDefault: boolean;
  updatedAt: number;
}

/** The editable shape behind the add/edit form, before it has coordinates. */
export interface AddressDraft {
  /** Present when editing a saved address, absent when adding a new one. */
  id?: string;
  label: string;
  displayName: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  isDefault: boolean;
}

export interface AddressValidation {
  valid: boolean;
  errors: Record<string, string>;
}

/** The compact line for a list row: the part before the first comma. */
export const deriveStreet = (displayName: string): string => {
  const trimmed = displayName.trim();
  const firstSegment = trimmed.split(',')[0]?.trim() ?? '';
  return firstSegment || trimmed;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const createEmptyDraft = (): AddressDraft => ({
  label: '',
  displayName: '',
  latitude: null,
  longitude: null,
  notes: '',
  isDefault: false,
});

export const draftFromAddress = (address: SavedAddress): AddressDraft => ({
  id: address.id,
  label: address.label,
  displayName: address.displayName,
  latitude: address.latitude,
  longitude: address.longitude,
  notes: address.notes,
  isDefault: address.isDefault,
});

export const validateAddressDraft = (draft: AddressDraft): AddressValidation => {
  const errors: Record<string, string> = {};

  const label = draft.label.trim();
  if (!label) {
    errors.label = 'Give this address a name, like Home or Work.';
  } else if (label.length > ADDRESS_LABEL_MAX_LENGTH) {
    errors.label = `Keep the name under ${ADDRESS_LABEL_MAX_LENGTH} characters.`;
  }

  const displayName = draft.displayName.trim();
  if (displayName.length < MIN_ADDRESS_LINE_LENGTH) {
    errors.displayName = 'Write the house/unit number, street and barangay.';
  } else if (displayName.length > ADDRESS_LINE_MAX_LENGTH) {
    errors.displayName = `Keep the address under ${ADDRESS_LINE_MAX_LENGTH} characters.`;
  }

  if (draft.notes.trim().length > ADDRESS_NOTES_MAX_LENGTH) {
    errors.notes = `Keep the notes under ${ADDRESS_NOTES_MAX_LENGTH} characters.`;
  }

  // The text is what the customer reads; the pin is what the rider drives to.
  // Saving without one would quote the wrong fee and strand the delivery.
  if (!isFiniteNumber(draft.latitude) || !isFiniteNumber(draft.longitude)) {
    errors.coordinates = 'Pick a suggestion or drop the pin so we know where to deliver.';
  } else if (!isWithinPhilippines(draft.latitude, draft.longitude)) {
    errors.coordinates = 'That pin is outside the Philippines. Move it to your delivery address.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
};

/**
 * Turns a validated draft into a storable address. `id` and `now` are passed in
 * rather than generated here so the result is deterministic and testable.
 */
export const buildAddress = (
  draft: AddressDraft,
  { id, now }: { id: string; now: number }
): SavedAddress => {
  const displayName = draft.displayName.trim();

  return {
    id: draft.id ?? id,
    label: draft.label.trim(),
    displayName,
    street: deriveStreet(displayName),
    latitude: draft.latitude as number,
    longitude: draft.longitude as number,
    notes: draft.notes.trim(),
    isDefault: draft.isDefault,
    updatedAt: now,
  };
};

/** Collision-resistant enough for a per-device list of a dozen entries. */
export const createAddressId = (): string =>
  `addr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const canAddAddress = (addresses: readonly SavedAddress[]): boolean =>
  addresses.length < MAX_SAVED_ADDRESSES;

export const findAddress = (
  addresses: readonly SavedAddress[],
  id: string | null | undefined
): SavedAddress | null => (id ? addresses.find((entry) => entry.id === id) ?? null : null);

/** Exactly one default survives, and an only child is always it. */
const withSingleDefault = (
  addresses: readonly SavedAddress[],
  defaultId: string
): SavedAddress[] =>
  addresses.map((entry) =>
    entry.isDefault === (entry.id === defaultId)
      ? entry
      : { ...entry, isDefault: entry.id === defaultId }
  );

export const upsertAddress = (
  addresses: readonly SavedAddress[],
  address: SavedAddress
): SavedAddress[] => {
  const isKnown = addresses.some((entry) => entry.id === address.id);
  const isOnlyAddress = !isKnown && addresses.length === 0;

  // The first address a customer saves is the one they order to; asking them to
  // also mark it default would be a step with one possible answer.
  const next = isOnlyAddress ? { ...address, isDefault: true } : address;

  const merged = isKnown
    ? addresses.map((entry) => (entry.id === next.id ? next : entry))
    : [...addresses, next];

  return next.isDefault ? withSingleDefault(merged, next.id) : merged;
};

/** Newest first, used to pick a replacement default. */
const mostRecent = (addresses: readonly SavedAddress[]): SavedAddress | null =>
  addresses.reduce<SavedAddress | null>(
    (latest, entry) => (!latest || entry.updatedAt > latest.updatedAt ? entry : latest),
    null
  );

export const removeAddress = (
  addresses: readonly SavedAddress[],
  id: string
): SavedAddress[] => {
  const remaining = addresses.filter((entry) => entry.id !== id);
  if (remaining.length === addresses.length) return [...addresses];

  // Never leave the book without a default — the next order would have nowhere
  // to go and the customer would have to re-pick an address they already saved.
  if (remaining.some((entry) => entry.isDefault)) return remaining;

  const replacement = mostRecent(remaining);
  return replacement ? withSingleDefault(remaining, replacement.id) : remaining;
};

export const setDefaultAddress = (
  addresses: readonly SavedAddress[],
  id: string
): SavedAddress[] => {
  if (!addresses.some((entry) => entry.id === id)) return [...addresses];
  return withSingleDefault(addresses, id);
};

export const selectDefaultAddress = (
  addresses: readonly SavedAddress[]
): SavedAddress | null => addresses.find((entry) => entry.isDefault) ?? mostRecent(addresses);

/** Default first, then most recently touched — the order the list is shown in. */
export const sortAddresses = (addresses: readonly SavedAddress[]): SavedAddress[] =>
  [...addresses].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

/**
 * Storage is untrusted input: it may have been written by an older build, or
 * corrupted. An entry missing its coordinates is unusable and dropped; one
 * missing an optional field is filled in rather than thrown away.
 */
const parseEntry = (value: unknown): SavedAddress | null => {
  if (!value || typeof value !== 'object') return null;

  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string' || !entry.id) return null;
  if (typeof entry.label !== 'string' || !entry.label) return null;
  if (typeof entry.displayName !== 'string' || !entry.displayName) return null;
  if (!isFiniteNumber(entry.latitude) || !isFiniteNumber(entry.longitude)) return null;

  return {
    id: entry.id,
    label: entry.label,
    displayName: entry.displayName,
    street:
      typeof entry.street === 'string' && entry.street
        ? entry.street
        : deriveStreet(entry.displayName),
    latitude: entry.latitude,
    longitude: entry.longitude,
    notes: typeof entry.notes === 'string' ? entry.notes : '',
    isDefault: entry.isDefault === true,
    updatedAt: isFiniteNumber(entry.updatedAt) ? entry.updatedAt : 0,
  };
};

export const parseSavedAddresses = (raw: string | null): SavedAddress[] => {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const entries = parsed
    .map(parseEntry)
    .filter((entry): entry is SavedAddress => entry !== null)
    .slice(0, MAX_SAVED_ADDRESSES);

  // Two defaults in storage means two screens could disagree about where the
  // order goes, so the first one wins and the rest are demoted.
  const firstDefault = entries.find((entry) => entry.isDefault);
  return firstDefault ? withSingleDefault(entries, firstDefault.id) : entries;
};

export const serializeSavedAddresses = (addresses: readonly SavedAddress[]): string =>
  JSON.stringify(addresses);

/** "17.57470, 120.38690" — what the old code stored when the lookup failed. */
const COORDINATE_LABEL_PATTERN = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;

/**
 * Carries the single location older builds stored under `userDeliveryLocation`
 * into the address book, so upgrading does not look like the app forgot where
 * the customer lives.
 *
 * A coordinate-only label is dropped: "17.57470, 120.38690" is not an address a
 * customer would recognise in a list, and re-picking is better than seeding the
 * book with a row they would have to decode.
 */
export const parseLegacyLocation = (
  raw: string | null,
  { id, now }: { id: string; now: number }
): SavedAddress | null => {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const entry = parsed as Record<string, unknown>;
  if (!isFiniteNumber(entry.latitude) || !isFiniteNumber(entry.longitude)) return null;
  if (typeof entry.displayName !== 'string') return null;

  const displayName = entry.displayName.trim();
  if (!displayName || COORDINATE_LABEL_PATTERN.test(displayName)) return null;

  return {
    id,
    label: 'Saved location',
    displayName,
    street:
      typeof entry.street === 'string' && entry.street.trim() && entry.street !== 'Current location'
        ? entry.street.trim()
        : deriveStreet(displayName),
    latitude: entry.latitude,
    longitude: entry.longitude,
    notes: '',
    isDefault: true,
    updatedAt: now,
  };
};

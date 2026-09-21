// The persisted address book: list in state, rules in `savedAddresses.ts`,
// bytes in `addressStorage.ts`.
//
// Writes go to state first and storage second. The customer sees the change
// immediately, and a device that refuses to write still lets them finish the
// order in front of them.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readAddressBook,
  writeAddresses,
  writeSelectedAddressId,
} from '../lib/addressStorage';
import {
  buildAddress,
  canAddAddress,
  createAddressId,
  findAddress,
  removeAddress,
  selectDefaultAddress,
  setDefaultAddress,
  sortAddresses,
  upsertAddress,
  type AddressDraft,
  type SavedAddress,
} from '../lib/savedAddresses';

export interface AddressBookState {
  /** Default first, then most recently updated. */
  addresses: SavedAddress[];
  /** The one orders go to, or null before any address exists. */
  selectedAddress: SavedAddress | null;
  /** False until storage has been read; screens should not judge emptiness before this. */
  isReady: boolean;
  /** True when the book is full and a new address would be refused. */
  isFull: boolean;
  saveAddress: (draft: AddressDraft) => Promise<SavedAddress | null>;
  deleteAddress: (id: string) => Promise<void>;
  selectAddress: (id: string) => Promise<void>;
  makeDefault: (id: string) => Promise<void>;
}

export const useAddressBook = (): AddressBookState => {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    void readAddressBook().then((snapshot) => {
      if (!isMountedRef.current) return;
      setAddresses(snapshot.addresses);
      setSelectedId(snapshot.selectedId);
      setIsReady(true);
    });

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /** Single write path, so state and storage can never drift apart. */
  const commit = useCallback(async (next: readonly SavedAddress[]): Promise<void> => {
    setAddresses([...next]);
    await writeAddresses(next);
  }, []);

  const saveAddress = useCallback(
    async (draft: AddressDraft): Promise<SavedAddress | null> => {
      const isNew = !draft.id;
      if (isNew && !canAddAddress(addresses)) return null;

      const address = buildAddress(draft, { id: createAddressId(), now: Date.now() });
      await commit(upsertAddress(addresses, address));

      // A freshly saved address is the one they mean to use right now, whether
      // or not they ticked "default".
      setSelectedId(address.id);
      await writeSelectedAddressId(address.id);

      return address;
    },
    [addresses, commit]
  );

  const deleteAddress = useCallback(
    async (id: string): Promise<void> => {
      const next = removeAddress(addresses, id);
      await commit(next);

      if (selectedId !== id) return;

      // The deleted address was the live one — fall back to the new default so
      // checkout is never left pointing at something that no longer exists.
      const replacement = selectDefaultAddress(next);
      setSelectedId(replacement?.id ?? null);
      await writeSelectedAddressId(replacement?.id ?? null);
    },
    [addresses, commit, selectedId]
  );

  const selectAddress = useCallback(
    async (id: string): Promise<void> => {
      if (!findAddress(addresses, id)) return;
      setSelectedId(id);
      await writeSelectedAddressId(id);
    },
    [addresses]
  );

  const makeDefault = useCallback(
    async (id: string): Promise<void> => {
      await commit(setDefaultAddress(addresses, id));
    },
    [addresses, commit]
  );

  // A selected id that no longer resolves (deleted on another screen, or a
  // storage file that lost the row) falls back to the default rather than
  // leaving the app with no delivery address at all.
  const selectedAddress = findAddress(addresses, selectedId) ?? selectDefaultAddress(addresses);

  return {
    addresses: sortAddresses(addresses),
    selectedAddress,
    isReady,
    isFull: !canAddAddress(addresses),
    saveAddress,
    deleteAddress,
    selectAddress,
    makeDefault,
  };
};

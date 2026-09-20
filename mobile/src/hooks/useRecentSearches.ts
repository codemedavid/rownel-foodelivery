import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addRecentSearch, parseRecentSearches } from '../lib/recentSearches';

const STORAGE_KEY = 'rownel.recentSearches';

/** Recently used search queries, persisted on the device. */
export const useRecentSearches = () => {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    let isActive = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (isActive) setRecentSearches(parseRecentSearches(raw));
      })
      .catch(() => {
        // A missing or unreadable history is not worth surfacing — start empty.
        if (isActive) setRecentSearches([]);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const persist = useCallback((next: string[]) => {
    setRecentSearches(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const rememberSearch = useCallback(
    (query: string) => persist(addRecentSearch(recentSearches, query)),
    [persist, recentSearches]
  );

  const clearRecentSearches = useCallback(() => persist([]), [persist]);

  return { recentSearches, rememberSearch, clearRecentSearches };
};

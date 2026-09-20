import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildDishSearchFilter, indexDishesByMerchant, type DishRow } from '../lib/dishSearchQuery';

/** Cap the round trip — the index only needs enough rows to rank merchants. */
const DISH_RESULT_LIMIT = 120;

const EMPTY_INDEX: ReadonlyMap<string, string[]> = new Map();

/**
 * Look up menu items matching the query so the restaurant list can surface
 * places by dish ("adobo") and not just by name or cuisine.
 */
export const useDishSearch = (query: string) => {
  const [dishesByMerchant, setDishesByMerchant] =
    useState<ReadonlyMap<string, string[]>>(EMPTY_INDEX);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const filter = buildDishSearchFilter(query);
    if (!filter) {
      setDishesByMerchant(EMPTY_INDEX);
      setIsSearching(false);
      return;
    }

    let isActive = true;
    setIsSearching(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('menu_items')
          .select('merchant_id, name')
          .eq('available', true)
          .or(filter)
          .limit(DISH_RESULT_LIMIT);

        if (error) throw error;
        if (isActive) setDishesByMerchant(indexDishesByMerchant((data ?? []) as DishRow[]));
      } catch {
        // Dish matches only enrich the merchant list — fall back to it silently.
        if (isActive) setDishesByMerchant(EMPTY_INDEX);
      } finally {
        if (isActive) setIsSearching(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [query]);

  return { dishesByMerchant, isSearching };
};

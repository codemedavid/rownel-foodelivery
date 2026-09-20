/** Shorter queries match too much of the menu to be worth a round trip. */
export const MIN_DISH_SEARCH_LENGTH = 2;

/** Characters that would break out of a PostgREST `or()` filter expression. */
const UNSAFE_FILTER_CHARS = /[,()%*\\"']/g;

export interface DishRow {
  merchant_id: string | null;
  name: string | null;
}

/**
 * Build the `or()` filter for a dish lookup, or null when the query is too
 * short to be useful. The term is sanitised because it is user input spliced
 * into a PostgREST filter expression.
 */
export const buildDishSearchFilter = (query: string): string | null => {
  const term = query.trim().replace(UNSAFE_FILTER_CHARS, '');
  if (term.length < MIN_DISH_SEARCH_LENGTH) return null;

  return `name.ilike.%${term}%,description.ilike.%${term}%`;
};

/** Turn matching dish rows into the merchant-id → dish-names index search uses. */
export const indexDishesByMerchant = (rows: readonly DishRow[]): Map<string, string[]> => {
  const index = new Map<string, string[]>();

  for (const row of rows) {
    if (!row.merchant_id || !row.name) continue;
    index.set(row.merchant_id, [...(index.get(row.merchant_id) ?? []), row.name]);
  }

  return index;
};

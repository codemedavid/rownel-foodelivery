import { scoreTextMatch, tokenizeQuery } from './textMatch';

/** The minimum shape searchMerchants needs — real merchants satisfy it. */
export interface SearchableMerchant {
  id: string;
  name: string;
  category: string;
  cuisineType?: string;
  description?: string;
}

/** Dish names per merchant id, used so "adobo" can surface the places that cook it. */
export type DishIndex = ReadonlyMap<string, readonly string[]>;

export interface MerchantSearchResult<T extends SearchableMerchant> {
  merchant: T;
  score: number;
  /** Dish names that matched the query — shown as context on the card. */
  matchedDishes: string[];
}

export interface MerchantSearchOptions {
  dishesByMerchant?: DishIndex;
  category?: string | null;
}

/** Field weights — a name hit should always outrank a description hit. */
const FIELD_WEIGHT = {
  name: 1,
  dish: 0.75,
  cuisineType: 0.6,
  category: 0.45,
  description: 0.35,
} as const;

const MAX_MATCHED_DISHES = 3;
const DEFAULT_SUGGESTION_LIMIT = 3;

interface TermScore {
  score: number;
  matchedDishes: string[];
}

const scoreTerm = <T extends SearchableMerchant>(
  merchant: T,
  term: string,
  dishes: readonly string[]
): TermScore => {
  const fieldScores = [
    scoreTextMatch(merchant.name, term) * FIELD_WEIGHT.name,
    scoreTextMatch(merchant.cuisineType, term) * FIELD_WEIGHT.cuisineType,
    scoreTextMatch(merchant.category, term) * FIELD_WEIGHT.category,
    scoreTextMatch(merchant.description, term) * FIELD_WEIGHT.description,
  ];

  const matchedDishes = dishes.filter((dish) => scoreTextMatch(dish, term) > 0);
  const bestDishScore = dishes.reduce(
    (best, dish) => Math.max(best, scoreTextMatch(dish, term) * FIELD_WEIGHT.dish),
    0
  );

  return {
    score: Math.max(...fieldScores, bestDishScore),
    matchedDishes: matchedDishes.slice(0, MAX_MATCHED_DISHES),
  };
};

const scoreMerchant = <T extends SearchableMerchant>(
  merchant: T,
  terms: readonly string[],
  dishes: readonly string[],
  requireEveryTerm: boolean
): MerchantSearchResult<T> | null => {
  let total = 0;
  let matchedTerms = 0;
  const matchedDishes = new Set<string>();

  for (const term of terms) {
    const { score, matchedDishes: dishHits } = scoreTerm(merchant, term, dishes);
    if (score === 0) {
      if (requireEveryTerm) return null;
      continue;
    }
    matchedTerms += 1;
    total += score;
    dishHits.forEach((dish) => matchedDishes.add(dish));
  }

  if (matchedTerms === 0) return null;

  return {
    merchant,
    score: total / terms.length,
    matchedDishes: [...matchedDishes].slice(0, MAX_MATCHED_DISHES),
  };
};

const rankByScore = <T extends SearchableMerchant>(
  results: readonly MerchantSearchResult<T>[]
): MerchantSearchResult<T>[] =>
  results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => b.result.score - a.result.score || a.index - b.index)
    .map(({ result }) => result);

const matchesCategory = (merchant: SearchableMerchant, category?: string | null): boolean =>
  !category || merchant.category === category;

/**
 * Rank merchants against a free-text query. Every query term must match some
 * field (or dish) — ranking then favours name hits over descriptions.
 * A blank query returns the input order untouched.
 */
export const searchMerchants = <T extends SearchableMerchant>(
  merchants: readonly T[],
  query: string,
  options: MerchantSearchOptions = {}
): MerchantSearchResult<T>[] => {
  const { dishesByMerchant, category } = options;
  const inCategory = merchants.filter((merchant) => matchesCategory(merchant, category));
  const terms = tokenizeQuery(query);

  if (terms.length === 0) {
    return inCategory.map((merchant) => ({ merchant, score: 0, matchedDishes: [] }));
  }

  const scored = inCategory
    .map((merchant) =>
      scoreMerchant(merchant, terms, dishesByMerchant?.get(merchant.id) ?? [], true)
    )
    .filter((result): result is MerchantSearchResult<T> => result !== null);

  return rankByScore(scored);
};

/**
 * Looser fallback for a zero-result query: merchants matching *any* term,
 * so the empty state can offer "did you mean" options instead of a dead end.
 */
export const suggestMerchants = <T extends SearchableMerchant>(
  merchants: readonly T[],
  query: string,
  limit: number = DEFAULT_SUGGESTION_LIMIT,
  options: MerchantSearchOptions = {}
): MerchantSearchResult<T>[] => {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];

  const scored = merchants
    .map((merchant) =>
      scoreMerchant(merchant, terms, options.dishesByMerchant?.get(merchant.id) ?? [], false)
    )
    .filter((result): result is MerchantSearchResult<T> => result !== null);

  return rankByScore(scored).slice(0, limit);
};

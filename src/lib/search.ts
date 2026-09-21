import { scoreTextMatch, tokenizeQuery } from './textMatch';

/** The minimum shape merchant search needs — real merchants satisfy it. */
export interface SearchableMerchant {
  id: string;
  name: string;
  category: string;
  cuisineType?: string;
  description?: string;
}

/** The minimum shape dish search needs — real menu items satisfy it. */
export interface SearchableDish {
  id: string;
  merchantId: string;
  name: string;
  description?: string;
  category: string;
}

export interface MerchantSearchResult<T extends SearchableMerchant> {
  merchant: T;
  score: number;
  /** Dish names that matched the query — shown as context on the card. */
  matchedDishes: string[];
}

export interface DishSearchResult<D extends SearchableDish> {
  dish: D;
  score: number;
}

/** Field weights — a name hit should always outrank a description hit. */
const MERCHANT_FIELD_WEIGHT = {
  name: 1,
  dish: 0.75,
  cuisineType: 0.6,
  category: 0.45,
  description: 0.35,
} as const;

const DISH_FIELD_WEIGHT = {
  name: 1,
  category: 0.5,
  description: 0.4,
  merchant: 0.35,
} as const;

const MAX_MATCHED_DISHES = 3;
export const DEFAULT_SUGGESTION_LIMIT = 3;

interface TermScore {
  score: number;
  matchedDishes: string[];
}

const scoreMerchantTerm = <T extends SearchableMerchant>(
  merchant: T,
  term: string,
  dishes: readonly string[]
): TermScore => {
  const fieldScores = [
    scoreTextMatch(merchant.name, term) * MERCHANT_FIELD_WEIGHT.name,
    scoreTextMatch(merchant.cuisineType, term) * MERCHANT_FIELD_WEIGHT.cuisineType,
    scoreTextMatch(merchant.category, term) * MERCHANT_FIELD_WEIGHT.category,
    scoreTextMatch(merchant.description, term) * MERCHANT_FIELD_WEIGHT.description,
  ];

  const matchedDishes = dishes.filter((dish) => scoreTextMatch(dish, term) > 0);
  const bestDishScore = dishes.reduce(
    (best, dish) => Math.max(best, scoreTextMatch(dish, term) * MERCHANT_FIELD_WEIGHT.dish),
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
    const { score, matchedDishes: dishHits } = scoreMerchantTerm(merchant, term, dishes);
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

const rankByScore = <R extends { score: number }>(results: readonly R[]): R[] =>
  results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => b.result.score - a.result.score || a.index - b.index)
    .map(({ result }) => result);

/** Group dish names by merchant id so merchant search can rank by what they cook. */
export const buildDishIndex = (dishes: readonly SearchableDish[]): Map<string, string[]> => {
  const index = new Map<string, string[]>();
  for (const dish of dishes) {
    const existing = index.get(dish.merchantId);
    if (existing) {
      index.set(dish.merchantId, [...existing, dish.name]);
    } else {
      index.set(dish.merchantId, [dish.name]);
    }
  }
  return index;
};

/**
 * Rank merchants against a free-text query. Every query term must match some
 * field (or dish) — ranking then favours name hits over descriptions.
 * A blank query returns the input order untouched.
 */
export const searchMerchants = <T extends SearchableMerchant>(
  merchants: readonly T[],
  query: string,
  dishesByMerchant?: ReadonlyMap<string, readonly string[]>
): MerchantSearchResult<T>[] => {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) {
    return merchants.map((merchant) => ({ merchant, score: 0, matchedDishes: [] }));
  }

  const scored = merchants
    .map((merchant) => scoreMerchant(merchant, terms, dishesByMerchant?.get(merchant.id) ?? [], true))
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
  dishesByMerchant?: ReadonlyMap<string, readonly string[]>
): MerchantSearchResult<T>[] => {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];

  const scored = merchants
    .map((merchant) => scoreMerchant(merchant, terms, dishesByMerchant?.get(merchant.id) ?? [], false))
    .filter((result): result is MerchantSearchResult<T> => result !== null);

  return rankByScore(scored).slice(0, limit);
};

/**
 * Rank dishes against a query. Every term must hit the dish itself or the
 * merchant name (so "jollibee burger" finds the burger at Jollibee).
 */
export const searchDishes = <D extends SearchableDish>(
  dishes: readonly D[],
  query: string,
  merchantNameById: ReadonlyMap<string, string>
): DishSearchResult<D>[] => {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];

  const scored: DishSearchResult<D>[] = [];
  for (const dish of dishes) {
    const merchantName = merchantNameById.get(dish.merchantId) ?? '';
    let total = 0;
    let matched = true;
    for (const term of terms) {
      const score = Math.max(
        scoreTextMatch(dish.name, term) * DISH_FIELD_WEIGHT.name,
        scoreTextMatch(dish.category, term) * DISH_FIELD_WEIGHT.category,
        scoreTextMatch(dish.description, term) * DISH_FIELD_WEIGHT.description,
        scoreTextMatch(merchantName, term) * DISH_FIELD_WEIGHT.merchant
      );
      if (score === 0) {
        matched = false;
        break;
      }
      total += score;
    }
    if (matched) scored.push({ dish, score: total / terms.length });
  }

  return rankByScore(scored);
};

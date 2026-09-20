import { scoreTextMatch, tokenizeQuery } from './textMatch';
import type { MenuItem } from '../types';

export interface MenuSection {
  title: string;
  data: MenuItem[];
}

/** Field weights — a dish name hit outranks a description or add-on hit. */
const FIELD_WEIGHT = {
  name: 1,
  category: 0.5,
  description: 0.4,
  option: 0.4,
} as const;

const optionNames = (item: MenuItem): string[] => [
  ...(item.addOns ?? []).map((addOn) => addOn.name),
  ...(item.variations ?? []).map((variation) => variation.name),
];

const scoreItemTerm = (item: MenuItem, term: string): number => {
  const bestOptionScore = optionNames(item).reduce(
    (best, name) => Math.max(best, scoreTextMatch(name, term) * FIELD_WEIGHT.option),
    0
  );

  return Math.max(
    scoreTextMatch(item.name, term) * FIELD_WEIGHT.name,
    scoreTextMatch(item.category, term) * FIELD_WEIGHT.category,
    scoreTextMatch(item.description, term) * FIELD_WEIGHT.description,
    bestOptionScore
  );
};

/**
 * Rank a merchant's menu against a free-text query. Every term must match
 * somewhere on the item; a blank query returns the menu untouched.
 */
export const searchMenuItems = (items: readonly MenuItem[], query: string): MenuItem[] => {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [...items];

  return items
    .map((item, index) => {
      let total = 0;
      for (const term of terms) {
        const score = scoreItemTerm(item, term);
        if (score === 0) return null;
        total += score;
      }
      return { item, index, score: total / terms.length };
    })
    .filter((scored): scored is { item: MenuItem; index: number; score: number } => scored !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
};

/** Group items into SectionList sections, preserving first-seen category order. */
export const groupMenuItemsByCategory = (items: readonly MenuItem[]): MenuSection[] => {
  const byCategory = new Map<string, MenuItem[]>();
  for (const item of items) {
    byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  }
  return [...byCategory.entries()].map(([title, data]) => ({ title, data }));
};

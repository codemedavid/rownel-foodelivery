/**
 * Text matching primitives shared by every search surface in the app.
 * Kept free of React and Supabase so scoring stays unit-testable.
 */

/** Relevance weights per match kind — higher means a closer match. */
export const MATCH_SCORE = {
  exact: 1,
  prefix: 0.85,
  wordPrefix: 0.7,
  substring: 0.5,
  fuzzy: 0.3,
} as const;

/** Below this length a single edit usually changes the word's meaning ("tea" → "sea"). */
const MIN_FUZZY_LENGTH = 4;

const SPLIT_PATTERN = /[^\p{Letter}\p{Number}]+/u;

export const normalizeText = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

export const tokenizeQuery = (query: string | null | undefined): string[] => {
  const terms = normalizeText(query).split(SPLIT_PATTERN).filter(Boolean);
  return [...new Set(terms)];
};

/** True when `a` and `b` are at most one insert, delete, substitution or adjacent swap apart. */
export const fuzzyEquals = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (a.length < MIN_FUZZY_LENGTH || b.length < MIN_FUZZY_LENGTH) return false;
  if (Math.abs(a.length - b.length) > 1) return false;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let shortIndex = 0;
  let longIndex = 0;
  let edits = 0;

  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    if (edits === 1) return false;
    edits += 1;

    const isTransposition =
      shorter.length === longer.length &&
      shorter[shortIndex] === longer[longIndex + 1] &&
      shorter[shortIndex + 1] === longer[longIndex];

    if (isTransposition) {
      shortIndex += 2;
      longIndex += 2;
      continue;
    }

    longIndex += 1;
    if (shorter.length === longer.length) shortIndex += 1;
  }

  return true;
};

/**
 * Score how well `term` (already lowercase) matches `text`.
 * Returns 0 when there is no match at all.
 */
export const scoreTextMatch = (text: string | null | undefined, term: string): number => {
  const haystack = normalizeText(text);
  if (!haystack || !term) return 0;

  if (haystack === term) return MATCH_SCORE.exact;
  if (haystack.startsWith(term)) return MATCH_SCORE.prefix;

  const words = haystack.split(SPLIT_PATTERN).filter(Boolean);
  if (words.some((word) => word === term)) return MATCH_SCORE.exact;
  if (words.some((word) => word.startsWith(term))) return MATCH_SCORE.wordPrefix;
  if (haystack.includes(term)) return MATCH_SCORE.substring;
  if (words.some((word) => fuzzyEquals(word, term))) return MATCH_SCORE.fuzzy;

  return 0;
};

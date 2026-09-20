import { fuzzyEquals, normalizeText, scoreTextMatch, tokenizeQuery } from './textMatch';

describe('normalizeText', () => {
  test('lowercases, strips diacritics and collapses whitespace', () => {
    expect(normalizeText('  Café   Ñoño  ')).toBe('cafe nono');
  });

  test('returns an empty string for nullish input', () => {
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText(null)).toBe('');
  });
});

describe('tokenizeQuery', () => {
  test('splits on whitespace and punctuation', () => {
    expect(tokenizeQuery('chicken, adobo!')).toEqual(['chicken', 'adobo']);
  });

  test('drops duplicate terms', () => {
    expect(tokenizeQuery('pizza pizza')).toEqual(['pizza']);
  });

  test('returns an empty list for a blank query', () => {
    expect(tokenizeQuery('   ')).toEqual([]);
  });
});

describe('fuzzyEquals', () => {
  test('accepts a single-character typo', () => {
    expect(fuzzyEquals('adobo', 'adoba')).toBe(true);
    expect(fuzzyEquals('burger', 'buger')).toBe(true);
  });

  test('accepts a swapped pair of adjacent characters', () => {
    expect(fuzzyEquals('ramen', 'ramne')).toBe(true);
  });

  test('rejects two or more edits apart', () => {
    expect(fuzzyEquals('adobo', 'adxbx')).toBe(false);
  });

  test('rejects short words where a typo changes the meaning', () => {
    expect(fuzzyEquals('tea', 'sea')).toBe(false);
  });
});

describe('scoreTextMatch', () => {
  test('scores an exact match highest', () => {
    expect(scoreTextMatch('Adobo', 'adobo')).toBe(1);
  });

  test('ranks prefix above word-prefix above substring', () => {
    const prefix = scoreTextMatch('Chicken Inasal', 'chick');
    const wordPrefix = scoreTextMatch('Chicken Inasal', 'inas');
    const substring = scoreTextMatch('Chicken Inasal', 'nasa');

    expect(prefix).toBeGreaterThan(wordPrefix);
    expect(wordPrefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  test('falls back to a fuzzy score for a typo', () => {
    const fuzzy = scoreTextMatch('Chicken Adobo', 'adoba');
    expect(fuzzy).toBeGreaterThan(0);
    expect(fuzzy).toBeLessThan(scoreTextMatch('Chicken Adobo', 'adobo'));
  });

  test('returns 0 when nothing matches', () => {
    expect(scoreTextMatch('Chicken Adobo', 'sushi')).toBe(0);
  });

  test('ignores diacritics on both sides', () => {
    expect(scoreTextMatch('Café Manila', 'cafe')).toBeGreaterThan(0);
  });
});

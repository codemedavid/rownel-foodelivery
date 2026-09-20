import { MAX_RECENT_SEARCHES, addRecentSearch, parseRecentSearches } from './recentSearches';

describe('addRecentSearch', () => {
  test('puts the newest query first', () => {
    expect(addRecentSearch(['ramen'], 'adobo')).toEqual(['adobo', 'ramen']);
  });

  test('trims the query and ignores a blank one', () => {
    expect(addRecentSearch(['ramen'], '  adobo  ')).toEqual(['adobo', 'ramen']);
    expect(addRecentSearch(['ramen'], '   ')).toEqual(['ramen']);
  });

  test('moves an existing query to the front without duplicating it', () => {
    expect(addRecentSearch(['ramen', 'adobo'], 'ADOBO')).toEqual(['ADOBO', 'ramen']);
  });

  test('caps the history length', () => {
    const history = Array.from({ length: MAX_RECENT_SEARCHES }, (_, i) => `query ${i}`);
    const updated = addRecentSearch(history, 'new');

    expect(updated).toHaveLength(MAX_RECENT_SEARCHES);
    expect(updated[0]).toBe('new');
    expect(updated).not.toContain(`query ${MAX_RECENT_SEARCHES - 1}`);
  });

  test('does not mutate the input', () => {
    const history = ['ramen'];
    addRecentSearch(history, 'adobo');
    expect(history).toEqual(['ramen']);
  });
});

describe('parseRecentSearches', () => {
  test('parses a stored list of strings', () => {
    expect(parseRecentSearches('["adobo","ramen"]')).toEqual(['adobo', 'ramen']);
  });

  test('returns an empty list for null, malformed JSON or the wrong shape', () => {
    expect(parseRecentSearches(null)).toEqual([]);
    expect(parseRecentSearches('not json')).toEqual([]);
    expect(parseRecentSearches('{"a":1}')).toEqual([]);
  });

  test('drops non-string and blank entries and caps the length', () => {
    expect(parseRecentSearches('["adobo",42,"  ",""]')).toEqual(['adobo']);
  });
});

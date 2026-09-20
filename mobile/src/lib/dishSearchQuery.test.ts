import { MIN_DISH_SEARCH_LENGTH, buildDishSearchFilter, indexDishesByMerchant } from './dishSearchQuery';

describe('buildDishSearchFilter', () => {
  test('builds an ilike filter across name and description', () => {
    expect(buildDishSearchFilter('adobo')).toBe('name.ilike.%adobo%,description.ilike.%adobo%');
  });

  test('returns null for queries shorter than the minimum', () => {
    expect(buildDishSearchFilter('a'.repeat(MIN_DISH_SEARCH_LENGTH - 1))).toBeNull();
    expect(buildDishSearchFilter('   ')).toBeNull();
  });

  test('strips characters that would break the PostgREST or() filter', () => {
    expect(buildDishSearchFilter('ado,bo(%*)')).toBe('name.ilike.%adobo%,description.ilike.%adobo%');
  });

  test('returns null when sanitising leaves too little to search', () => {
    expect(buildDishSearchFilter('(,%)')).toBeNull();
  });
});

describe('indexDishesByMerchant', () => {
  test('groups dish names under their merchant', () => {
    const index = indexDishesByMerchant([
      { merchant_id: 'a', name: 'Chicken Adobo' },
      { merchant_id: 'a', name: 'Pork Adobo' },
      { merchant_id: 'b', name: 'Adobo Flakes' },
    ]);

    expect(index.get('a')).toEqual(['Chicken Adobo', 'Pork Adobo']);
    expect(index.get('b')).toEqual(['Adobo Flakes']);
  });

  test('ignores rows with no merchant or name', () => {
    const index = indexDishesByMerchant([
      { merchant_id: null, name: 'Orphan' },
      { merchant_id: 'a', name: '' },
    ]);

    expect(index.size).toBe(0);
  });
});

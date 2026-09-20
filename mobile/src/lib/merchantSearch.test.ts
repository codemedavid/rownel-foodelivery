import { searchMerchants, suggestMerchants } from './merchantSearch';

type TestMerchant = {
  id: string;
  name: string;
  category: string;
  cuisineType?: string;
  description?: string;
};

const merchants: TestMerchant[] = [
  { id: 'a', name: 'Manila Grill House', category: 'restaurant', cuisineType: 'Filipino' },
  { id: 'b', name: 'Tokyo Ramen Bar', category: 'restaurant', cuisineType: 'Japanese' },
  {
    id: 'c',
    name: 'Sweet Corner',
    category: 'bakery',
    cuisineType: 'Desserts',
    description: 'Ube cakes and pandesal baked daily',
  },
];

describe('searchMerchants', () => {
  test('returns every merchant, unfiltered, for a blank query', () => {
    const results = searchMerchants(merchants, '  ');
    expect(results.map((r) => r.merchant.id)).toEqual(['a', 'b', 'c']);
  });

  test('matches on merchant name', () => {
    const results = searchMerchants(merchants, 'ramen');
    expect(results.map((r) => r.merchant.id)).toEqual(['b']);
  });

  test('matches on cuisine type', () => {
    const results = searchMerchants(merchants, 'filipino');
    expect(results.map((r) => r.merchant.id)).toEqual(['a']);
  });

  test('matches on description', () => {
    const results = searchMerchants(merchants, 'pandesal');
    expect(results.map((r) => r.merchant.id)).toEqual(['c']);
  });

  test('tolerates typos and swapped letters', () => {
    expect(searchMerchants(merchants, 'ramne').map((r) => r.merchant.id)).toEqual(['b']);
    expect(searchMerchants(merchants, 'ramem').map((r) => r.merchant.id)).toEqual(['b']);
  });

  test('requires every term to match (AND semantics)', () => {
    expect(searchMerchants(merchants, 'tokyo ramen').map((r) => r.merchant.id)).toEqual(['b']);
    expect(searchMerchants(merchants, 'tokyo sushi')).toEqual([]);
  });

  test('ranks name matches above description matches', () => {
    const withNameMatch: TestMerchant[] = [
      { id: 'x', name: 'Cake Lab', category: 'bakery' },
      { id: 'y', name: 'Sweet Corner', category: 'bakery', description: 'ube cake slices' },
    ];
    const results = searchMerchants(withNameMatch, 'cake');
    expect(results.map((r) => r.merchant.id)).toEqual(['x', 'y']);
  });

  test('keeps the incoming order for equally relevant matches', () => {
    const results = searchMerchants(merchants, 'restaurant');
    expect(results.map((r) => r.merchant.id)).toEqual(['a', 'b']);
  });

  test('applies a category filter alongside the query', () => {
    const results = searchMerchants(merchants, '', { category: 'bakery' });
    expect(results.map((r) => r.merchant.id)).toEqual(['c']);
  });

  test('matches dishes from the dish index and reports which ones hit', () => {
    const dishes = new Map([['a', ['Chicken Adobo', 'Pork Sisig']]]);
    const results = searchMerchants(merchants, 'adobo', { dishesByMerchant: dishes });

    expect(results.map((r) => r.merchant.id)).toEqual(['a']);
    expect(results[0].matchedDishes).toEqual(['Chicken Adobo']);
  });

  test('leaves matchedDishes empty when the hit came from merchant fields', () => {
    const dishes = new Map([['b', ['Shoyu Ramen']]]);
    const results = searchMerchants(merchants, 'tokyo', { dishesByMerchant: dishes });
    expect(results[0].matchedDishes).toEqual([]);
  });
});

describe('suggestMerchants', () => {
  test('falls back to merchants matching any single term', () => {
    const results = suggestMerchants(merchants, 'tokyo sushi');
    expect(results.map((r) => r.merchant.id)).toEqual(['b']);
  });

  test('returns nothing when no term matches', () => {
    expect(suggestMerchants(merchants, 'zzzz')).toEqual([]);
  });

  test('caps the number of suggestions', () => {
    expect(suggestMerchants(merchants, 'restaurant', 1)).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { buildDishIndex, searchDishes, searchMerchants, suggestMerchants } from './search';
import { fuzzyEquals, scoreTextMatch, tokenizeQuery } from './textMatch';

const merchants = [
  { id: 'jb', name: 'Jollibee', category: 'fast-food', cuisineType: 'Filipino', description: 'Chickenjoy and burgers' },
  { id: 'cafe', name: 'Bean There Café', category: 'cafe', cuisineType: 'Coffee', description: 'Espresso bar' },
  { id: 'adobo', name: "Nanay's Kitchen", category: 'restaurant', cuisineType: 'Filipino', description: 'Home-cooked adobo' },
];

const dishes = [
  { id: 'd1', merchantId: 'jb', name: 'Chickenjoy', category: 'chicken', description: 'Crispy fried chicken' },
  { id: 'd2', merchantId: 'adobo', name: 'Pork Adobo', category: 'rice-meals', description: 'Classic' },
  { id: 'd3', merchantId: 'cafe', name: 'Iced Latte', category: 'coffee', description: 'Cold espresso with milk' },
];

describe('textMatch', () => {
  it('tokenizes and de-duplicates queries', () => {
    expect(tokenizeQuery('  Chicken  chicken Rice ')).toEqual(['chicken', 'rice']);
  });

  it('ranks exact > prefix > word-prefix > substring > fuzzy', () => {
    expect(scoreTextMatch('adobo', 'adobo')).toBeGreaterThan(scoreTextMatch('adobo rice', 'ado'));
    expect(scoreTextMatch('adobo rice', 'ado')).toBeGreaterThan(scoreTextMatch('pork adobo', 'ado'));
    expect(scoreTextMatch('pork adobo', 'ado')).toBeGreaterThan(scoreTextMatch('badobo', 'ado'));
    expect(scoreTextMatch('badobo', 'ado')).toBeGreaterThan(scoreTextMatch('adobe', 'adobo'));
    expect(scoreTextMatch('adobe', 'adobo')).toBeGreaterThan(0);
  });

  it('allows one typo only on words long enough to be unambiguous', () => {
    expect(fuzzyEquals('chickn', 'chicken')).toBe(true);
    expect(fuzzyEquals('tea', 'sea')).toBe(false);
  });
});

describe('searchMerchants', () => {
  it('returns everything in order for a blank query', () => {
    expect(searchMerchants(merchants, '   ').map((r) => r.merchant.id)).toEqual(['jb', 'cafe', 'adobo']);
  });

  it('ranks a name hit above a description hit', () => {
    const results = searchMerchants(merchants, 'jollibee');
    expect(results[0].merchant.id).toBe('jb');
  });

  it('finds merchants by the dishes they cook', () => {
    const results = searchMerchants(merchants, 'adobo', buildDishIndex(dishes));
    expect(results.map((r) => r.merchant.id)).toContain('adobo');
    expect(results.find((r) => r.merchant.id === 'adobo')?.matchedDishes).toContain('Pork Adobo');
  });

  it('requires every term to match', () => {
    expect(searchMerchants(merchants, 'jollibee coffee')).toEqual([]);
  });

  it('offers looser suggestions when nothing matched', () => {
    const suggestions = suggestMerchants(merchants, 'jollibee coffee');
    expect(suggestions.map((s) => s.merchant.id)).toEqual(expect.arrayContaining(['jb', 'cafe']));
  });
});

describe('searchDishes', () => {
  const names = new Map(merchants.map((m) => [m.id, m.name]));

  it('matches dish names with typos', () => {
    expect(searchDishes(dishes, 'chickn joy', names).map((r) => r.dish.id)).toEqual(['d1']);
  });

  it('lets the store name narrow a dish query', () => {
    expect(searchDishes(dishes, 'bean latte', names).map((r) => r.dish.id)).toEqual(['d3']);
  });

  it('returns nothing for a blank query', () => {
    expect(searchDishes(dishes, '', names)).toEqual([]);
  });
});

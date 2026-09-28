import { describe, expect, it } from 'vitest';
import { describeItemOptions, summarizeItems } from './orderItemOptions';

describe('describeItemOptions', () => {
  it('returns nothing for a plain item', () => {
    expect(describeItemOptions(undefined, undefined)).toEqual([]);
    expect(describeItemOptions(null, [])).toEqual([]);
  });

  it('names a single variation', () => {
    expect(describeItemOptions({ id: 'v1', name: 'Large', price: 20 }, null)).toEqual(['Large']);
  });

  it('labels grouped variations with their group', () => {
    const variation = { Size: { name: 'Large', price: 20 }, Spice: { name: 'Hot', price: 0 } };
    expect(describeItemOptions(variation, null)).toEqual(['Size: Large', 'Spice: Hot']);
  });

  it('lists add-ons and shows quantities above one', () => {
    const addOns = [
      { name: 'Extra rice', price: 15, quantity: 2 },
      { name: 'Egg', price: 10, quantity: 1 },
    ];
    expect(describeItemOptions(null, addOns)).toEqual(['+ Extra rice ×2', '+ Egg']);
  });

  it('accepts a legacy string variation', () => {
    expect(describeItemOptions('Medium', undefined)).toEqual(['Medium']);
  });

  it('ignores malformed entries instead of printing raw JSON', () => {
    expect(describeItemOptions({ price: 5 }, [{ price: 3 }, 'x', null])).toEqual([]);
  });
});

describe('summarizeItems', () => {
  it('lists each item with its quantity', () => {
    const items = [
      { name: 'Chickenjoy', quantity: 2 },
      { name: 'Sundae', quantity: 1 },
    ];
    expect(summarizeItems(items)).toBe('2× Chickenjoy, 1× Sundae');
  });

  it('is empty when there are no items', () => {
    expect(summarizeItems([])).toBe('');
  });
});

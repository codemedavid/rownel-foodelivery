import { groupMenuItemsByCategory, searchMenuItems } from './menuSearch';
import type { MenuItem } from '../types';

const item = (overrides: Partial<MenuItem> & Pick<MenuItem, 'id' | 'name'>): MenuItem => ({
  merchantId: 'm1',
  description: '',
  basePrice: 100,
  category: 'Mains',
  ...overrides,
});

const items: MenuItem[] = [
  item({ id: '1', name: 'Chicken Adobo', description: 'Slow braised in soy and vinegar' }),
  item({ id: '2', name: 'Pork Sisig', category: 'Sizzling' }),
  item({ id: '3', name: 'Iced Latte', category: 'Drinks', description: 'Espresso over milk' }),
  item({
    id: '4',
    name: 'Halo-Halo',
    category: 'Desserts',
    addOns: [{ id: 'a1', name: 'Extra Leche Flan', price: 30, category: 'Toppings' }],
  }),
];

describe('searchMenuItems', () => {
  test('returns everything for a blank query', () => {
    expect(searchMenuItems(items, '')).toHaveLength(items.length);
  });

  test('matches on item name', () => {
    expect(searchMenuItems(items, 'adobo').map((i) => i.id)).toEqual(['1']);
  });

  test('matches on description', () => {
    expect(searchMenuItems(items, 'espresso').map((i) => i.id)).toEqual(['3']);
  });

  test('matches on category', () => {
    expect(searchMenuItems(items, 'drinks').map((i) => i.id)).toEqual(['3']);
  });

  test('matches on add-on name', () => {
    expect(searchMenuItems(items, 'leche').map((i) => i.id)).toEqual(['4']);
  });

  test('tolerates a typo', () => {
    expect(searchMenuItems(items, 'adobbo').map((i) => i.id)).toEqual(['1']);
  });

  test('ranks name matches ahead of description matches', () => {
    const ranked = searchMenuItems(
      [
        item({ id: 'a', name: 'Sizzling Plate', description: 'served with sisig sauce' }),
        item({ id: 'b', name: 'Sisig Rice Bowl' }),
      ],
      'sisig'
    );
    expect(ranked.map((i) => i.id)).toEqual(['b', 'a']);
  });

  test('returns nothing when no item matches', () => {
    expect(searchMenuItems(items, 'sushi')).toEqual([]);
  });
});

describe('groupMenuItemsByCategory', () => {
  test('groups items into sections keeping first-seen category order', () => {
    const sections = groupMenuItemsByCategory(items);
    expect(sections.map((s) => s.title)).toEqual(['Mains', 'Sizzling', 'Drinks', 'Desserts']);
    expect(sections[0].data.map((i) => i.id)).toEqual(['1']);
  });

  test('returns no sections for an empty list', () => {
    expect(groupMenuItemsByCategory([])).toEqual([]);
  });
});

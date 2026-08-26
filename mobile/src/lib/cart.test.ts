import {
  calculateItemPrice,
  addToCart,
  updateLineQuantity,
  removeLine,
  getCartTotal,
  getCartItemCount,
} from './cart';
import { AddOn, CartItem, MenuItem, Variation } from '../types';

const burger: MenuItem = {
  id: 'item-1',
  merchantId: 'm-1',
  name: 'Cheeseburger',
  description: 'A burger',
  basePrice: 120,
  category: 'burgers',
};

const largeSize: Variation = { id: 'v-large', name: 'Large', price: 30 };
const extraCheese: AddOn = { id: 'a-cheese', name: 'Extra Cheese', price: 15, category: 'extras' };

describe('calculateItemPrice', () => {
  it('returns base price when there are no selections', () => {
    expect(calculateItemPrice(burger)).toBe(120);
  });

  it('prefers effectivePrice over basePrice when discounted', () => {
    const discounted = { ...burger, effectivePrice: 99, isOnDiscount: true };
    expect(calculateItemPrice(discounted)).toBe(99);
  });

  it('adds prices of selected variations across groups', () => {
    const iced: Variation = { id: 'v-iced', name: 'Iced', price: 10 };
    const price = calculateItemPrice(burger, { Size: largeSize, Temperature: iced });
    expect(price).toBe(160);
  });

  it('adds add-on prices multiplied by their quantity', () => {
    const price = calculateItemPrice(burger, undefined, [{ ...extraCheese, quantity: 2 }]);
    expect(price).toBe(150);
  });
});

describe('addToCart', () => {
  it('adds a new line with computed total price', () => {
    const cart = addToCart([], burger, 2, { Size: largeSize }, [extraCheese]);

    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
    expect(cart[0].totalPrice).toBe(165);
    expect(cart[0].menuItemId).toBe('item-1');
  });

  it('merges quantity into an existing line with identical selections', () => {
    const once = addToCart([], burger, 1, { Size: largeSize });
    const twice = addToCart(once, burger, 2, { Size: largeSize });

    expect(twice).toHaveLength(1);
    expect(twice[0].quantity).toBe(3);
  });

  it('creates a separate line when selections differ', () => {
    const small: Variation = { id: 'v-small', name: 'Small', price: 0 };
    const once = addToCart([], burger, 1, { Size: largeSize });
    const twice = addToCart(once, burger, 1, { Size: small });

    expect(twice).toHaveLength(2);
  });

  it('does not mutate the previous cart array', () => {
    const before: CartItem[] = [];
    const after = addToCart(before, burger, 1);

    expect(before).toHaveLength(0);
    expect(after).not.toBe(before);
  });
});

describe('updateLineQuantity / removeLine', () => {
  it('updates the quantity of the targeted line immutably', () => {
    const cart = addToCart([], burger, 1);
    const updated = updateLineQuantity(cart, cart[0].lineId, 5);

    expect(updated[0].quantity).toBe(5);
    expect(cart[0].quantity).toBe(1);
  });

  it('removes the line when quantity drops to zero', () => {
    const cart = addToCart([], burger, 1);
    expect(updateLineQuantity(cart, cart[0].lineId, 0)).toHaveLength(0);
  });

  it('removeLine drops only the targeted line', () => {
    const small: Variation = { id: 'v-small', name: 'Small', price: 0 };
    let cart = addToCart([], burger, 1, { Size: largeSize });
    cart = addToCart(cart, burger, 1, { Size: small });

    const remaining = removeLine(cart, cart[0].lineId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].lineId).toBe(cart[1].lineId);
  });
});

describe('cart totals', () => {
  it('sums line totals and item counts', () => {
    let cart = addToCart([], burger, 2); // 240
    cart = addToCart(cart, burger, 1, { Size: largeSize }); // 150

    expect(getCartTotal(cart)).toBe(390);
    expect(getCartItemCount(cart)).toBe(3);
  });

  it('returns zero for an empty cart', () => {
    expect(getCartTotal([])).toBe(0);
    expect(getCartItemCount([])).toBe(0);
  });
});

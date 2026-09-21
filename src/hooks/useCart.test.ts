import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CART_STORAGE_KEY, useCart } from './useCart';
import type { MenuItem } from '../types';

const burger: MenuItem = {
  id: 'burger',
  merchantId: 'm1',
  name: 'Burger',
  description: '',
  basePrice: 100,
  category: 'mains',
  available: true,
};

describe('useCart', () => {
  beforeEach(() => localStorage.clear());

  it('persists the basket so a refresh keeps it', () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.addToCart(burger, 2));

    const stored = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].quantity).toBe(2);

    const { result: reloaded } = renderHook(() => useCart());
    expect(reloaded.current.getTotalItems()).toBe(2);
    expect(reloaded.current.getTotalPrice()).toBe(200);
  });

  it('merges identical lines and separates customised ones', () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.addToCart(burger, 1));
    act(() => result.current.addToCart(burger, 1));
    act(() => result.current.addToCart(burger, 1, undefined, [{ id: 'cheese', name: 'Cheese', price: 15, category: 'extras' }]));

    expect(result.current.cartItems).toHaveLength(2);
    expect(result.current.cartItems[0].quantity).toBe(2);
    expect(result.current.cartItems[1].totalPrice).toBe(115);
  });

  it('removes a line when quantity drops to zero and clears storage when empty', () => {
    const { result } = renderHook(() => useCart());
    act(() => result.current.addToCart(burger, 1));
    const id = result.current.cartItems[0].id;
    act(() => result.current.updateQuantity(id, 0));
    expect(result.current.cartItems).toHaveLength(0);
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('ignores corrupt stored data', () => {
    localStorage.setItem(CART_STORAGE_KEY, '{oops');
    const { result } = renderHook(() => useCart());
    expect(result.current.cartItems).toEqual([]);
  });
});

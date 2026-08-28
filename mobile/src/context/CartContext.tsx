import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  addToCart,
  getCartItemCount,
  getCartMerchantIds,
  getCartTotal,
  groupCartByMerchant,
  removeLine,
  removeMerchantLines,
  updateLineQuantity,
} from '../lib/cart';
import { AddOn, CartItem, MenuItem, Merchant, Variation } from '../types';

interface CartContextValue {
  cartItems: CartItem[];
  /** Every merchant represented in the basket, keyed by id. */
  merchantsById: Record<string, Merchant>;
  merchantIds: string[];
  itemsByMerchant: Record<string, CartItem[]>;
  itemCount: number;
  subtotal: number;
  addItem: (
    merchant: Merchant,
    item: MenuItem,
    quantity: number,
    selectedVariations?: Record<string, Variation>,
    addOns?: AddOn[]
  ) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  removeMerchant: (merchantId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [merchantsById, setMerchantsById] = useState<Record<string, Merchant>>({});

  const addItem = useCallback<CartContextValue['addItem']>(
    (merchant, item, quantity, selectedVariations, addOns) => {
      // Baskets hold several restaurants at once (same as the web app) — adding
      // from a new merchant appends rather than replacing what is already there.
      setCartItems((prev) => addToCart(prev, item, quantity, selectedVariations, addOns));
      setMerchantsById((prev) => ({ ...prev, [merchant.id]: merchant }));
    },
    []
  );

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    setCartItems((prev) => updateLineQuantity(prev, lineId, quantity));
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setCartItems((prev) => removeLine(prev, lineId));
  }, []);

  const removeMerchant = useCallback((merchantId: string) => {
    setCartItems((prev) => removeMerchantLines(prev, merchantId));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setMerchantsById({});
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cartItems,
      merchantsById,
      merchantIds: getCartMerchantIds(cartItems),
      itemsByMerchant: groupCartByMerchant(cartItems),
      itemCount: getCartItemCount(cartItems),
      subtotal: getCartTotal(cartItems),
      addItem,
      updateQuantity,
      removeItem,
      removeMerchant,
      clearCart,
    }),
    [cartItems, merchantsById, addItem, updateQuantity, removeItem, removeMerchant, clearCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

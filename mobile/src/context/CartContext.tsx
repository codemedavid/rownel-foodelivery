import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  addToCart,
  getCartItemCount,
  getCartTotal,
  removeLine,
  updateLineQuantity,
} from '../lib/cart';
import { AddOn, CartItem, MenuItem, Merchant, Variation } from '../types';

interface CartContextValue {
  cartItems: CartItem[];
  merchant: Merchant | null;
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
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [merchant, setMerchant] = useState<Merchant | null>(null);

  const addItem = useCallback<CartContextValue['addItem']>(
    (nextMerchant, item, quantity, selectedVariations, addOns) => {
      setCartItems((prev) => {
        // One merchant per basket (Grab/FoodPanda behavior): switching
        // merchants starts a fresh basket.
        const sameMerchant = merchant?.id === nextMerchant.id;
        const base = sameMerchant ? prev : [];
        return addToCart(base, item, quantity, selectedVariations, addOns);
      });
      setMerchant(nextMerchant);
    },
    [merchant?.id]
  );

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    setCartItems((prev) => updateLineQuantity(prev, lineId, quantity));
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setCartItems((prev) => removeLine(prev, lineId));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setMerchant(null);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cartItems,
      merchant,
      itemCount: getCartItemCount(cartItems),
      subtotal: getCartTotal(cartItems),
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    }),
    [cartItems, merchant, addItem, updateQuantity, removeItem, clearCart]
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

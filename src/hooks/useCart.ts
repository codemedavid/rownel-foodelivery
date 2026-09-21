import { useState, useCallback, useEffect } from 'react';
import { CartItem, MenuItem, Variation, AddOn } from '../types';

export const CART_STORAGE_KEY = 'rownel:cart';

const isCartItem = (value: unknown): value is CartItem =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as CartItem).id === 'string' &&
  typeof (value as CartItem).merchantId === 'string' &&
  typeof (value as CartItem).quantity === 'number' &&
  typeof (value as CartItem).totalPrice === 'number';

function readStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isCartItem) : [];
  } catch {
    return [];
  }
}

function persistCart(items: CartItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(CART_STORAGE_KEY);
    else localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage unavailable — cart still works for this session
  }
}

const calculateItemPrice = (
  item: MenuItem,
  variation?: Variation,
  addOns?: AddOn[],
  selectedVariations?: Record<string, Variation>
) => {
  // Prefer effectivePrice (discounted) when available, fallback to basePrice
  let price = item.effectivePrice ?? item.basePrice;
  if (variation) price += variation.price;
  if (selectedVariations) {
    Object.values(selectedVariations).forEach((selected) => {
      price += selected.price;
    });
  }
  if (addOns) {
    addOns.forEach((addOn) => {
      price += addOn.price;
    });
  }
  return price;
};

/** Group add-ons by id and count how many times each was chosen. */
const groupAddOns = (addOns?: AddOn[]): (AddOn & { quantity: number })[] | undefined =>
  addOns?.reduce<(AddOn & { quantity: number })[]>((groups, addOn) => {
    const existing = groups.find((g) => g.id === addOn.id);
    if (existing) {
      return groups.map((g) => (g.id === addOn.id ? { ...g, quantity: g.quantity + 1 } : g));
    }
    return [...groups, { ...addOn, quantity: 1 }];
  }, []);

const variationsSignature = (selectedVariations?: Record<string, Variation>): string[] =>
  selectedVariations
    ? Object.entries(selectedVariations)
        .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
        .map(([groupName, selected]) => `${groupName}:${selected.id}`)
    : [];

const addOnsSignature = (addOns?: { id: string; quantity?: number }[]): string =>
  JSON.stringify(addOns?.map((a) => `${a.id}-${a.quantity || 1}`).sort() ?? []);

/**
 * Cart state, persisted to localStorage so a refresh (or a guest coming back
 * later) never loses what they picked.
 */
export const useCart = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>(readStoredCart);
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    persistCart(cartItems);
  }, [cartItems]);

  const addToCart = useCallback((
    item: MenuItem,
    quantity: number = 1,
    variation?: Variation,
    addOns?: AddOn[],
    selectedVariations?: Record<string, Variation>
  ) => {
    const totalPrice = calculateItemPrice(item, variation, addOns, selectedVariations);
    const menuItemId = item.id;
    const groupedAddOns = groupAddOns(addOns);
    const selectedVariationsSignature = variationsSignature(selectedVariations);

    setCartItems((prev) => {
      const existingItem = prev.find(
        (cartItem) =>
          cartItem.menuItemId === menuItemId &&
          cartItem.selectedVariation?.id === variation?.id &&
          JSON.stringify(variationsSignature(cartItem.selectedVariations)) === JSON.stringify(selectedVariationsSignature) &&
          addOnsSignature(cartItem.selectedAddOns) === addOnsSignature(groupedAddOns)
      );

      if (existingItem) {
        return prev.map((cartItem) =>
          cartItem === existingItem ? { ...cartItem, quantity: cartItem.quantity + quantity } : cartItem
        );
      }

      const uniqueId = `${item.id}-${variation?.id || 'default'}-${selectedVariationsSignature.join('|') || 'no-groups'}-${groupedAddOns?.map((a) => `${a.id}-${a.quantity}`).join(',') || 'none'}`;
      return [
        ...prev,
        {
          ...item,
          id: uniqueId,
          menuItemId,
          quantity,
          selectedVariation: variation,
          selectedVariations,
          selectedAddOns: groupedAddOns || [],
          totalPrice,
        },
      ];
    });
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    setCartItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity } : item)));
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const getTotalPrice = useCallback(() => {
    return cartItems.reduce((total, item) => total + item.totalPrice * item.quantity, 0);
  }, [cartItems]);

  const getTotalItems = useCallback(() => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  }, [cartItems]);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  return {
    cartItems,
    isCartOpen,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    getTotalPrice,
    getTotalItems,
    openCart,
    closeCart,
  };
};

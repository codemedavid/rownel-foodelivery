import { AddOn, CartItem, MenuItem, Variation } from '../types';

const selectionSignature = (
  selectedVariations?: Record<string, Variation>,
  addOns?: AddOn[]
): string => {
  const variationSig = selectedVariations
    ? Object.entries(selectedVariations)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([group, v]) => `${group}:${v.id}`)
        .join('|')
    : '';
  const addOnSig = addOns
    ? [...addOns]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((a) => `${a.id}x${a.quantity ?? 1}`)
        .join('|')
    : '';
  return `${variationSig}::${addOnSig}`;
};

export const calculateItemPrice = (
  item: MenuItem,
  selectedVariations?: Record<string, Variation>,
  addOns?: AddOn[]
): number => {
  let price = item.effectivePrice ?? item.basePrice;
  if (selectedVariations) {
    for (const variation of Object.values(selectedVariations)) {
      price += variation.price;
    }
  }
  if (addOns) {
    for (const addOn of addOns) {
      price += addOn.price * (addOn.quantity ?? 1);
    }
  }
  return price;
};

export const addToCart = (
  cart: readonly CartItem[],
  item: MenuItem,
  quantity: number = 1,
  selectedVariations?: Record<string, Variation>,
  addOns?: AddOn[]
): CartItem[] => {
  const lineId = `${item.id}::${selectionSignature(selectedVariations, addOns)}`;
  const existing = cart.find((line) => line.lineId === lineId);

  if (existing) {
    return cart.map((line) =>
      line.lineId === lineId ? { ...line, quantity: line.quantity + quantity } : line
    );
  }

  const newLine: CartItem = {
    ...item,
    lineId,
    menuItemId: item.id,
    quantity,
    selectedVariations,
    selectedAddOns: addOns,
    totalPrice: calculateItemPrice(item, selectedVariations, addOns),
  };
  return [...cart, newLine];
};

export const updateLineQuantity = (
  cart: readonly CartItem[],
  lineId: string,
  quantity: number
): CartItem[] => {
  if (quantity <= 0) {
    return removeLine(cart, lineId);
  }
  return cart.map((line) => (line.lineId === lineId ? { ...line, quantity } : line));
};

export const removeLine = (cart: readonly CartItem[], lineId: string): CartItem[] =>
  cart.filter((line) => line.lineId !== lineId);

export const getCartTotal = (cart: readonly CartItem[]): number =>
  cart.reduce((sum, line) => sum + line.totalPrice * line.quantity, 0);

export const getCartItemCount = (cart: readonly CartItem[]): number =>
  cart.reduce((count, line) => count + line.quantity, 0);

import React, { createContext, useContext, ReactNode } from 'react';
import { useCart } from '../hooks/useCart';

interface CartContextType {
  cartItems: ReturnType<typeof useCart>['cartItems'];
  isCartOpen: ReturnType<typeof useCart>['isCartOpen'];
  addToCart: ReturnType<typeof useCart>['addToCart'];
  updateQuantity: ReturnType<typeof useCart>['updateQuantity'];
  removeFromCart: ReturnType<typeof useCart>['removeFromCart'];
  clearCart: ReturnType<typeof useCart>['clearCart'];
  getTotalPrice: ReturnType<typeof useCart>['getTotalPrice'];
  getTotalItems: ReturnType<typeof useCart>['getTotalItems'];
  openCart: ReturnType<typeof useCart>['openCart'];
  closeCart: ReturnType<typeof useCart>['closeCart'];
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCartContext = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCartContext must be used within a CartProvider');
  }
  return context;
};

interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const cart = useCart();

  return (
    <CartContext.Provider value={cart}>
      {children}
    </CartContext.Provider>
  );
};


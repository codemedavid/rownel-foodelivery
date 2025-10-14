import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';

interface FloatingCartButtonProps {
  onCartClick: () => void;
}

const FloatingCartButton: React.FC<FloatingCartButtonProps> = ({ onCartClick }) => {
  const { getTotalItems } = useCartContext();
  const itemCount = getTotalItems();
  
  if (itemCount === 0) return null;

  return (
    <button
      onClick={onCartClick}
      className="fixed bottom-6 right-6 bg-green-600 text-white p-4 rounded-full shadow-lg hover:bg-green-700 transition-all duration-200 transform hover:scale-110 z-40 md:hidden"
    >
      <div className="relative">
        <ShoppingCart className="h-6 w-6" />
        <span className="absolute -top-2 -right-2 bg-yellow-brand text-charcoal text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
          {itemCount}
        </span>
      </div>
    </button>
  );
};

export default FloatingCartButton;
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, ChevronRight } from 'lucide-react';
import { useCartContext } from '../../contexts/CartContext';
import { formatPeso } from '../ui';

/** Sticky "View basket" bar (Grab/foodpanda style) shown while the basket has items. */
const BasketBar: React.FC<{ label?: string }> = ({ label = 'View basket' }) => {
  const navigate = useNavigate();
  const { getTotalItems, getTotalPrice } = useCartContext();
  const count = getTotalItems();
  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-[60px] z-40 px-3 md:bottom-4">
      <button
        type="button"
        onClick={() => navigate('/cart')}
        className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-2xl bg-brand-600 px-4 py-3.5 text-white shadow-xl transition-transform active:scale-[0.99]"
      >
        <span className="flex items-center gap-3">
          <span className="relative">
            <ShoppingBag className="h-5 w-5" />
            <span className="absolute -right-2 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-brand-700">
              {count}
            </span>
          </span>
          <span className="text-sm font-semibold">{label}</span>
        </span>
        <span className="flex items-center gap-1 text-sm font-bold">
          {formatPeso(getTotalPrice())}
          <ChevronRight className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
};

export default BasketBar;

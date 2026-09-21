import React from 'react';
import { Plus, Minus } from 'lucide-react';
import type { MenuItem } from '../../types';
import OptimizedImage from '../OptimizedImage';
import { formatPeso } from '../ui';

const ROW_IMAGE_WIDTH = 240;

interface MenuItemRowProps {
  item: MenuItem;
  quantity: number;
  cartItemId?: string;
  disabled?: boolean;
  onQuickAdd: (item: MenuItem) => void;
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onOpenDetails: (itemId: string) => void;
}

const hasOptions = (item: MenuItem) =>
  Boolean((item.variationGroups && item.variationGroups.length > 0) || item.variations?.length || item.addOns?.length);

const isOutOfStock = (item: MenuItem) => item.trackInventory && (item.stockQuantity ?? 0) <= 0;

/**
 * Compact Grab-style menu row: text left, image + add button right. Simple
 * items add straight to the basket; items with options open the details page.
 */
const MenuItemRow: React.FC<MenuItemRowProps> = ({
  item,
  quantity,
  cartItemId,
  disabled = false,
  onQuickAdd,
  onUpdateQuantity,
  onOpenDetails,
}) => {
  const basePrice = item.basePrice;
  const price = item.effectivePrice ?? basePrice;
  const isDiscounted = price < basePrice;
  const customizable = hasOptions(item);
  const unavailable = item.available === false || disabled || isOutOfStock(item);
  const lowStock = item.trackInventory && item.stockQuantity != null && item.stockQuantity > 0 && item.stockQuantity <= (item.lowStockThreshold ?? 0);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (customizable) {
      onOpenDetails(item.id);
      return;
    }
    if (cartItemId) onUpdateQuantity(cartItemId, quantity + 1);
    else onQuickAdd(item);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpenDetails(item.id);
      }}
      className={`flex gap-3 border-b border-gray-100 bg-white px-4 py-3.5 last:border-b-0 ${unavailable ? 'opacity-55' : 'hover:bg-gray-50'}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h4 className="text-[15px] font-semibold leading-snug text-gray-900">{item.name}</h4>
          {item.popular && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Popular</span>}
          {isDiscounted && (
            <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
              {Math.round(((basePrice - price) / basePrice) * 100)}% off
            </span>
          )}
        </div>
        {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{item.description}</p>}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">{formatPeso(price)}</span>
          {isDiscounted && <span className="text-xs text-gray-400 line-through">{formatPeso(basePrice)}</span>}
          {customizable && !unavailable && <span className="text-[11px] text-gray-400">· Customisable</span>}
        </div>
        {unavailable && (
          <p className="mt-1 text-[11px] font-medium text-red-600">
            {disabled ? 'Not available right now' : isOutOfStock(item) ? 'Out of stock' : 'Unavailable'}
          </p>
        )}
        {!unavailable && lowStock && <p className="mt-1 text-[11px] font-medium text-amber-700">Only {item.stockQuantity} left</p>}
      </div>

      <div className="relative h-24 w-24 flex-shrink-0">
        <div className="h-full w-full overflow-hidden rounded-xl bg-gray-100">
          <OptimizedImage
            src={item.image}
            alt={item.name}
            width={ROW_IMAGE_WIDTH}
            className="h-full w-full object-cover"
            fallback={<div className="flex h-full w-full items-center justify-center text-2xl">🍽️</div>}
          />
        </div>
        {!unavailable && (
          <div className="absolute -bottom-2 right-1">
            {quantity > 0 && !customizable && cartItemId ? (
              <div className="flex items-center gap-1 rounded-full bg-white p-0.5 shadow-md ring-1 ring-gray-200">
                <button
                  type="button"
                  aria-label={`Remove one ${item.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateQuantity(cartItemId, quantity - 1);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-brand-700 hover:bg-brand-50"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[16px] text-center text-sm font-bold text-gray-900">{quantity}</span>
                <button
                  type="button"
                  aria-label={`Add one more ${item.name}`}
                  onClick={handleAdd}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label={`Add ${item.name}`}
                onClick={handleAdd}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand-700 shadow-md ring-1 ring-gray-200 hover:bg-brand-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuItemRow;

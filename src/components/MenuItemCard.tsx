import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { MenuItem } from '../types';

interface MenuItemCardProps {
  item: MenuItem;
  quantity: number;
  cartItemId?: string;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onOpenDetails: (itemId: string) => void;
}

const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  quantity,
  cartItemId,
  onUpdateQuantity,
  onOpenDetails,
}) => {
  const basePrice = item.basePrice;
  const effectivePrice = item.effectivePrice ?? basePrice;
  const hasExplicitDiscount = Boolean(item.isOnDiscount && item.discountPrice !== undefined);
  const hasImplicitDiscount = effectivePrice < basePrice;
  const showDiscount = hasExplicitDiscount || hasImplicitDiscount;
  const discountedPrice = hasExplicitDiscount
    ? (item.discountPrice as number)
    : hasImplicitDiscount
      ? effectivePrice
      : undefined;

  const hasCustomizations = Boolean((item.variationGroups && item.variationGroups.length > 0) || item.variations?.length || item.addOns?.length);

  const handleIncrement = () => {
    if (!cartItemId) return;
    onUpdateQuantity(cartItemId, quantity + 1);
  };

  const handleDecrement = () => {
    if (quantity > 0 && cartItemId) {
      onUpdateQuantity(cartItemId, quantity - 1);
    }
  };

  return (
    <div className={`group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md transition-all duration-300 hover:shadow-2xl ${!item.available ? 'opacity-60' : ''}`}>
      <div className="relative h-52 bg-gradient-to-br from-green-50 to-green-100">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`absolute inset-0 flex items-center justify-center ${item.image ? 'hidden' : ''}`}>
          <div className="text-6xl text-gray-400 opacity-20">☕</div>
        </div>

        <div className="absolute left-3 top-3 flex flex-col gap-2">
          {item.isOnDiscount && item.discountPrice && (
            <div className="animate-pulse rounded-full bg-gradient-to-r from-red-500 to-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg">
              SALE
            </div>
          )}
          {item.popular && (
            <div className="rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg">
              ⭐ POPULAR
            </div>
          )}
        </div>

        {!item.available && (
          <div className="absolute right-3 top-3 rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg">
            UNAVAILABLE
          </div>
        )}

        {showDiscount && discountedPrice !== undefined && (
          <div className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2 py-1 text-xs font-bold text-red-600 shadow-lg backdrop-blur-sm">
            {Math.round(((basePrice - discountedPrice) / basePrice) * 100)}% OFF
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="mb-3 flex items-start justify-between">
          <h4 className="flex-1 pr-2 text-lg font-semibold leading-tight text-gray-900">{item.name}</h4>
          {hasCustomizations && (
            <div className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">
              Customizable
            </div>
          )}
        </div>

        <p className={`mb-4 text-sm leading-relaxed ${!item.available ? 'text-gray-400' : 'text-gray-600'}`}>
          {!item.available ? 'Currently Unavailable' : item.description}
        </p>

        <div className="mb-4 flex items-center justify-between">
          <div className="flex-1">
            {showDiscount && discountedPrice !== undefined ? (
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl font-bold text-red-600">₱{discountedPrice.toFixed(2)}</span>
                  <span className="text-sm text-gray-500 line-through">₱{basePrice.toFixed(2)}</span>
                </div>
                <div className="text-xs text-gray-500">Save ₱{(basePrice - discountedPrice).toFixed(2)}</div>
              </div>
            ) : (
              <div className="text-2xl font-bold text-gray-900">₱{basePrice.toFixed(2)}</div>
            )}

            {hasCustomizations && <div className="mt-1 text-xs text-gray-500">Final price depends on selected options</div>}
          </div>

          <div className="flex-shrink-0">
            {!item.available ? (
              <button disabled className="cursor-not-allowed rounded-xl bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500">
                Unavailable
              </button>
            ) : hasCustomizations ? (
              <button
                type="button"
                onClick={() => onOpenDetails(item.id)}
                className="rounded-xl bg-gradient-to-r from-green-600 to-green-700 px-6 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:scale-105 hover:from-green-700 hover:to-green-800 hover:shadow-xl"
              >
                View details
              </button>
            ) : quantity === 0 ? (
              <button
                type="button"
                onClick={() => onOpenDetails(item.id)}
                className="rounded-xl bg-gradient-to-r from-green-600 to-green-700 px-6 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:scale-105 hover:from-green-700 hover:to-green-800 hover:shadow-xl"
              >
                Add to Cart
              </button>
            ) : (
              <div className="flex items-center space-x-2 rounded-xl border border-yellow-200 bg-gradient-to-r from-yellow-100 to-orange-100 p-1">
                <button onClick={handleDecrement} className="rounded-lg p-2 transition-colors duration-200 hover:scale-110 hover:bg-yellow-200">
                  <Minus className="h-4 w-4 text-gray-700" />
                </button>
                <span className="min-w-[28px] text-center text-sm font-bold text-gray-900">{quantity}</span>
                <button onClick={handleIncrement} className="rounded-lg p-2 transition-colors duration-200 hover:scale-110 hover:bg-yellow-200">
                  <Plus className="h-4 w-4 text-gray-700" />
                </button>
              </div>
            )}
          </div>
        </div>

        {item.trackInventory && item.stockQuantity !== null && (
          <div className="mt-3">
            {item.stockQuantity > (item.lowStockThreshold ?? 0) ? (
              <div className="flex items-center space-x-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                <span className="font-semibold">✓</span>
                <span className="font-medium">{item.stockQuantity} in stock</span>
              </div>
            ) : item.stockQuantity > 0 ? (
              <div className="flex items-center space-x-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700 animate-pulse">
                <span className="font-semibold">⚠️</span>
                <span className="font-medium">Only {item.stockQuantity} left!</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <span className="font-semibold">✕</span>
                <span className="font-medium">Out of stock</span>
              </div>
            )}
          </div>
        )}

        {item.addOns && item.addOns.length > 0 && (
          <div className="mt-2 flex items-center space-x-1 rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-500">
            <span>+</span>
            <span>
              {item.addOns.length} add-on{item.addOns.length > 1 ? 's' : ''} available
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuItemCard;

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, Trash2, Store, AlertTriangle, Clock, PlusCircle } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { useMerchant } from '../contexts/MerchantContext';
import { getMinOrderStatus, isMerchantOpen } from '../lib/timeUtils';
import { EmptyState, formatPeso } from './ui';

/** Basket page (bottom-nav "Cart"). Groups items by store and leads to checkout. */
const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { cartItems, updateQuantity, removeFromCart, clearCart, getTotalPrice, getTotalItems } = useCartContext();
  const { merchants, selectMerchantById } = useMerchant();

  const groups = useMemo(() => {
    const byMerchant = new Map<string, typeof cartItems>();
    cartItems.forEach((item) => byMerchant.set(item.merchantId, [...(byMerchant.get(item.merchantId) ?? []), item]));
    return [...byMerchant.entries()].map(([merchantId, items]) => {
      const merchant = merchants.find((m) => m.id === merchantId);
      const subtotal = items.reduce((sum, i) => sum + i.totalPrice * i.quantity, 0);
      return {
        merchantId,
        merchant,
        items,
        subtotal,
        minOrder: getMinOrderStatus(merchant?.minimumOrder ?? 0, subtotal),
        openStatus: isMerchantOpen(merchant?.openingHours),
      };
    });
  }, [cartItems, merchants]);

  const hasBlocker = groups.some((g) => !g.minOrder.met || !g.openStatus.isOpen);

  if (cartItems.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 pb-24">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <h1 className="mb-6 text-lg font-bold text-gray-900">Basket</h1>
          <EmptyState
            emoji="🧺"
            title="Your basket is empty"
            body="Find something delicious near you."
            action={
              <button type="button" onClick={() => navigate('/')} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white">
                Browse stores
              </button>
            }
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-40 md:pb-32">
      <div className="sticky top-0 z-30 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-3 py-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="rounded-full p-2 text-gray-700 hover:bg-gray-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">Basket</h1>
          </div>
          <button type="button" onClick={clearCart} className="text-sm font-medium text-gray-500 hover:text-red-600">
            Clear
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {groups.map((group) => (
          <section key={group.merchantId} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Store className="h-4 w-4 flex-shrink-0 text-brand-700" />
                <h2 className="truncate text-sm font-bold text-gray-900">{group.merchant?.name ?? 'Store'}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  selectMerchantById(group.merchantId);
                  navigate(`/merchant/${group.merchantId}`);
                }}
                className="flex items-center gap-1 text-xs font-semibold text-brand-700"
              >
                <PlusCircle className="h-4 w-4" /> Add items
              </button>
            </div>

            {!group.openStatus.isOpen && (
              <p className="flex items-center gap-2 bg-red-50 px-4 py-2 text-xs text-red-700">
                <Clock className="h-4 w-4" /> Closed now. {group.openStatus.nextOpenTime}
              </p>
            )}
            {!group.minOrder.met && (
              <p className="flex items-center gap-2 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4" /> Add {formatPeso(group.minOrder.remaining)} more to reach the {formatPeso(group.minOrder.minimum)} minimum.
              </p>
            )}

            {group.items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                  {item.selectedVariation && <p className="text-xs text-gray-500">{item.selectedVariation.name}</p>}
                  {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
                    <p className="text-xs text-gray-500">{Object.entries(item.selectedVariations).map(([g, v]) => `${g}: ${v.name}`).join(', ')}</p>
                  )}
                  {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                    <p className="text-xs text-gray-500">+ {item.selectedAddOns.map((a) => (a.quantity && a.quantity > 1 ? `${a.name} ×${a.quantity}` : a.name)).join(', ')}</p>
                  )}
                  <p className="mt-1 text-sm font-bold text-gray-900">{formatPeso(item.totalPrice * item.quantity)}</p>
                </div>
                <div className="flex items-center gap-1 rounded-full bg-gray-100 p-0.5">
                  <button
                    type="button"
                    aria-label={`Decrease ${item.name}`}
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-700 hover:bg-white"
                  >
                    {item.quantity === 1 ? <Trash2 className="h-4 w-4 text-red-500" /> : <Minus className="h-4 w-4" />}
                  </button>
                  <span className="min-w-[20px] text-center text-sm font-bold">{item.quantity}</span>
                  <button
                    type="button"
                    aria-label={`Increase ${item.name}`}
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <button type="button" aria-label={`Remove ${item.name}`} onClick={() => removeFromCart(item.id)} className="sr-only">
                  Remove
                </button>
              </div>
            ))}

            <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-semibold text-gray-900">{formatPeso(group.subtotal)}</span>
            </div>
          </section>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-[60px] z-40 border-t border-gray-100 bg-white px-4 py-3 safe-bottom md:bottom-0">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => navigate('/checkout')}
            disabled={hasBlocker}
            className="flex w-full items-center justify-between rounded-2xl bg-brand-600 px-5 py-3.5 text-white shadow-lg transition-all hover:bg-brand-700 active:scale-[0.99] disabled:bg-gray-300"
          >
            <span className="text-sm font-semibold">Go to checkout · {getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'}</span>
            <span className="text-base font-bold">{formatPeso(getTotalPrice())}</span>
          </button>
          {hasBlocker && <p className="mt-1.5 text-center text-xs text-red-600">Fix the issues above to continue.</p>}
          <p className="mt-1 text-center text-[11px] text-gray-400">Delivery fee is calculated at checkout.</p>
        </div>
      </div>
    </main>
  );
};

export default CartPage;

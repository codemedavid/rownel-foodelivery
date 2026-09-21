import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Minus, Plus } from 'lucide-react';
import { AddOn, Variation } from '../types';
import { useMerchant } from '../contexts/MerchantContext';
import { useMenuContext } from '../contexts/MenuContext';
import { useCartContext } from '../contexts/CartContext';
import { isMerchantOpen, isCategoryAvailable } from '../lib/timeUtils';
import { useCategories } from '../hooks/useCategories';
import { showToast } from '../lib/notificationUtils';
import OptimizedImage from './OptimizedImage';
import { EmptyState, Spinner, formatPeso } from './ui';

// Full-bleed hero on the details page, capped at typical mobile/tablet width.
const DETAIL_IMAGE_WIDTH = 800;

const OptionRow: React.FC<{ selected: boolean; name: string; price: number; onSelect: () => void; inputName: string }> = ({ selected, name, price, onSelect, inputName }) => (
  <label className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 ${selected ? 'border-brand-600 bg-brand-50' : 'border-gray-200'}`}>
    <span className="flex items-center gap-3">
      <input type="radio" name={inputName} checked={selected} onChange={onSelect} className="h-4 w-4 accent-brand-600" />
      <span className="text-sm font-medium text-gray-900">{name}</span>
    </span>
    <span className="text-sm text-gray-600">{price > 0 ? `+${formatPeso(price)}` : 'Included'}</span>
  </label>
);

/** Item page: photo, options, add-ons, quantity and a sticky "Add to basket" bar. */
const MenuItemDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { merchantId, itemId } = useParams<{ merchantId: string; itemId: string }>();
  const { selectedMerchant, selectMerchantById } = useMerchant();
  const { menuItems, loading } = useMenuContext();
  const { addToCart } = useCartContext();

  const [quantity, setQuantity] = useState(1);
  const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>(undefined);
  const [selectedVariations, setSelectedVariations] = useState<Record<string, Variation>>({});
  const [selectedAddOns, setSelectedAddOns] = useState<(AddOn & { quantity: number })[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    if (merchantId && (!selectedMerchant || selectedMerchant.id !== merchantId)) selectMerchantById(merchantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId, selectedMerchant?.id]);

  const item = useMemo(
    () => (itemId && merchantId ? menuItems.find((m) => m.id === itemId && m.merchantId === merchantId) ?? null : null),
    [itemId, merchantId, menuItems]
  );

  const merchantOpenStatus = useMemo(() => isMerchantOpen(selectedMerchant?.openingHours), [selectedMerchant?.openingHours]);
  const { categories } = useCategories(merchantId, menuItems);
  const itemCategory = categories.find((c) => c.id === item?.category);
  const categoryAvailability = useMemo(() => isCategoryAvailable(itemCategory?.start_time, itemCategory?.end_time), [itemCategory?.start_time, itemCategory?.end_time]);
  const isClosed = !merchantOpenStatus.isOpen || !categoryAvailability.isAvailable;

  const hasGroups = Boolean(item?.variationGroups && item.variationGroups.length > 0);

  useEffect(() => {
    if (!item) return;
    setSelectedVariations({});
    setSelectedAddOns([]);
    setQuantity(1);
    setSelectedVariation(!hasGroups && item.variations && item.variations.length > 0 ? item.variations[0] : undefined);
  }, [item, hasGroups]);

  const groupedAddOns = useMemo(
    () =>
      (item?.addOns ?? []).reduce<Record<string, AddOn[]>>((groups, addOn) => ({ ...groups, [addOn.category]: [...(groups[addOn.category] ?? []), addOn] }), {}),
    [item]
  );

  const basePrice = item?.effectivePrice ?? item?.basePrice ?? 0;
  const unitPrice = useMemo(() => {
    if (!item) return 0;
    const variationTotal = hasGroups ? Object.values(selectedVariations).reduce((sum, v) => sum + v.price, 0) : selectedVariation?.price ?? 0;
    const addOnTotal = selectedAddOns.reduce((sum, a) => sum + a.price * a.quantity, 0);
    return basePrice + variationTotal + addOnTotal;
  }, [item, hasGroups, selectedVariations, selectedVariation, selectedAddOns, basePrice]);

  const setAddOnQuantity = (addOn: AddOn, next: number) =>
    setSelectedAddOns((prev) => {
      if (next <= 0) return prev.filter((a) => a.id !== addOn.id);
      const exists = prev.some((a) => a.id === addOn.id);
      return exists ? prev.map((a) => (a.id === addOn.id ? { ...a, quantity: next } : a)) : [...prev, { ...addOn, quantity: next }];
    });

  const handleAdd = () => {
    if (!item) return;
    if (hasGroups) {
      const missing = item.variationGroups?.find((g) => g.required && !selectedVariations[g.name]);
      if (missing) {
        setSelectionError(`Please choose a ${missing.name}.`);
        document.getElementById(`group-${missing.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    const addOnsForCart: AddOn[] = selectedAddOns.flatMap((a) => Array<AddOn>(a.quantity).fill({ ...a, quantity: undefined }));
    addToCart(item, quantity, hasGroups ? undefined : selectedVariation, addOnsForCart, hasGroups ? selectedVariations : undefined);
    showToast('Added to basket', `${quantity}× ${item.name}`, { tone: 'success' });
    navigate(`/merchant/${item.merchantId}`);
  };

  if (!item) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        {loading ? (
          <div className="flex justify-center"><Spinner /></div>
        ) : (
          <EmptyState emoji="🍽️" title="Item not found" action={<button type="button" onClick={() => navigate(merchantId ? `/merchant/${merchantId}` : '/')} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Back to menu</button>} />
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-40 md:pb-32">
      <div className="relative h-64 bg-gray-100 sm:h-80">
        {item.image ? (
          <OptimizedImage src={item.image} alt={item.name} width={DETAIL_IMAGE_WIDTH} isPriority className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-brand-50 text-6xl">🍽️</div>
        )}
        <button type="button" onClick={() => navigate(`/merchant/${merchantId}`)} aria-label="Back" className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow">
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-auto -mt-5 max-w-2xl space-y-4 px-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">{item.name}</h1>
          {item.description && <p className="mt-1 text-sm text-gray-600">{item.description}</p>}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-lg font-bold text-brand-700">{formatPeso(basePrice)}</span>
            {basePrice < item.basePrice && <span className="text-sm text-gray-400 line-through">{formatPeso(item.basePrice)}</span>}
          </div>
          {isClosed && (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
              <Clock className="h-4 w-4 flex-shrink-0" />
              {!merchantOpenStatus.isOpen ? `Store closed. ${merchantOpenStatus.nextOpenTime ?? ''}` : categoryAvailability.availableAt ?? 'Not available right now.'}
            </p>
          )}
        </section>

        {hasGroups
          ? item.variationGroups!
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((group) => (
                <section key={group.id} id={`group-${group.id}`} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-900">{group.name}</h2>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${group.required ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                      {group.required ? 'Required' : 'Optional'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.variations
                      .slice()
                      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                      .map((variation) => (
                        <OptionRow
                          key={variation.id}
                          inputName={`group-${group.id}`}
                          selected={selectedVariations[group.name]?.id === variation.id}
                          name={variation.name}
                          price={variation.price}
                          onSelect={() => {
                            setSelectedVariations((prev) => ({ ...prev, [group.name]: variation }));
                            setSelectionError(null);
                          }}
                        />
                      ))}
                  </div>
                </section>
              ))
          : item.variations && item.variations.length > 0 && (
              <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-sm font-bold text-gray-900">Choose size</h2>
                <div className="space-y-2">
                  {item.variations.map((variation) => (
                    <OptionRow key={variation.id} inputName="size" selected={selectedVariation?.id === variation.id} name={variation.name} price={variation.price} onSelect={() => setSelectedVariation(variation)} />
                  ))}
                </div>
              </section>
            )}

        {Object.keys(groupedAddOns).length > 0 && (
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-bold text-gray-900">Add-ons</h2>
            <div className="space-y-4">
              {Object.entries(groupedAddOns).map(([category, addOns]) => (
                <div key={category}>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{category.replace(/-/g, ' ')}</h3>
                  <div className="space-y-2">
                    {addOns.map((addOn) => {
                      const selected = selectedAddOns.find((a) => a.id === addOn.id);
                      return (
                        <div key={addOn.id} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{addOn.name}</p>
                            <p className="text-xs text-gray-500">{addOn.price > 0 ? `+${formatPeso(addOn.price)}` : 'Free'}</p>
                          </div>
                          {selected ? (
                            <div className="flex items-center gap-1 rounded-full bg-gray-100 p-0.5">
                              <button type="button" aria-label={`Remove one ${addOn.name}`} onClick={() => setAddOnQuantity(addOn, selected.quantity - 1)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white"><Minus className="h-4 w-4" /></button>
                              <span className="min-w-[18px] text-center text-sm font-bold">{selected.quantity}</span>
                              <button type="button" aria-label={`Add one ${addOn.name}`} onClick={() => setAddOnQuantity(addOn, selected.quantity + 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white"><Plus className="h-4 w-4" /></button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setAddOnQuantity(addOn, 1)} className="rounded-full border border-brand-600 px-3 py-1 text-xs font-semibold text-brand-700">Add</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[60px] z-40 border-t border-gray-100 bg-white px-4 py-3 safe-bottom md:bottom-0">
        <div className="mx-auto max-w-2xl">
          {selectionError && <p className="mb-2 text-center text-xs text-red-600">{selectionError}</p>}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"><Minus className="h-4 w-4" /></button>
              <span className="min-w-[28px] text-center text-base font-bold">{quantity}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((q) => q + 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"><Plus className="h-4 w-4" /></button>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={item.available === false || isClosed}
              className="flex flex-1 items-center justify-between rounded-2xl bg-brand-600 px-5 py-3.5 text-white shadow-lg hover:bg-brand-700 disabled:bg-gray-300"
            >
              <span className="text-sm font-semibold">{isClosed ? 'Unavailable now' : 'Add to basket'}</span>
              <span className="text-base font-bold">{formatPeso(unitPrice * quantity)}</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default MenuItemDetailsPage;

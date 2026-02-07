import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, ShoppingCart } from 'lucide-react';
import { AddOn, MenuItem, Variation } from '../types';
import { useMerchant } from '../contexts/MerchantContext';
import { useMenu } from '../hooks/useMenu';
import { useCartContext } from '../contexts/CartContext';

const MenuItemDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { merchantId, itemId } = useParams<{ merchantId: string; itemId: string }>();
  const { selectedMerchant, selectMerchantById } = useMerchant();
  const { menuItems } = useMenu();
  const { addToCart } = useCartContext();

  const [quantity, setQuantity] = useState(1);
  const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>(undefined);
  const [selectedVariations, setSelectedVariations] = useState<Record<string, Variation>>({});
  const [selectedAddOns, setSelectedAddOns] = useState<(AddOn & { quantity: number })[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    if (merchantId && (!selectedMerchant || selectedMerchant.id !== merchantId)) {
      selectMerchantById(merchantId);
    }
  }, [merchantId, selectedMerchant, selectMerchantById]);

  const item = useMemo(() => {
    if (!itemId || !merchantId) return null;
    return menuItems.find((menuItem) => menuItem.id === itemId && menuItem.merchantId === merchantId) ?? null;
  }, [itemId, merchantId, menuItems]);

  useEffect(() => {
    if (!item) return;
    if (item.variationGroups && item.variationGroups.length > 0) {
      setSelectedVariation(undefined);
      setSelectedVariations({});
      return;
    }

    if (item.variations && item.variations.length > 0) {
      setSelectedVariation(item.variations[0]);
    } else {
      setSelectedVariation(undefined);
    }
    setSelectedVariations({});
  }, [item]);

  const groupedAddOns = useMemo(() => {
    return item?.addOns?.reduce((groups, addOn) => {
      if (!groups[addOn.category]) {
        groups[addOn.category] = [];
      }
      groups[addOn.category].push(addOn);
      return groups;
    }, {} as Record<string, AddOn[]>) || {};
  }, [item]);

  const effectiveBasePrice = item?.effectivePrice ?? item?.basePrice ?? 0;

  const totalPerItem = useMemo(() => {
    if (!item) return 0;

    let total = effectiveBasePrice;

    if (item.variationGroups && item.variationGroups.length > 0) {
      Object.values(selectedVariations).forEach((variation) => {
        total += variation.price;
      });
    } else if (selectedVariation) {
      total += selectedVariation.price;
    }

    selectedAddOns.forEach((addOn) => {
      total += addOn.price * addOn.quantity;
    });

    return total;
  }, [effectiveBasePrice, item, selectedAddOns, selectedVariation, selectedVariations]);

  const totalPrice = totalPerItem * quantity;

  const updateAddOnQuantity = (addOn: AddOn, nextQuantity: number) => {
    setSelectedAddOns((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.id === addOn.id);

      if (nextQuantity <= 0) {
        return prev.filter((entry) => entry.id !== addOn.id);
      }

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], quantity: nextQuantity };
        return updated;
      }

      return [...prev, { ...addOn, quantity: nextQuantity }];
    });
  };

  const handleSelectGroupedVariation = (groupName: string, variation: Variation) => {
    setSelectedVariations((prev) => ({ ...prev, [groupName]: variation }));
    setSelectionError(null);
  };

  const handleAddToCart = () => {
    if (!item) return;

    if (item.variationGroups && item.variationGroups.length > 0) {
      const missingRequiredGroup = item.variationGroups.find(
        (group) => group.required && !selectedVariations[group.name]
      );

      if (missingRequiredGroup) {
        setSelectionError(`Please choose ${missingRequiredGroup.name}.`);
        return;
      }
    }

    const addOnsForCart: AddOn[] = selectedAddOns.flatMap((addOn) =>
      Array(addOn.quantity).fill({ ...addOn, quantity: undefined })
    );

    addToCart(
      item,
      quantity,
      item.variationGroups && item.variationGroups.length > 0 ? undefined : selectedVariation,
      addOnsForCart,
      item.variationGroups && item.variationGroups.length > 0 ? selectedVariations : undefined
    );

    navigate(`/merchant/${item.merchantId}`);
  };

  if (!item || !merchantId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <button
          type="button"
          onClick={() => navigate(merchantId ? `/merchant/${merchantId}` : '/')}
          className="mb-6 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <p className="rounded-xl border border-gray-200 bg-white p-4 text-gray-700">Menu item not found.</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <button
          type="button"
          onClick={() => navigate(`/merchant/${merchantId}`)}
          className="mb-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to menu
        </button>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="h-72 bg-gray-100 md:h-full">
              {item.image ? (
                <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-6xl text-gray-300">🍽️</div>
              )}
            </div>

            <div className="p-6">
              <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
              <p className="mt-2 text-sm text-gray-600">{item.description}</p>

              <div className="mt-4 text-2xl font-semibold text-green-700">₱{effectiveBasePrice.toFixed(2)}</div>

              {item.trackInventory && item.stockQuantity !== null && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  Stock: {item.stockQuantity}
                </div>
              )}
            </div>
          </div>
        </div>

        <section className="mt-6 space-y-6">
          {item.variationGroups && item.variationGroups.length > 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Choose your options</h2>
              <div className="mt-4 space-y-5">
                {item.variationGroups
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((group) => (
                    <div key={group.id}>
                      <div className="mb-2 flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">{group.name}</h3>
                        {group.required && <span className="text-xs text-red-600">Required</span>}
                      </div>
                      <div className="space-y-2">
                        {group.variations
                          .slice()
                          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                          .map((variation) => {
                            const isSelected = selectedVariations[group.name]?.id === variation.id;
                            return (
                              <label
                                key={variation.id}
                                className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors ${
                                  isSelected ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:bg-gray-50'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="radio"
                                    name={`group-${group.id}`}
                                    checked={isSelected}
                                    onChange={() => handleSelectGroupedVariation(group.name, variation)}
                                  />
                                  <span className="text-sm font-medium text-gray-900">{variation.name}</span>
                                </div>
                                <span className="text-sm font-semibold text-gray-700">
                                  {variation.price > 0 ? `+₱${variation.price.toFixed(2)}` : 'Included'}
                                </span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            item.variations &&
            item.variations.length > 0 && (
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Choose size</h2>
                <div className="mt-4 space-y-2">
                  {item.variations.map((variation) => (
                    <label
                      key={variation.id}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors ${
                        selectedVariation?.id === variation.id
                          ? 'border-green-600 bg-green-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          checked={selectedVariation?.id === variation.id}
                          onChange={() => {
                            setSelectedVariation(variation);
                            setSelectionError(null);
                          }}
                        />
                        <span className="text-sm font-medium text-gray-900">{variation.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">
                        {variation.price > 0 ? `+₱${variation.price.toFixed(2)}` : 'Included'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )
          )}

          {Object.keys(groupedAddOns).length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Add-ons</h2>
              <div className="mt-4 space-y-4">
                {Object.entries(groupedAddOns).map(([category, addOns]) => (
                  <div key={category}>
                    <h3 className="mb-2 text-sm font-medium capitalize text-gray-700">{category.replace(/-/g, ' ')}</h3>
                    <div className="space-y-2">
                      {addOns.map((addOn) => {
                        const selected = selectedAddOns.find((entry) => entry.id === addOn.id);
                        return (
                          <div key={addOn.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{addOn.name}</p>
                              <p className="text-xs text-gray-600">{addOn.price > 0 ? `+₱${addOn.price.toFixed(2)}` : 'Free'}</p>
                            </div>

                            {selected ? (
                              <div className="flex items-center gap-2 rounded-lg bg-green-100 p-1">
                                <button
                                  type="button"
                                  onClick={() => updateAddOnQuantity(addOn, selected.quantity - 1)}
                                  className="rounded p-1 hover:bg-green-200"
                                >
                                  <Minus className="h-4 w-4 text-green-700" />
                                </button>
                                <span className="min-w-[24px] text-center text-sm font-semibold text-gray-900">{selected.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => updateAddOnQuantity(addOn, selected.quantity + 1)}
                                  className="rounded p-1 hover:bg-green-200"
                                >
                                  <Plus className="h-4 w-4 text-green-700" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => updateAddOnQuantity(addOn, 1)}
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                              >
                                Add
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Quantity</h2>
              <div className="flex items-center gap-2 rounded-lg bg-yellow-100 p-1">
                <button
                  type="button"
                  onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                  className="rounded p-1.5 hover:bg-yellow-200"
                >
                  <Minus className="h-4 w-4 text-gray-700" />
                </button>
                <span className="min-w-[28px] text-center font-semibold text-gray-900">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((prev) => prev + 1)}
                  className="rounded p-1.5 hover:bg-yellow-200"
                >
                  <Plus className="h-4 w-4 text-gray-700" />
                </button>
              </div>
            </div>

            {selectionError && <p className="mt-3 text-sm text-red-600">{selectionError}</p>}

            <div className="mt-5 flex items-center justify-between border-t border-gray-200 pt-4">
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-bold text-green-700">₱{totalPrice.toFixed(2)}</p>
              </div>
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!item.available}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                <ShoppingCart className="h-4 w-4" />
                Add to cart
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default MenuItemDetailsPage;

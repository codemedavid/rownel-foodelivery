import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { mapMenuItemRow } from '../../src/lib/mappers';
import { calculateItemPrice } from '../../src/lib/cart';
import { useMerchant } from '../../src/hooks/useMerchants';
import { useCart } from '../../src/context/CartContext';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { colors, formatPeso, radius, spacing } from '../../src/theme';
import { AddOn, MenuItem, Variation } from '../../src/types';

export default function ItemScreen() {
  const { id, merchantId } = useLocalSearchParams<{ id: string; merchantId: string }>();
  const { merchant } = useMerchant(merchantId);
  const { addItem } = useCart();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [item, setItem] = useState<MenuItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariations, setSelectedVariations] = useState<Record<string, Variation>>({});
  const [addOnQuantities, setAddOnQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!id) return;
    let isActive = true;

    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('menu_items')
          .select('*, variations (*), variation_groups (*), add_ons (*)')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;
        if (isActive) {
          const mapped = mapMenuItemRow(data);
          setItem(mapped);
          // Pre-select the first option of each required group.
          const defaults: Record<string, Variation> = {};
          for (const group of mapped.variationGroups ?? []) {
            if (group.required && group.variations.length > 0) {
              defaults[group.name] = group.variations[0];
            }
          }
          setSelectedVariations(defaults);
          setError(null);
        }
      } catch (err) {
        if (isActive) setError(err instanceof Error ? err.message : 'Failed to load item');
      } finally {
        if (isActive) setIsLoading(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [id]);

  const selectedAddOns = useMemo<AddOn[]>(() => {
    if (!item?.addOns) return [];
    return item.addOns
      .filter((addOn) => (addOnQuantities[addOn.id] ?? 0) > 0)
      .map((addOn) => ({ ...addOn, quantity: addOnQuantities[addOn.id] }));
  }, [item, addOnQuantities]);

  const unitPrice = item ? calculateItemPrice(item, selectedVariations, selectedAddOns) : 0;

  const missingRequiredGroup = useMemo(() => {
    if (!item?.variationGroups) return null;
    return item.variationGroups.find((g) => g.required && !selectedVariations[g.name]) ?? null;
  }, [item, selectedVariations]);

  const handleAddToBasket = () => {
    if (!item || !merchant || missingRequiredGroup) return;
    addItem(
      merchant,
      item,
      quantity,
      Object.keys(selectedVariations).length > 0 ? selectedVariations : undefined,
      selectedAddOns.length > 0 ? selectedAddOns : undefined
    );
    router.back();
  };

  const changeAddOnQuantity = (addOnId: string, delta: number) => {
    setAddOnQuantities((prev) => ({
      ...prev,
      [addOnId]: Math.max(0, (prev[addOnId] ?? 0) + delta),
    }));
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Item not found.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.hero} contentFit="cover" />
        ) : null}

        <View style={styles.body}>
          <Text style={styles.name}>{item.name}</Text>
          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPeso(item.effectivePrice ?? item.basePrice)}</Text>
            {item.isOnDiscount && (
              <Text style={styles.strikePrice}>{formatPeso(item.basePrice)}</Text>
            )}
          </View>
        </View>

        {(item.variationGroups ?? []).map((group) => (
          <View key={group.id} style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{group.name}</Text>
              <Text style={styles.sectionHint}>
                {group.required ? 'Required · pick 1' : 'Optional'}
              </Text>
            </View>
            {group.variations.map((variation) => {
              const isSelected = selectedVariations[group.name]?.id === variation.id;
              return (
                <Pressable
                  key={variation.id}
                  style={styles.optionRow}
                  onPress={() =>
                    setSelectedVariations((prev) => {
                      if (isSelected && !group.required) {
                        const { [group.name]: _removed, ...rest } = prev;
                        return rest;
                      }
                      return { ...prev, [group.name]: variation };
                    })
                  }
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.optionName}>{variation.name}</Text>
                  {variation.price > 0 && (
                    <Text style={styles.optionPrice}>+{formatPeso(variation.price)}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        {(item.addOns ?? []).length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Add-ons</Text>
              <Text style={styles.sectionHint}>Optional</Text>
            </View>
            {(item.addOns ?? []).map((addOn) => {
              const count = addOnQuantities[addOn.id] ?? 0;
              return (
                <View key={addOn.id} style={styles.optionRow}>
                  <View style={styles.addOnInfo}>
                    <Text style={styles.optionName}>{addOn.name}</Text>
                    <Text style={styles.optionPrice}>+{formatPeso(addOn.price)}</Text>
                  </View>
                  {count === 0 ? (
                    <Pressable
                      style={styles.addOnAdd}
                      onPress={() => changeAddOnQuantity(addOn.id, 1)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${addOn.name}`}
                    >
                      <Text style={styles.addOnAddText}>Add</Text>
                    </Pressable>
                  ) : (
                    <QuantityStepper
                      size="small"
                      quantity={count}
                      onDecrease={() => changeAddOnQuantity(addOn.id, -1)}
                      onIncrease={() => changeAddOnQuantity(addOn.id, 1)}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={[styles.section, styles.quantitySection]}>
          <Text style={styles.sectionTitle}>Quantity</Text>
          <QuantityStepper
            quantity={quantity}
            onDecrease={() => setQuantity((q) => Math.max(1, q - 1))}
            onIncrease={() => setQuantity((q) => q + 1)}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable
          style={[styles.cta, (missingRequiredGroup || !merchant) && styles.ctaDisabled]}
          onPress={handleAddToBasket}
          disabled={Boolean(missingRequiredGroup) || !merchant}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>
            {missingRequiredGroup
              ? `Choose ${missingRequiredGroup.name}`
              : `Add to basket · ${formatPeso(unitPrice * quantity)}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.textSecondary, padding: spacing.xl, textAlign: 'center' },
  hero: { width: '100%', height: 240 },
  body: { padding: spacing.lg },
  name: { fontSize: 22, fontWeight: '800', color: colors.text },
  description: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 20 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  price: { fontSize: 20, fontWeight: '800', color: colors.primary },
  strikePrice: { fontSize: 15, color: colors.textMuted, textDecorationLine: 'line-through' },
  section: {
    borderTopWidth: 8,
    borderTopColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sectionHint: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  optionName: { flex: 1, fontSize: 15, color: colors.text },
  optionPrice: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  addOnInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addOnAdd: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 5,
  },
  addOnAddText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  quantitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaDisabled: { backgroundColor: colors.textMuted },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

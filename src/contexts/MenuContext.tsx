import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { MenuItem } from '../types';
import { useMerchant } from './MerchantContext';

interface MenuContextType {
  menuItems: MenuItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const MenuContext = createContext<MenuContextType | undefined>(undefined);

export const useMenuContext = () => {
  const context = useContext(MenuContext);
  if (context === undefined) {
    throw new Error('useMenuContext must be used within a MenuProvider');
  }
  return context;
};

export const MenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedMerchant } = useMerchant();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cache: merchantId -> formatted items
  const cacheRef = useRef<Record<string, MenuItem[]>>({});
  const currentMerchantIdRef = useRef<string | null>(null);

  const fetchMenuItems = useCallback(async (merchantId?: string) => {
    const targetId = merchantId || selectedMerchant?.id;
    if (!targetId) {
      setMenuItems([]);
      setLoading(false);
      return;
    }

    // Return cached data instantly if available
    if (cacheRef.current[targetId]) {
      setMenuItems(cacheRef.current[targetId]);
      setLoading(false);
      // Still refetch in background to keep data fresh
      currentMerchantIdRef.current = targetId;
    } else {
      setLoading(true);
    }

    try {
      const { data: items, error: itemsError } = await supabase
        .from('menu_items')
        .select(`
          *,
          variations (*),
          variation_groups (*),
          add_ons (*)
        `)
        .eq('merchant_id', targetId)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;

      const formattedItems: MenuItem[] = items?.map(item => {
        const now = new Date();
        const discountStart = item.discount_start_date ? new Date(item.discount_start_date) : null;
        const discountEnd = item.discount_end_date ? new Date(item.discount_end_date) : null;

        const isDiscountActive = item.discount_active &&
          (!discountStart || now >= discountStart) &&
          (!discountEnd || now <= discountEnd);

        const effectivePrice = isDiscountActive && item.discount_price ? item.discount_price : item.base_price;

        const variationsByGroup: Record<string, any[]> = {};
        item.variations?.forEach((v: any) => {
          const group = v.variation_group || 'default';
          if (!variationsByGroup[group]) {
            variationsByGroup[group] = [];
          }
          variationsByGroup[group].push(v);
        });

        const variationGroups = item.variation_groups?.map((vg: any) => ({
          id: vg.id,
          name: vg.name,
          required: vg.required ?? true,
          sortOrder: vg.sort_order ?? 0,
          variations: (variationsByGroup[vg.name] || [])
            .map((v: any) => ({
              id: v.id,
              name: v.name,
              price: v.price,
              variationGroup: v.variation_group,
              sortOrder: v.sort_order ?? 0
            }))
            .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
        })).sort((a: any, b: any) => a.sortOrder - b.sortOrder) || [];

        return {
          id: item.id,
          merchantId: item.merchant_id,
          name: item.name,
          description: item.description,
          basePrice: item.base_price,
          category: item.category,
          popular: item.popular,
          available: item.available ?? true,
          image: item.image_url || undefined,
          discountPrice: item.discount_price || undefined,
          discountStartDate: item.discount_start_date || undefined,
          discountEndDate: item.discount_end_date || undefined,
          discountActive: item.discount_active || false,
          effectivePrice,
          isOnDiscount: isDiscountActive,
          trackInventory: item.track_inventory || false,
          stockQuantity: item.stock_quantity,
          lowStockThreshold: item.low_stock_threshold ?? 0,
          autoDisabled: item.track_inventory ? item.available === false : false,
          variations: item.variations?.map((v: any) => ({
            id: v.id,
            name: v.name,
            price: v.price,
            variationGroup: v.variation_group,
            sortOrder: v.sort_order ?? 0
          })) || [],
          variationGroups,
          addOns: item.add_ons?.map((a: any) => ({
            id: a.id,
            name: a.name,
            price: a.price,
            category: a.category
          })) || []
        };
      }) || [];

      // Update cache
      cacheRef.current[targetId] = formattedItems;

      // Only update state if this is still the current merchant
      if (currentMerchantIdRef.current === targetId || !currentMerchantIdRef.current) {
        setMenuItems(formattedItems);
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching menu items:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch menu items');
    } finally {
      setLoading(false);
    }
  }, [selectedMerchant?.id]);

  // Fetch when merchant changes
  useEffect(() => {
    const merchantId = selectedMerchant?.id;
    currentMerchantIdRef.current = merchantId || null;

    if (merchantId) {
      // Show cached data instantly
      if (cacheRef.current[merchantId]) {
        setMenuItems(cacheRef.current[merchantId]);
        setLoading(false);
      }
      fetchMenuItems(merchantId);
    } else {
      setMenuItems([]);
      setLoading(false);
    }
  }, [selectedMerchant?.id, fetchMenuItems]);

  return (
    <MenuContext.Provider value={{ menuItems, loading, error, refetch: () => fetchMenuItems() }}>
      {children}
    </MenuContext.Provider>
  );
};

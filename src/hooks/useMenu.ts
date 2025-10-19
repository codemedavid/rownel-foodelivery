import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MenuItem } from '../types';

export const useMenu = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMenuItems = async () => {
    try {
      setLoading(true);
      
      // Fetch menu items with their variations, variation_groups, and add-ons
      const { data: items, error: itemsError } = await supabase
        .from('menu_items')
        .select(`
          *,
          variations (*),
          variation_groups (*),
          add_ons (*)
        `)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;

      const formattedItems: MenuItem[] = items?.map(item => {
        // Calculate if discount is currently active
        const now = new Date();
        const discountStart = item.discount_start_date ? new Date(item.discount_start_date) : null;
        const discountEnd = item.discount_end_date ? new Date(item.discount_end_date) : null;
        
        const isDiscountActive = item.discount_active && 
          (!discountStart || now >= discountStart) && 
          (!discountEnd || now <= discountEnd);
        
        // Calculate effective price
        const effectivePrice = isDiscountActive && item.discount_price ? item.discount_price : item.base_price;

        // Group variations by variation_group
        const variationsByGroup: Record<string, any[]> = {};
        item.variations?.forEach((v: any) => {
          const group = v.variation_group || 'default';
          if (!variationsByGroup[group]) {
            variationsByGroup[group] = [];
          }
          variationsByGroup[group].push(v);
        });

        // Create variation groups with their variations
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
          // Keep flat variations list for backward compatibility
          variations: item.variations?.map((v: any) => ({
            id: v.id,
            name: v.name,
            price: v.price,
            variationGroup: v.variation_group,
            sortOrder: v.sort_order ?? 0
          })) || [],
          // Add grouped variations
          variationGroups,
          addOns: item.add_ons?.map((a: any) => ({
            id: a.id,
            name: a.name,
            price: a.price,
            category: a.category
          })) || []
        };
      }) || [];

      setMenuItems(formattedItems);
      setError(null);
    } catch (err) {
      console.error('Error fetching menu items:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch menu items');
    } finally {
      setLoading(false);
    }
  };

  const addMenuItem = async (item: Omit<MenuItem, 'id'>) => {
    try {
      // Insert menu item
      const { data: menuItem, error: itemError } = await supabase
        .from('menu_items')
        .insert({
          merchant_id: item.merchantId,
          name: item.name,
          description: item.description,
          base_price: item.basePrice,
          category: item.category,
          popular: item.popular || false,
          available: item.available ?? true,
          image_url: item.image || null,
          discount_price: item.discountPrice || null,
          discount_start_date: item.discountStartDate || null,
          discount_end_date: item.discountEndDate || null,
          discount_active: item.discountActive || false,
          track_inventory: item.trackInventory || false,
          stock_quantity: item.stockQuantity ?? null,
          low_stock_threshold: item.lowStockThreshold ?? 0
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // Insert variation groups if any
      if (item.variationGroups && item.variationGroups.length > 0) {
        const { data: insertedGroups, error: groupsError } = await supabase
          .from('variation_groups')
          .insert(
            item.variationGroups.map(vg => ({
              menu_item_id: menuItem.id,
              name: vg.name,
              required: vg.required ?? true,
              sort_order: vg.sortOrder ?? 0
            }))
          )
          .select();

        if (groupsError) throw groupsError;

        // Insert variations for each group
        for (const group of item.variationGroups) {
          if (group.variations && group.variations.length > 0) {
            const { error: variationsError } = await supabase
              .from('variations')
              .insert(
                group.variations.map(v => ({
                  menu_item_id: menuItem.id,
                  name: v.name,
                  price: v.price,
                  variation_group: group.name,
                  sort_order: v.sortOrder ?? 0
                }))
              );

            if (variationsError) throw variationsError;
          }
        }
      } else if (item.variations && item.variations.length > 0) {
        // Fallback: Insert variations without groups (backward compatibility)
        const { error: variationsError } = await supabase
          .from('variations')
          .insert(
            item.variations.map(v => ({
              menu_item_id: menuItem.id,
              name: v.name,
              price: v.price,
              variation_group: v.variationGroup || 'default',
              sort_order: v.sortOrder ?? 0
            }))
          );

        if (variationsError) throw variationsError;
      }

      // Insert add-ons if any
      if (item.addOns && item.addOns.length > 0) {
        const { error: addOnsError } = await supabase
          .from('add_ons')
          .insert(
            item.addOns.map(a => ({
              menu_item_id: menuItem.id,
              name: a.name,
              price: a.price,
              category: a.category
            }))
          );

        if (addOnsError) throw addOnsError;
      }

      await fetchMenuItems();
      return menuItem;
    } catch (err) {
      console.error('Error adding menu item:', err);
      throw err;
    }
  };

  const updateMenuItem = async (id: string, updates: Partial<MenuItem>) => {
    try {
      console.log('[DEBUG] updateMenuItem called with:', { id, updates });
      
      // Build update object, only including defined values
      const updateData: any = {};
      
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.basePrice !== undefined) updateData.base_price = updates.basePrice;
      if (updates.category !== undefined) updateData.category = updates.category;
      if (updates.popular !== undefined) updateData.popular = updates.popular;
      if (updates.available !== undefined) updateData.available = updates.available;
      if (updates.image !== undefined) updateData.image_url = updates.image || null;
      if (updates.discountPrice !== undefined) updateData.discount_price = updates.discountPrice || null;
      if (updates.discountStartDate !== undefined) updateData.discount_start_date = updates.discountStartDate || null;
      if (updates.discountEndDate !== undefined) updateData.discount_end_date = updates.discountEndDate || null;
      if (updates.discountActive !== undefined) updateData.discount_active = updates.discountActive;
      if (updates.trackInventory !== undefined) updateData.track_inventory = updates.trackInventory;
      if (updates.stockQuantity !== undefined) updateData.stock_quantity = updates.stockQuantity;
      if (updates.lowStockThreshold !== undefined) updateData.low_stock_threshold = updates.lowStockThreshold;

      console.log('[DEBUG] updateData being sent to Supabase:', updateData);

      // Update menu item
      const { data, error: itemError } = await supabase
        .from('menu_items')
        .update(updateData)
        .eq('id', id)
        .select();

      console.log('[DEBUG] Supabase response:', { data, error: itemError });

      if (itemError) throw itemError;

      // Delete existing variations, variation_groups, and add-ons
      await supabase.from('variations').delete().eq('menu_item_id', id);
      await supabase.from('variation_groups').delete().eq('menu_item_id', id);
      await supabase.from('add_ons').delete().eq('menu_item_id', id);

      // Insert new variation groups if any
      if (updates.variationGroups && updates.variationGroups.length > 0) {
        const { error: groupsError } = await supabase
          .from('variation_groups')
          .insert(
            updates.variationGroups.map(vg => ({
              menu_item_id: id,
              name: vg.name,
              required: vg.required ?? true,
              sort_order: vg.sortOrder ?? 0
            }))
          );

        if (groupsError) throw groupsError;

        // Insert variations for each group
        for (const group of updates.variationGroups) {
          if (group.variations && group.variations.length > 0) {
            const { error: variationsError } = await supabase
              .from('variations')
              .insert(
                group.variations.map(v => ({
                  menu_item_id: id,
                  name: v.name,
                  price: v.price,
                  variation_group: group.name,
                  sort_order: v.sortOrder ?? 0
                }))
              );

            if (variationsError) throw variationsError;
          }
        }
      } else if (updates.variations && updates.variations.length > 0) {
        // Fallback: Insert new variations without groups (backward compatibility)
        const { error: variationsError } = await supabase
          .from('variations')
          .insert(
            updates.variations.map(v => ({
              menu_item_id: id,
              name: v.name,
              price: v.price,
              variation_group: v.variationGroup || 'default',
              sort_order: v.sortOrder ?? 0
            }))
          );

        if (variationsError) throw variationsError;
      }

      // Insert new add-ons
      if (updates.addOns && updates.addOns.length > 0) {
        const { error: addOnsError } = await supabase
          .from('add_ons')
          .insert(
            updates.addOns.map(a => ({
              menu_item_id: id,
              name: a.name,
              price: a.price,
              category: a.category
            }))
          );

        if (addOnsError) throw addOnsError;
      }

      await fetchMenuItems();
    } catch (err) {
      console.error('Error updating menu item:', err);
      throw err;
    }
  };

  const deleteMenuItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchMenuItems();
    } catch (err) {
      console.error('Error deleting menu item:', err);
      throw err;
    }
  };

  useEffect(() => {
    fetchMenuItems();
  }, []);

  return {
    menuItems,
    loading,
    error,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    refetch: fetchMenuItems
  };
};

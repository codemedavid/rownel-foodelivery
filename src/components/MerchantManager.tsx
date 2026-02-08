import React, { useState } from 'react';
import { Plus, Edit, Trash2, X, ArrowLeft, Star, Package, ChefHat, Save, MapPin, CheckCircle2, Copy } from 'lucide-react';
import { Merchant, MenuItem, Variation, AddOn } from '../types';
import { useMerchants } from '../hooks/useMerchants';
import { useMenu } from '../hooks/useMenu';
import { useCategories } from '../hooks/useCategories';
import { addOnCategories } from '../data/menuData';
import { supabase } from '../lib/supabase';
import { calculateDeliveryFee } from '../lib/deliveryPricing';
import ImageUpload from './ImageUpload';
import AddressAutocompleteInput from './AddressAutocompleteInput';
import type { OSMAddressSuggestion } from '../lib/osm';

interface MerchantManagerProps {
  onBack: () => void;
}

interface SourceVariationGroup {
  name: string;
  required?: boolean;
  sort_order?: number;
}

interface SourceVariation {
  name: string;
  price: number;
  variation_group?: string;
  sort_order?: number;
}

interface SourceAddOn {
  name: string;
  price: number;
  category: string;
}

interface SourceMenuItem {
  name: string;
  description: string;
  base_price: number;
  category: string;
  popular?: boolean;
  available?: boolean;
  image_url?: string | null;
  discount_price?: number | null;
  discount_start_date?: string | null;
  discount_end_date?: string | null;
  discount_active?: boolean;
  track_inventory?: boolean;
  stock_quantity?: number | null;
  low_stock_threshold?: number;
  variation_groups?: SourceVariationGroup[];
  variations?: SourceVariation[];
  add_ons?: SourceAddOn[];
}

const MerchantManager: React.FC<MerchantManagerProps> = ({ onBack }) => {
  const { merchants, loading: merchantsLoading, refetch: refetchMerchants } = useMerchants();
  const { menuItems, loading: menuLoading, addMenuItem, updateMenuItem, deleteMenuItem, refetch: refetchMenu } = useMenu();
  const { categories } = useCategories();
  
  const [currentView, setCurrentView] = useState<'list' | 'merchant-detail' | 'add-merchant' | 'edit-merchant'>('list');
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duplicationStatus, setDuplicationStatus] = useState({
    active: false,
    merchantName: '',
    processed: 0,
    total: 0,
  });
  const [merchantFormErrors, setMerchantFormErrors] = useState<{
    name?: string;
    address?: string;
  }>({});

  const [merchantFormData, setMerchantFormData] = useState<Partial<Merchant>>({
    name: '',
    description: '',
    category: 'restaurant',
    cuisineType: '',
    deliveryFee: 0,
    minimumOrder: 0,
    estimatedDeliveryTime: '30-45 mins',
    rating: 0,
    totalReviews: 0,
    active: true,
    featured: false,
    address: '',
    formattedAddress: '',
    latitude: null,
    longitude: null,
    baseDeliveryFee: 0,
    deliveryFeePerKm: 4,
    minDeliveryFee: null,
    maxDeliveryFee: null,
    maxDeliveryDistanceKm: 20,
    contactNumber: '',
    email: '',
    openingHours: {},
    paymentMethods: [],
  });

  const [itemFormData, setItemFormData] = useState<Partial<MenuItem>>({
    name: '',
    description: '',
    basePrice: 0,
    category: 'dim-sum',
    popular: false,
    available: true,
    variations: [],
    addOns: [],
    trackInventory: false,
    stockQuantity: null,
    lowStockThreshold: 0
  });

  const handleViewMerchant = (merchant: Merchant) => {
    setSelectedMerchant(merchant);
    setCurrentView('merchant-detail');
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setSelectedMerchant(null);
    setShowAddItemForm(false);
    setEditingItem(null);
    setEditingMerchant(null);
    setMerchantFormErrors({});
  };

  const handleAddMerchant = () => {
    setEditingMerchant(null);
    setMerchantFormErrors({});
    setMerchantFormData({
      name: '',
      description: '',
      category: 'restaurant',
      cuisineType: '',
      deliveryFee: 0,
      minimumOrder: 0,
      estimatedDeliveryTime: '30-45 mins',
      rating: 0,
      totalReviews: 0,
      active: true,
      featured: false,
      address: '',
      formattedAddress: '',
      latitude: null,
      longitude: null,
      baseDeliveryFee: 0,
      deliveryFeePerKm: 4,
      minDeliveryFee: null,
      maxDeliveryFee: null,
      maxDeliveryDistanceKm: 20,
      contactNumber: '',
      email: '',
      openingHours: {},
      paymentMethods: [],
    });
    setCurrentView('add-merchant');
  };

  const handleEditMerchant = (merchant: Merchant) => {
    setEditingMerchant(merchant);
    setMerchantFormErrors({});
    setMerchantFormData(merchant);
    setCurrentView('edit-merchant');
  };

  const handleDeleteMerchant = async (id: string) => {
    if (confirm('Are you sure you want to delete this merchant? This will also delete all associated menu items, orders, and data.')) {
      try {
        setIsProcessing(true);
        const { error } = await supabase
          .from('merchants')
          .delete()
          .eq('id', id);

        if (error) throw error;
        await refetchMerchants();
        alert('Merchant deleted successfully');
      } catch (error) {
        console.error('Error deleting merchant:', error);
        alert('Failed to delete merchant');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleDuplicateMerchant = async (merchant: Merchant) => {
    if (!confirm(`Duplicate "${merchant.name}" including all menu items?`)) {
      return;
    }

    try {
      setIsProcessing(true);
      setDuplicationStatus({
        active: true,
        merchantName: merchant.name,
        processed: 0,
        total: 0,
      });

      // Create merchant copy first.
      const { data: duplicatedMerchant, error: merchantError } = await supabase
        .from('merchants')
        .insert({
          name: `${merchant.name} (Copy)`,
          description: merchant.description || null,
          category: merchant.category,
          cuisine_type: merchant.cuisineType || null,
          delivery_fee: merchant.deliveryFee,
          base_delivery_fee: merchant.baseDeliveryFee ?? merchant.deliveryFee,
          delivery_fee_per_km: merchant.deliveryFeePerKm ?? 4,
          min_delivery_fee: merchant.minDeliveryFee ?? null,
          max_delivery_fee: merchant.maxDeliveryFee ?? null,
          max_delivery_distance_km: merchant.maxDeliveryDistanceKm ?? 20,
          minimum_order: merchant.minimumOrder,
          estimated_delivery_time: merchant.estimatedDeliveryTime || null,
          rating: merchant.rating,
          total_reviews: merchant.totalReviews,
          active: merchant.active,
          featured: false,
          address: merchant.address || null,
          formatted_address: merchant.formattedAddress || merchant.address || null,
          latitude: merchant.latitude ?? null,
          longitude: merchant.longitude ?? null,
          osm_place_id: merchant.osmPlaceId || null,
          contact_number: merchant.contactNumber || null,
          email: merchant.email || null,
          opening_hours: merchant.openingHours || null,
          payment_methods: merchant.paymentMethods || [],
          logo_url: merchant.logoUrl || null,
          cover_image_url: merchant.coverImageUrl || null,
        })
        .select('id')
        .single();

      if (merchantError) throw merchantError;

      // Pull source items with all nested options and clone them under the new merchant.
      const { data: sourceItems, error: sourceItemsError } = await supabase
        .from('menu_items')
        .select(`
          *,
          variations (*),
          variation_groups (*),
          add_ons (*)
        `)
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: true });

      if (sourceItemsError) throw sourceItemsError;

      const itemsToDuplicate = (sourceItems || []) as SourceMenuItem[];
      setDuplicationStatus((prev) => ({
        ...prev,
        total: itemsToDuplicate.length,
      }));

      const duplicateSingleItem = async (item: SourceMenuItem) => {
        const { data: newItem, error: newItemError } = await supabase
          .from('menu_items')
          .insert({
            merchant_id: duplicatedMerchant.id,
            name: item.name,
            description: item.description,
            base_price: item.base_price,
            category: item.category,
            popular: item.popular ?? false,
            available: item.available ?? true,
            image_url: item.image_url ?? null,
            discount_price: item.discount_price ?? null,
            discount_start_date: item.discount_start_date ?? null,
            discount_end_date: item.discount_end_date ?? null,
            discount_active: item.discount_active ?? false,
            track_inventory: item.track_inventory ?? false,
            stock_quantity: item.stock_quantity ?? null,
            low_stock_threshold: item.low_stock_threshold ?? 0,
          })
          .select('id')
          .single();

        if (newItemError) throw newItemError;

        const nestedInsertTasks: Promise<void>[] = [];

        if (item.variation_groups?.length) {
          nestedInsertTasks.push(
            supabase
              .from('variation_groups')
              .insert(
                item.variation_groups.map((group) => ({
                  menu_item_id: newItem.id,
                  name: group.name,
                  required: group.required ?? true,
                  sort_order: group.sort_order ?? 0,
                }))
              )
              .then(({ error }) => {
                if (error) throw error;
              })
          );
        }

        if (item.variations?.length) {
          nestedInsertTasks.push(
            supabase
              .from('variations')
              .insert(
                item.variations.map((variation) => ({
                  menu_item_id: newItem.id,
                  name: variation.name,
                  price: variation.price,
                  variation_group: variation.variation_group || 'default',
                  sort_order: variation.sort_order ?? 0,
                }))
              )
              .then(({ error }) => {
                if (error) throw error;
              })
          );
        }

        if (item.add_ons?.length) {
          nestedInsertTasks.push(
            supabase
              .from('add_ons')
              .insert(
                item.add_ons.map((addOn) => ({
                  menu_item_id: newItem.id,
                  name: addOn.name,
                  price: addOn.price,
                  category: addOn.category,
                }))
              )
              .then(({ error }) => {
                if (error) throw error;
              })
          );
        }

        await Promise.all(nestedInsertTasks);
        setDuplicationStatus((prev) => ({
          ...prev,
          processed: prev.processed + 1,
        }));
      };

      const batchSize = 4;
      for (let i = 0; i < itemsToDuplicate.length; i += batchSize) {
        const batch = itemsToDuplicate.slice(i, i + batchSize);
        await Promise.all(batch.map((item) => duplicateSingleItem(item)));
      }

      await Promise.all([refetchMerchants(), refetchMenu()]);
      alert(`Merchant duplicated successfully as "${merchant.name} (Copy)"`);
    } catch (error) {
      console.error('Error duplicating merchant:', error);
      alert('Failed to duplicate merchant');
    } finally {
      setIsProcessing(false);
      setDuplicationStatus({
        active: false,
        merchantName: '',
        processed: 0,
        total: 0,
      });
    }
  };

  const handleSaveMerchant = async () => {
    const nextErrors: { name?: string; address?: string } = {};

    const name = merchantFormData.name?.trim() || '';
    const address = merchantFormData.address?.trim() || '';
    const hasGeocodedAddress = merchantFormData.latitude != null && merchantFormData.longitude != null;

    if (!name) {
      nextErrors.name = 'Merchant name is required.';
    }

    if (!address) {
      nextErrors.address = 'Delivery address is required.';
    } else if (!hasGeocodedAddress) {
      nextErrors.address = 'Select a suggested address to pin the exact merchant location.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setMerchantFormErrors(nextErrors);
      return;
    }

    setMerchantFormErrors({});

    const baseDeliveryFee = Number(merchantFormData.baseDeliveryFee ?? merchantFormData.deliveryFee ?? 0);
    const deliveryFeePerKm = Number(merchantFormData.deliveryFeePerKm ?? 0);
    const minDeliveryFee = merchantFormData.minDeliveryFee ?? null;
    const maxDeliveryFee = merchantFormData.maxDeliveryFee ?? null;
    const maxDeliveryDistanceKm = Number(merchantFormData.maxDeliveryDistanceKm ?? 20);

    if (baseDeliveryFee < 0 || deliveryFeePerKm < 0 || maxDeliveryDistanceKm < 0) {
      alert('Delivery pricing values cannot be negative');
      return;
    }

    if (
      typeof minDeliveryFee === 'number' &&
      typeof maxDeliveryFee === 'number' &&
      minDeliveryFee > maxDeliveryFee
    ) {
      alert('Minimum delivery fee cannot be greater than maximum delivery fee');
      return;
    }

    try {
      setIsProcessing(true);

      const merchantData = {
        name,
        description: merchantFormData.description || null,
        category: merchantFormData.category,
        cuisine_type: merchantFormData.cuisineType || null,
        delivery_fee: baseDeliveryFee,
        base_delivery_fee: baseDeliveryFee,
        delivery_fee_per_km: deliveryFeePerKm,
        min_delivery_fee: minDeliveryFee,
        max_delivery_fee: maxDeliveryFee,
        max_delivery_distance_km: maxDeliveryDistanceKm,
        minimum_order: merchantFormData.minimumOrder || 0,
        estimated_delivery_time: merchantFormData.estimatedDeliveryTime || null,
        rating: merchantFormData.rating || 0,
        total_reviews: merchantFormData.totalReviews || 0,
        active: merchantFormData.active ?? true,
        featured: merchantFormData.featured ?? false,
        address: merchantFormData.address || null,
        formatted_address: merchantFormData.formattedAddress || merchantFormData.address || null,
        latitude: merchantFormData.latitude ?? null,
        longitude: merchantFormData.longitude ?? null,
        osm_place_id: merchantFormData.osmPlaceId || null,
        contact_number: merchantFormData.contactNumber || null,
        email: merchantFormData.email || null,
        opening_hours: merchantFormData.openingHours || null,
        payment_methods: merchantFormData.paymentMethods || [],
        logo_url: merchantFormData.logoUrl || null,
        cover_image_url: merchantFormData.coverImageUrl || null,
      };

      if (editingMerchant) {
        // Update existing merchant
        const { error } = await supabase
          .from('merchants')
          .update(merchantData)
          .eq('id', editingMerchant.id);

        if (error) throw error;
        alert('Merchant updated successfully');
      } else {
        // Create new merchant
        const { error } = await supabase
          .from('merchants')
          .insert(merchantData);

        if (error) throw error;
        alert('Merchant created successfully');
      }

      await refetchMerchants();
      setCurrentView('list');
      setEditingMerchant(null);
    } catch (error) {
      console.error('Error saving merchant:', error);
      alert('Failed to save merchant');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddItem = () => {
    setEditingItem(null);
    setItemFormData({
      name: '',
      description: '',
      basePrice: 0,
      category: categories[0]?.id || 'dim-sum',
      popular: false,
      available: true,
      variations: [],
      addOns: [],
      trackInventory: false,
      stockQuantity: null,
      lowStockThreshold: 0
    });
    setShowAddItemForm(true);
  };

  const handleMerchantAddressSelect = (suggestion: OSMAddressSuggestion) => {
    setMerchantFormErrors((prev) => ({ ...prev, address: undefined }));
    setMerchantFormData((prev) => ({
      ...prev,
      address: suggestion.displayName,
      formattedAddress: suggestion.displayName,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      osmPlaceId: suggestion.placeId,
    }));
  };

  const handleMerchantAddressClearSelection = () => {
    setMerchantFormData((prev) => ({
      ...prev,
      latitude: null,
      longitude: null,
      osmPlaceId: undefined,
    }));
  };

  const handleEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemFormData(item);
    setShowAddItemForm(true);
  };

  const handleDeleteItem = async (id: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      try {
        setIsProcessing(true);
        await deleteMenuItem(id);
        await refetchMenu();
      } catch (error) {
        console.error('Error deleting item:', error);
        alert('Failed to delete item');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleSaveItem = async () => {
    if (!itemFormData.name || !itemFormData.description || !itemFormData.basePrice) {
      alert('Please fill in all required fields');
      return;
    }

    if (!selectedMerchant) {
      alert('No merchant selected');
      return;
    }

    const payload: Partial<MenuItem> = {
      ...itemFormData,
      merchantId: selectedMerchant.id,
      stockQuantity: itemFormData.trackInventory
        ? Math.max(0, Math.floor(Number(itemFormData.stockQuantity ?? 0)))
        : null,
      lowStockThreshold: Math.max(0, Math.floor(Number(itemFormData.lowStockThreshold ?? 0)))
    };

    try {
      if (editingItem) {
        await updateMenuItem(editingItem.id, payload);
      } else {
        await addMenuItem(payload as Omit<MenuItem, 'id'>);
      }
      await refetchMenu();
      setShowAddItemForm(false);
      setEditingItem(null);
    } catch (error) {
      console.error('Error saving item:', error);
      alert('Failed to save item');
    }
  };

  const handleCancelItem = () => {
    setShowAddItemForm(false);
    setEditingItem(null);
  };

  const addVariation = () => {
    const newVariation: Variation = {
      id: `var-${Date.now()}`,
      name: '',
      price: 0
    };
    setItemFormData({
      ...itemFormData,
      variations: [...(itemFormData.variations || []), newVariation]
    });
  };

  const updateVariation = (index: number, field: keyof Variation, value: string | number) => {
    const updatedVariations = [...(itemFormData.variations || [])];
    updatedVariations[index] = { ...updatedVariations[index], [field]: value };
    setItemFormData({ ...itemFormData, variations: updatedVariations });
  };

  const removeVariation = (index: number) => {
    const updatedVariations = itemFormData.variations?.filter((_, i) => i !== index) || [];
    setItemFormData({ ...itemFormData, variations: updatedVariations });
  };

  const addAddOn = () => {
    const newAddOn: AddOn = {
      id: `addon-${Date.now()}`,
      name: '',
      price: 0,
      category: 'extras'
    };
    setItemFormData({
      ...itemFormData,
      addOns: [...(itemFormData.addOns || []), newAddOn]
    });
  };

  const updateAddOn = (index: number, field: keyof AddOn, value: string | number) => {
    const updatedAddOns = [...(itemFormData.addOns || [])];
    updatedAddOns[index] = { ...updatedAddOns[index], [field]: value };
    setItemFormData({ ...itemFormData, addOns: updatedAddOns });
  };

  const removeAddOn = (index: number) => {
    const updatedAddOns = itemFormData.addOns?.filter((_, i) => i !== index) || [];
    setItemFormData({ ...itemFormData, addOns: updatedAddOns });
  };

  const merchantMenuItems = menuItems.filter(item => 
    selectedMerchant && item.merchantId === selectedMerchant.id
  );
  const duplicationProgress = duplicationStatus.total > 0
    ? Math.round((duplicationStatus.processed / duplicationStatus.total) * 100)
    : 0;

  const duplicationOverlay = duplicationStatus.active ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Duplicating merchant...</h2>
        </div>
        <p className="text-sm text-gray-700">
          Cloning <span className="font-medium">{duplicationStatus.merchantName}</span> with menu items and options.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          This may take around 30 seconds to 1 minute for larger menus.
        </p>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
            <span>Progress</span>
            <span>
              {duplicationStatus.processed}/{duplicationStatus.total || '?'} items
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${duplicationProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // Merchant Detail View
  if (currentView === 'merchant-detail' && selectedMerchant) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleBackToList}
                  className="flex items-center space-x-2 text-gray-600 hover:text-black transition-colors duration-200"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span>Back to Merchants</span>
                </button>
                <div className="flex items-center space-x-3">
                  {selectedMerchant.logoUrl && (
                    <img
                      src={selectedMerchant.logoUrl}
                      alt={selectedMerchant.name}
                      className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                    />
                  )}
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">{selectedMerchant.name}</h1>
                    <p className="text-sm text-gray-600 capitalize">{selectedMerchant.category}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={handleAddItem}
                className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200"
              >
                <Plus className="h-4 w-4" />
                <span>Add Menu Item</span>
              </button>
            </div>
          </div>
        </div>

        {/* Merchant Info */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 text-white py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-green-100 text-sm">Delivery Fee</p>
                <p className="text-2xl font-bold">₱{selectedMerchant.deliveryFee}</p>
              </div>
              <div>
                <p className="text-green-100 text-sm">Minimum Order</p>
                <p className="text-2xl font-bold">₱{selectedMerchant.minimumOrder}</p>
              </div>
              <div>
                <p className="text-green-100 text-sm">Rating</p>
                <div className="flex items-center space-x-2">
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  <p className="text-2xl font-bold">{selectedMerchant.rating.toFixed(1)}</p>
                  <span className="text-green-100">({selectedMerchant.totalReviews} reviews)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add/Edit Item Form */}
        {showAddItemForm && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
                </h2>
                <button
                  onClick={handleCancelItem}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Item Name *</label>
                  <input
                    type="text"
                    value={itemFormData.name || ''}
                    onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter item name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-2">Base Price *</label>
                  <input
                    type="number"
                    value={itemFormData.basePrice || ''}
                    onChange={(e) => setItemFormData({ ...itemFormData, basePrice: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-2">Category *</label>
                  <select
                    value={itemFormData.category || ''}
                    onChange={(e) => setItemFormData({ ...itemFormData, category: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-6">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={itemFormData.popular || false}
                      onChange={(e) => setItemFormData({ ...itemFormData, popular: e.target.checked })}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm font-medium text-black">Popular</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={itemFormData.available ?? true}
                      onChange={(e) => setItemFormData({ ...itemFormData, available: e.target.checked })}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm font-medium text-black">Available</span>
                  </label>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-black mb-2">Description *</label>
                <textarea
                  value={itemFormData.description || ''}
                  onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter item description"
                  rows={3}
                />
              </div>

              <div className="mb-6">
                <ImageUpload
                  currentImage={itemFormData.image}
                  onImageChange={(imageUrl) => setItemFormData({ ...itemFormData, image: imageUrl })}
                />
              </div>

              {/* Variations */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Size Variations</h3>
                  <button
                    onClick={addVariation}
                    className="flex items-center space-x-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Variation</span>
                  </button>
                </div>

                {itemFormData.variations?.map((variation, index) => (
                  <div key={variation.id} className="flex items-center space-x-3 mb-3 p-4 bg-gray-50 rounded-lg">
                    <input
                      type="text"
                      value={variation.name}
                      onChange={(e) => updateVariation(index, 'name', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Variation name"
                    />
                    <input
                      type="number"
                      value={variation.price}
                      onChange={(e) => updateVariation(index, 'price', Number(e.target.value))}
                      className="w-24 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Price"
                    />
                    <button
                      onClick={() => removeVariation(index)}
                      className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add-ons */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Add-ons</h3>
                  <button
                    onClick={addAddOn}
                    className="flex items-center space-x-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Add-on</span>
                  </button>
                </div>

                {itemFormData.addOns?.map((addOn, index) => (
                  <div key={addOn.id} className="flex items-center space-x-3 mb-3 p-4 bg-gray-50 rounded-lg">
                    <input
                      type="text"
                      value={addOn.name}
                      onChange={(e) => updateAddOn(index, 'name', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Add-on name"
                    />
                    <select
                      value={addOn.category}
                      onChange={(e) => updateAddOn(index, 'category', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      {addOnCategories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={addOn.price}
                      onChange={(e) => updateAddOn(index, 'price', Number(e.target.value))}
                      className="w-24 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Price"
                    />
                    <button
                      onClick={() => removeAddOn(index)}
                      className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleCancelItem}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveItem}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  {editingItem ? 'Update Item' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Menu Items List */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Menu Items ({merchantMenuItems.length})
              </h3>
            </div>

            {menuLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading menu items...</p>
              </div>
            ) : merchantMenuItems.length === 0 ? (
              <div className="text-center py-12">
                <ChefHat className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No menu items yet</h3>
                <p className="text-gray-600 mb-4">Start by adding your first menu item</p>
                <button
                  onClick={handleAddItem}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  Add Your First Item
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {merchantMenuItems.map((item) => (
                  <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start space-x-4">
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-20 h-20 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="text-lg font-semibold text-gray-900">{item.name}</h4>
                            <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleEditItem(item)}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              disabled={isProcessing}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span className="font-medium text-gray-900">₱{item.basePrice}</span>
                          {item.variations && item.variations.length > 0 && (
                            <span>{item.variations.length} sizes</span>
                          )}
                          {item.addOns && item.addOns.length > 0 && (
                            <span>{item.addOns.length} add-ons</span>
                          )}
                          {item.popular && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                              Popular
                            </span>
                          )}
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            item.available 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {item.available ? 'Available' : 'Unavailable'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {duplicationOverlay}
      </div>
    );
  }

  // Merchant Add/Edit Form View
  if (currentView === 'add-merchant' || currentView === 'edit-merchant') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleBackToList}
                  className="flex items-center space-x-2 text-gray-600 hover:text-black transition-colors duration-200"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span>Back</span>
                </button>
                <h1 className="text-2xl font-playfair font-semibold text-black">
                  {currentView === 'add-merchant' ? 'Add New Merchant' : 'Edit Merchant'}
                </h1>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleBackToList}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200 flex items-center space-x-2"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
                <button
                  onClick={handleSaveMerchant}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center space-x-2 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>Save</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-8">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-playfair font-medium text-black mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Merchant Name *</label>
                  <input
                    type="text"
                    value={merchantFormData.name || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setMerchantFormData({ ...merchantFormData, name: value });
                      if (value.trim()) {
                        setMerchantFormErrors((prev) => ({ ...prev, name: undefined }));
                      }
                    }}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                      merchantFormErrors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="Enter merchant name"
                  />
                  {merchantFormErrors.name && (
                    <p className="mt-2 text-xs text-red-600">{merchantFormErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-2">Category *</label>
                  <select
                    value={merchantFormData.category || ''}
                    onChange={(e) => setMerchantFormData({ ...merchantFormData, category: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="restaurant">Restaurant</option>
                    <option value="cafe">Cafe</option>
                    <option value="fast-food">Fast Food</option>
                    <option value="bakery">Bakery</option>
                    <option value="dessert">Dessert</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-2">Cuisine Type</label>
                  <input
                    type="text"
                    value={merchantFormData.cuisineType || ''}
                    onChange={(e) => setMerchantFormData({ ...merchantFormData, cuisineType: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="e.g., Filipino, Italian, Chinese"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-2">Estimated Delivery Time</label>
                  <input
                    type="text"
                    value={merchantFormData.estimatedDeliveryTime || ''}
                    onChange={(e) => setMerchantFormData({ ...merchantFormData, estimatedDeliveryTime: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="e.g., 30-45 mins"
                  />
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-black mb-2">Description</label>
                <textarea
                  value={merchantFormData.description || ''}
                  onChange={(e) => setMerchantFormData({ ...merchantFormData, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter merchant description"
                  rows={3}
                />
              </div>
            </div>

            {/* Pricing */}
            <div>
              <h3 className="text-lg font-playfair font-medium text-black mb-4">Pricing</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Base Delivery Fee (₱)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={merchantFormData.baseDeliveryFee ?? merchantFormData.deliveryFee ?? 0}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setMerchantFormData({
                        ...merchantFormData,
                        baseDeliveryFee: value,
                        deliveryFee: value,
                      });
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="0"
                  />
                  <p className="mt-1 text-xs text-gray-500">Starting delivery fee before distance charges.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-2">Minimum Order (₱)</label>
                  <input
                    type="number"
                    value={merchantFormData.minimumOrder || 0}
                    onChange={(e) => setMerchantFormData({ ...merchantFormData, minimumOrder: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-2">Delivery Fee per KM (₱)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={merchantFormData.deliveryFeePerKm ?? 0}
                    onChange={(e) => setMerchantFormData({ ...merchantFormData, deliveryFeePerKm: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="0"
                  />
                  <p className="mt-1 text-xs text-gray-500">Additional fee charged for every kilometer.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-2">Max Delivery Radius (km)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={merchantFormData.maxDeliveryDistanceKm ?? 20}
                    onChange={(e) => setMerchantFormData({ ...merchantFormData, maxDeliveryDistanceKm: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="20"
                  />
                  <p className="mt-1 text-xs text-gray-500">Orders outside this radius will be blocked.</p>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-green-100 bg-green-50 p-4">
                <p className="text-sm font-medium text-green-900">Delivery Fee Formula</p>
                <p className="mt-1 text-xs text-green-800">
                  Delivery Fee = Base Fee + (Distance in km × Fee per km), with optional min/max caps.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[1, 3, 5].map((distanceKm) => {
                    const previewFee = calculateDeliveryFee(distanceKm, {
                      baseDeliveryFee: Number(merchantFormData.baseDeliveryFee ?? merchantFormData.deliveryFee ?? 0),
                      deliveryFeePerKm: Number(merchantFormData.deliveryFeePerKm ?? 4),
                      minDeliveryFee: merchantFormData.minDeliveryFee ?? null,
                      maxDeliveryFee: merchantFormData.maxDeliveryFee ?? null,
                    });

                    return (
                      <div key={distanceKm} className="rounded-lg bg-white px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">{distanceKm} km</p>
                        <p className="text-sm font-semibold text-gray-900">₱{previewFee.toFixed(2)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <h3 className="text-lg font-playfair font-medium text-black mb-4">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-800">
                    <MapPin className="h-4 w-4 text-green-700" />
                    <span>Merchant Delivery Address</span>
                  </div>
                  <AddressAutocompleteInput
                    label="Delivery Address"
                    required
                    value={merchantFormData.address || ''}
                    onChange={(value) =>
                      setMerchantFormData({
                        ...merchantFormData,
                        address: value,
                        formattedAddress: value,
                      })
                    }
                    onSelect={handleMerchantAddressSelect}
                    onClearSelection={handleMerchantAddressClearSelection}
                    placeholder="Search and select the merchant delivery address"
                    rows={2}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 ${
                      merchantFormErrors.address ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    countryCodes={['ph']}
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Start typing, then choose a suggested address to pin the merchant location.
                  </p>
                  {merchantFormErrors.address && (
                    <p className="mt-2 text-xs text-red-600">{merchantFormErrors.address}</p>
                  )}
                  {merchantFormData.latitude !== null && merchantFormData.longitude !== null ? (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Location pinned ({merchantFormData.latitude.toFixed(6)}, {merchantFormData.longitude.toFixed(6)})
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-amber-700">No pinned location yet.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-2">Contact Number</label>
                  <input
                    type="text"
                    value={merchantFormData.contactNumber || ''}
                    onChange={(e) => setMerchantFormData({ ...merchantFormData, contactNumber: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter contact number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-2">Email</label>
                  <input
                    type="email"
                    value={merchantFormData.email || ''}
                    onChange={(e) => setMerchantFormData({ ...merchantFormData, email: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter email"
                  />
                </div>
              </div>
            </div>

            {/* Images */}
            <div>
              <h3 className="text-lg font-playfair font-medium text-black mb-4">Images</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Logo</label>
                  <ImageUpload
                    currentImage={merchantFormData.logoUrl}
                    onImageChange={(imageUrl) => setMerchantFormData({ ...merchantFormData, logoUrl: imageUrl })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-2">Cover Image</label>
                  <ImageUpload
                    currentImage={merchantFormData.coverImageUrl}
                    onImageChange={(imageUrl) => setMerchantFormData({ ...merchantFormData, coverImageUrl: imageUrl })}
                  />
                </div>
              </div>
            </div>

            {/* Status */}
            <div>
              <h3 className="text-lg font-playfair font-medium text-black mb-4">Status</h3>
              <div className="space-y-3">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={merchantFormData.active ?? true}
                    onChange={(e) => setMerchantFormData({ ...merchantFormData, active: e.target.checked })}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm font-medium text-black">Active</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={merchantFormData.featured ?? false}
                    onChange={(e) => setMerchantFormData({ ...merchantFormData, featured: e.target.checked })}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm font-medium text-black">Featured (Show on homepage)</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        {duplicationOverlay}
      </div>
    );
  }

  // Merchants List View
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="flex items-center space-x-2 text-gray-600 hover:text-black transition-colors duration-200"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Dashboard</span>
              </button>
              <h1 className="text-2xl font-playfair font-semibold text-black">Merchants</h1>
            </div>
            <button
              onClick={handleAddMerchant}
              className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200"
            >
              <Plus className="h-4 w-4" />
              <span>Add New Merchant</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {merchantsLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
            <p className="text-gray-600">Loading merchants...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {merchants.map((merchant) => {
              const merchantItems = menuItems.filter(item => item.merchantId === merchant.id);
              return (
                <div 
                  key={merchant.id} 
                  onClick={() => handleViewMerchant(merchant)}
                  className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300 cursor-pointer"
                >
                  {merchant.coverImageUrl && (
                    <div className="relative h-48 bg-gray-200">
                      <img
                        src={merchant.coverImageUrl}
                        alt={merchant.name}
                        className="w-full h-full object-cover"
                      />
                      {merchant.featured && (
                        <div className="absolute top-4 right-4 bg-yellow-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center">
                          <Star className="h-3 w-3 mr-1 fill-white" />
                          Featured
                        </div>
                      )}
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 mb-1">
                          {merchant.name}
                        </h3>
                        <p className="text-sm text-gray-600 capitalize">{merchant.category}</p>
                      </div>
                      {merchant.logoUrl && (
                        <img
                          src={merchant.logoUrl}
                          alt={merchant.name}
                          className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
                        />
                      )}
                    </div>

                    {merchant.description && (
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                        {merchant.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        <span className="text-sm font-medium">{merchant.rating.toFixed(1)}</span>
                        <span className="text-sm text-gray-600">({merchant.totalReviews})</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        merchant.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {merchant.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                      <span>Delivery: ₱{merchant.deliveryFee}</span>
                      <span>Min: ₱{merchant.minimumOrder}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                      <p className="rounded-lg bg-blue-50 px-3 py-2 text-blue-800">
                        ₱{(merchant.deliveryFeePerKm ?? 4).toFixed(2)}/km
                      </p>
                      <p className="rounded-lg bg-purple-50 px-3 py-2 text-purple-800 text-right">
                        Radius: {(merchant.maxDeliveryDistanceKm ?? 20).toFixed(1)} km
                      </p>
                    </div>

                    <div className="mb-4">
                      {merchant.address ? (
                        <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                          Delivery address configured
                        </p>
                      ) : (
                        <p className="text-xs text-amber-800 bg-amber-50 px-3 py-2 rounded-lg">
                          Delivery address not configured
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Package className="h-4 w-4" />
                        <span>{merchantItems.length} menu items</span>
                      </div>
                      <div className="flex space-x-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditMerchant(merchant);
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="Edit Merchant"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateMerchant(merchant);
                          }}
                          disabled={isProcessing}
                          className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                          title="Duplicate Merchant and Menu Items"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMerchant(merchant.id);
                          }}
                          disabled={isProcessing}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="Delete Merchant"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewMerchant(merchant);
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                        >
                          Manage Menu
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!merchantsLoading && merchants.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">No merchants found</p>
            <p className="text-sm text-gray-500">Add your first merchant to get started</p>
          </div>
        )}
      </div>
      {duplicationOverlay}
    </div>
  );
};

export default MerchantManager;

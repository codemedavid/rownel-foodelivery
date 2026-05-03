import React, { useState, useMemo } from 'react';
import { ArrowLeft, Store, AlertTriangle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PaymentMethod } from '../types';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useCartContext } from '../contexts/CartContext';
import { useMerchants } from '../hooks/useMerchants';
import { useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import AddressAutocompleteInput from './AddressAutocompleteInput';
import MapLocationPicker from './MapLocationPicker';
import type { OSMAddressSuggestion } from '../lib/osm';
import { reverseGeocode, isWithinPhilippines } from '../lib/osm';
import { calculateDeliveryFee, haversineKm } from '../lib/deliveryPricing';
import { getMinOrderStatus, isMerchantOpen } from '../lib/timeUtils';

interface CheckoutProps {
  onBack: () => void;
}

const Checkout: React.FC<CheckoutProps> = ({ onBack }) => {
  const { paymentMethods: allPaymentMethods } = usePaymentMethods();
  const { cartItems, getTotalPrice, clearCart } = useCartContext();
  const { merchants } = useMerchants();
  const createOrderMutation = useMutation(api.orders.create);
  const decrementStock = useAction(api.inventoryActions.decrementStock);
  const navigate = useNavigate();
  const totalPrice = getTotalPrice();
  
  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryLatitude, setDeliveryLatitude] = useState<number | null>(null);
  const [deliveryLongitude, setDeliveryLongitude] = useState<number | null>(null);
  const [deliveryOsmPlaceId, setDeliveryOsmPlaceId] = useState<string | null>(null);
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('gcash');
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<'priority' | 'economy'>('priority');
  const [addressOutsidePH, setAddressOutsidePH] = useState(false);

  // Group cart items by merchant
  const itemsByMerchant = useMemo(() => {
    const grouped: Record<string, typeof cartItems> = {};
    
    cartItems.forEach(item => {
      if (!grouped[item.merchantId]) {
        grouped[item.merchantId] = [];
      }
      grouped[item.merchantId].push(item);
    });
    
    return grouped;
  }, [cartItems]);

  // Get unique merchant IDs from cart
  const merchantIds = useMemo(() => Object.keys(itemsByMerchant), [itemsByMerchant]);

  const hasEconomyOption = useMemo(() => {
    return merchantIds.some((merchantId) => {
      const merchant = merchants.find((m) => m.id === merchantId);
      return merchant && (merchant.fixedDeliveryFee ?? 0) > 0;
    });
  }, [merchantIds, merchants]);

  // For multi-merchant orders: use only the HIGHEST fee (furthest merchant for
  // priority, or highest fixed fee for economy) instead of summing all fees.

  const priorityFeeTotal = useMemo(() => {
    let maxFee = 0;
    for (const merchantId of merchantIds) {
      const merchant = merchants.find((m) => m.id === merchantId);
      if (!merchant || merchant.latitude == null || merchant.longitude == null || deliveryLatitude === null || deliveryLongitude === null) continue;
      const distanceKm = haversineKm(merchant.latitude, merchant.longitude, deliveryLatitude, deliveryLongitude);
      const maxDist = merchant.maxDeliveryDistanceKm ?? null;
      if (maxDist !== null && distanceKm > maxDist) continue;
      const fee = calculateDeliveryFee(distanceKm, {
        baseDeliveryFee: merchant.baseDeliveryFee ?? merchant.deliveryFee ?? 0,
        deliveryFeePerKm: merchant.deliveryFeePerKm ?? 4,
        minDeliveryFee: merchant.minDeliveryFee,
        maxDeliveryFee: merchant.maxDeliveryFee,
      });
      if (fee > maxFee) maxFee = fee;
    }
    return maxFee;
  }, [merchantIds, merchants, deliveryLatitude, deliveryLongitude]);

  const economyFeeTotal = useMemo(() => {
    let maxFee = 0;
    for (const merchantId of merchantIds) {
      const merchant = merchants.find((m) => m.id === merchantId);
      if (!merchant || merchant.latitude == null || merchant.longitude == null || deliveryLatitude === null || deliveryLongitude === null) continue;
      const distanceKm = haversineKm(merchant.latitude, merchant.longitude, deliveryLatitude, deliveryLongitude);
      const maxDist = merchant.pasabuyMaxDistanceKm ?? merchant.maxDeliveryDistanceKm ?? null;
      if (maxDist !== null && distanceKm > maxDist) continue;
      let fee: number;
      if ((merchant.fixedDeliveryFee ?? 0) > 0) {
        fee = merchant.fixedDeliveryFee ?? 0;
      } else {
        fee = calculateDeliveryFee(distanceKm, {
          baseDeliveryFee: merchant.baseDeliveryFee ?? merchant.deliveryFee ?? 0,
          deliveryFeePerKm: merchant.deliveryFeePerKm ?? 4,
          minDeliveryFee: merchant.minDeliveryFee,
          maxDeliveryFee: merchant.maxDeliveryFee,
        });
      }
      if (fee > maxFee) maxFee = fee;
    }
    return maxFee;
  }, [merchantIds, merchants, deliveryLatitude, deliveryLongitude]);

  const deliveryQuotesByMerchant = useMemo(() => {
    const quotes: Record<
      string,
      {
        deliverable: boolean;
        reason?: string;
        distanceKm?: number;
        deliveryFee?: number;
      }
    > = {};

    for (const merchantId of merchantIds) {
      const merchant = merchants.find((m) => m.id === merchantId);

      if (!merchant) {
        quotes[merchantId] = { deliverable: false, reason: 'Merchant not found.' };
        continue;
      }

      if (deliveryLatitude === null || deliveryLongitude === null) {
        quotes[merchantId] = {
          deliverable: false,
          reason: 'Select a suggested delivery address to calculate distance and fee.',
        };
        continue;
      }

      if (merchant.latitude == null || merchant.longitude == null) {
        quotes[merchantId] = {
          deliverable: false,
          reason: 'Merchant delivery location is not configured yet.',
        };
        continue;
      }

      const distanceKm = haversineKm(merchant.latitude, merchant.longitude, deliveryLatitude, deliveryLongitude);
      const maxDistanceKm = deliveryMode === 'economy'
        ? (merchant.pasabuyMaxDistanceKm ?? merchant.maxDeliveryDistanceKm ?? null)
        : (merchant.maxDeliveryDistanceKm ?? null);
      const isDeliverable = maxDistanceKm === null || distanceKm <= maxDistanceKm;

      if (!isDeliverable) {
        quotes[merchantId] = {
          deliverable: false,
          distanceKm,
          reason: `Outside Pasabuy radius (${maxDistanceKm} km max).`,
        };
        continue;
      }

      let deliveryFee: number;
      if (deliveryMode === 'economy' && (merchant.fixedDeliveryFee ?? 0) > 0) {
        deliveryFee = (merchant.fixedDeliveryFee ?? 0);
      } else {
        deliveryFee = calculateDeliveryFee(distanceKm, {
          baseDeliveryFee: merchant.baseDeliveryFee ?? merchant.deliveryFee ?? 0,
          deliveryFeePerKm: merchant.deliveryFeePerKm ?? 4,
          minDeliveryFee: merchant.minDeliveryFee,
          maxDeliveryFee: merchant.maxDeliveryFee,
        });
      }

      quotes[merchantId] = {
        deliverable: true,
        distanceKm,
        deliveryFee,
      };
    }

    return quotes;
  }, [deliveryLatitude, deliveryLongitude, merchantIds, merchants, deliveryMode]);

  // Identify the "primary" merchant (highest fee / furthest) — only this order
  // carries the delivery fee; the other merchant orders get 0.
  const primaryDeliveryMerchantId = useMemo(() => {
    let bestId: string | null = null;
    let bestFee = 0;
    for (const merchantId of merchantIds) {
      const quote = deliveryQuotesByMerchant[merchantId];
      if (quote?.deliverable && (quote.deliveryFee ?? 0) > bestFee) {
        bestFee = quote.deliveryFee ?? 0;
        bestId = merchantId;
      }
    }
    return bestId;
  }, [merchantIds, deliveryQuotesByMerchant]);

  const deliveryFeeTotal = useMemo(() => {
    if (!primaryDeliveryMerchantId) return 0;
    const quote = deliveryQuotesByMerchant[primaryDeliveryMerchantId];
    return quote?.deliverable ? (quote.deliveryFee ?? 0) : 0;
  }, [primaryDeliveryMerchantId, deliveryQuotesByMerchant]);

  const grandTotal = totalPrice + deliveryFeeTotal;

  // Filter payment methods based on cart merchants
  // Show: 1) All-merchant payment methods (merchant_id = null)
  //       2) Merchant-specific methods if cart only has one merchant
  const paymentMethods = useMemo(() => {
    return allPaymentMethods.filter(method => {
      // Always show payment methods available for all merchants
      if (method.merchant_id === null) return true;
      
      // If cart has items from a single merchant, show that merchant's specific payment methods
      if (merchantIds.length === 1 && method.merchant_id === merchantIds[0]) return true;
      
      return false;
    });
  }, [allPaymentMethods, merchantIds]);

  // Calculate subtotal for a merchant
  const getMerchantSubtotal = (merchantId: string) => {
    const items = itemsByMerchant[merchantId] || [];
    return items.reduce((sum, item) => sum + (item.totalPrice * item.quantity), 0);
  };

  const merchantValidation = useMemo(() => {
    const validation: Record<string, { minOrder: ReturnType<typeof getMinOrderStatus>; openStatus: ReturnType<typeof isMerchantOpen> }> = {};

    merchantIds.forEach(merchantId => {
      const merchant = merchants.find(m => m.id === merchantId);
      const subtotal = getMerchantSubtotal(merchantId);
      validation[merchantId] = {
        minOrder: getMinOrderStatus(merchant?.minimumOrder || 0, subtotal),
        openStatus: isMerchantOpen(merchant?.openingHours),
      };
    });

    return validation;
  }, [merchantIds, merchants, itemsByMerchant]);

  const hasMinOrderIssue = Object.values(merchantValidation).some(v => !v.minOrder.met);
  const hasClosedMerchant = Object.values(merchantValidation).some(v => !v.openStatus.isOpen);

  // Auto-fill delivery location from localStorage (set on home page)
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('userDeliveryLocation');
      if (!stored) return;
      const loc = JSON.parse(stored);
      if (!loc.latitude || !loc.longitude) return;
      if (!isWithinPhilippines(loc.latitude, loc.longitude)) return;
      reverseGeocode(loc.latitude, loc.longitude).then(result => {
        if (result.countryCode && result.countryCode !== 'ph') return;
        setDeliveryLatitude(result.latitude);
        setDeliveryLongitude(result.longitude);
        setAddress(result.displayName);
        setDeliveryOsmPlaceId(result.placeId);
      }).catch(() => {});
    } catch {
      // ignore malformed storage
    }
  }, []);

  // Set default payment method when payment methods are loaded
  React.useEffect(() => {
    if (paymentMethods.length > 0 && !paymentMethod) {
      setPaymentMethod(paymentMethods[0].id as PaymentMethod);
    }
  }, [paymentMethods, paymentMethod]);

  const selectedPaymentMethod = paymentMethods.find(method => method.id === paymentMethod);

  const handleAddressSelected = (suggestion: OSMAddressSuggestion) => {
    const isPhilippines =
      suggestion.countryCode === 'ph' ||
      isWithinPhilippines(suggestion.latitude, suggestion.longitude);

    if (!isPhilippines) {
      setAddressOutsidePH(true);
      setDeliveryLatitude(null);
      setDeliveryLongitude(null);
      setDeliveryOsmPlaceId(null);
      return;
    }

    setAddressOutsidePH(false);
    setDeliveryLatitude(suggestion.latitude);
    setDeliveryLongitude(suggestion.longitude);
    setDeliveryOsmPlaceId(suggestion.placeId);
  };

  const clearAddressSelection = () => {
    setDeliveryLatitude(null);
    setDeliveryLongitude(null);
    setDeliveryOsmPlaceId(null);
    setAddressOutsidePH(false);
  };

  const trimmedCustomerName = customerName.trim();
  const trimmedContactNumber = contactNumber.trim();
  const trimmedAddress = address.trim();
  const isAddressValid =
    Boolean(trimmedAddress) &&
    deliveryLatitude !== null &&
    deliveryLongitude !== null &&
    Boolean(deliveryOsmPlaceId);

  const handlePlaceOrder = async () => {
    if (!isAddressValid) {
      alert('Please select a valid delivery address from the suggestions before placing your order.');
      return;
    }

    setSubmitting(true);
    setOrderError(null);

    try {
      // Best-effort client IP fetch (3s timeout)
      let ipAddress: string | undefined;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const ipRes = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timer);
        const ipData = await ipRes.json();
        ipAddress = ipData.ip;
      } catch {
        // Ignore – IP is optional
      }

      const mergedNotes = landmark ? `${notes ? notes + ' | ' : ''}Landmark: ${landmark}` : notes;
      const orderIds: string[] = [];

      for (const [merchantId, items] of Object.entries(itemsByMerchant)) {
        const quote = deliveryQuotesByMerchant[merchantId];
        const merchantSubtotal = getMerchantSubtotal(merchantId);
        const merchantForOrder = merchants.find(m => m.id === merchantId);
        // Only the primary (furthest) merchant carries the delivery fee
        const merchantDeliveryFee = merchantId === primaryDeliveryMerchantId
          ? deliveryFeeTotal
          : 0;
        const orderTotal = merchantSubtotal + merchantDeliveryFee;

        const orderItems = items.map(item => ({
          itemId: item.menuItemId ?? item.id,
          name: item.name,
          variation: item.selectedVariation
            ? { name: item.selectedVariation.name, price: item.selectedVariation.price }
            : item.selectedVariations && Object.keys(item.selectedVariations).length > 0
              ? Object.fromEntries(
                  Object.entries(item.selectedVariations).map(([group, v]) => [group, { name: v.name, price: v.price }])
                )
              : undefined,
          addOns: item.selectedAddOns && item.selectedAddOns.length > 0
            ? item.selectedAddOns.map(a => ({ name: a.name, price: a.price, quantity: a.quantity ?? 1 }))
            : undefined,
          unitPrice: item.totalPrice,
          quantity: item.quantity,
          subtotal: item.totalPrice * item.quantity,
        }));

        const stockAdjustments = items.map(item => ({
          id: item.menuItemId ?? item.id,
          quantity: item.quantity,
        }));

        const orderId = await createOrderMutation({
          merchantId,
          customerName: trimmedCustomerName,
          contactNumber: trimmedContactNumber,
          serviceType: 'delivery',
          address: trimmedAddress,
          deliveryLatitude: deliveryLatitude ?? undefined,
          deliveryLongitude: deliveryLongitude ?? undefined,
          merchantLatitude: merchantForOrder?.latitude ?? undefined,
          merchantLongitude: merchantForOrder?.longitude ?? undefined,
          distanceKm: quote?.distanceKm,
          deliveryFee: merchantDeliveryFee,
          deliveryMode: hasEconomyOption ? deliveryMode : undefined,
          paymentMethod,
          notes: mergedNotes || undefined,
          total: orderTotal,
          ipAddress,
          items: orderItems,
        });

        // Best-effort inventory decrement via Supabase bridge
        if (stockAdjustments.length > 0) {
          try {
            await decrementStock({ items: stockAdjustments });
          } catch (err) {
            console.error("Failed to decrement stock:", err);
          }
        }

        // Save to local order history
        try {
          const merchant = merchants.find(m => m.id === merchantId);
          const historyRecord = {
            orderId: orderId as string,
            merchantId,
            merchantName: merchant?.name ?? 'Restaurant',
            customerName: trimmedCustomerName,
            total: orderTotal,
            deliveryFee: merchantDeliveryFee,
            paymentMethod,
            placedAt: Date.now(),
            items: items.map(item => ({
              name: item.name,
              quantity: item.quantity,
              subtotal: item.totalPrice * item.quantity,
            })),
          };
          const existing = JSON.parse(localStorage.getItem('orderHistory') ?? '[]');
          const updated = [historyRecord, ...existing].slice(0, 30);
          localStorage.setItem('orderHistory', JSON.stringify(updated));
        } catch {
          // ignore storage errors
        }

        orderIds.push(orderId as string);
      }

      clearCart();

      navigate(`/track/${orderIds[0]}`);
    } catch (err: any) {
      console.error('Order submission failed:', err);
      setOrderError(err?.message || 'Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasUndeliverableMerchant = merchantIds.some((merchantId) => !deliveryQuotesByMerchant[merchantId]?.deliverable);
  const isDetailsValid = trimmedCustomerName && trimmedContactNumber && isAddressValid;
  const canPlaceOrder = Boolean(isDetailsValid) && !hasUndeliverableMerchant && !hasMinOrderIssue && !hasClosedMerchant && !addressOutsidePH;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky page header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-gray-500 hover:text-black transition-colors duration-200 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <h1 className="text-xl font-noto font-semibold text-black">Checkout</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 items-start">

          {/* ── Left: Form ── */}
          <div className="space-y-4">

            {/* Contact Information */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Contact Information</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Full Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent focus:bg-white transition-all duration-200 placeholder-gray-400"
                    placeholder="Enter your full name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Contact Number <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent focus:bg-white transition-all duration-200 placeholder-gray-400"
                    placeholder="09XX XXX XXXX"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Delivery Address */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Delivery Address</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Street Address <span className="text-red-500">*</span></label>
                  <AddressAutocompleteInput
                    label=""
                    required
                    value={address}
                    onChange={setAddress}
                    onSelect={handleAddressSelected}
                    onClearSelection={clearAddressSelection}
                    placeholder="Enter your complete delivery address"
                    countryCodes={['ph']}
                  />
                  {addressOutsidePH && (
                    <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      Sorry, we only deliver within the Philippines. Please enter a Philippine address.
                    </p>
                  )}
                  {!addressOutsidePH && trimmedAddress && !isAddressValid && (
                    <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                      Select a suggested address to calculate your delivery fee.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Pin Your Location</label>
                  <div className="rounded-xl overflow-hidden border border-gray-200">
                    <MapLocationPicker
                      latitude={deliveryLatitude}
                      longitude={deliveryLongitude}
                      onLocationSelect={(lat, lng, addr, placeId) => {
                        if (!isWithinPhilippines(lat, lng)) {
                          setAddressOutsidePH(true);
                          setDeliveryLatitude(null);
                          setDeliveryLongitude(null);
                          setDeliveryOsmPlaceId(null);
                          return;
                        }
                        setAddressOutsidePH(false);
                        setDeliveryLatitude(lat);
                        setDeliveryLongitude(lng);
                        setDeliveryOsmPlaceId(placeId);
                        setAddress(addr);
                      }}
                      showSearch={false}
                      showGpsButton
                      height="240px"
                      zoom={16}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Drag the pin or use GPS to set your exact drop-off point.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Landmark <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent focus:bg-white transition-all duration-200 placeholder-gray-400"
                    placeholder="e.g., Near McDonald's, Beside 7-Eleven"
                  />
                </div>
              </div>
            </div>

            {/* Delivery Option */}
            {deliveryLatitude !== null && deliveryLongitude !== null && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Delivery Option</h2>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('priority')}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                      deliveryMode === 'priority'
                        ? 'border-red-500 bg-red-50 shadow-sm'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className={`font-bold text-xs tracking-wide ${deliveryMode === 'priority' ? 'text-red-600' : 'text-gray-700'}`}>RUSH ORDER</span>
                      <span className="font-bold text-red-600 text-sm whitespace-nowrap">₱{priorityFeeTotal.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-400">30 – 45 mins</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('economy')}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                      deliveryMode === 'economy'
                        ? 'border-red-500 bg-red-50 shadow-sm'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className={`font-bold text-xs tracking-wide ${deliveryMode === 'economy' ? 'text-red-600' : 'text-gray-700'}`}>PASABAY</span>
                      <span className="font-bold text-red-600 text-sm whitespace-nowrap">₱{economyFeeTotal.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-400">45 – 120 mins</p>
                  </button>
                </div>
              </div>
            )}

            {/* Payment Method */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Payment Method <span className="text-red-500">*</span></h2>
              <div className="space-y-2 mb-4">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                    className={`w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 flex items-center gap-3 text-left ${
                      paymentMethod === method.id
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                      paymentMethod === method.id ? 'border-red-500 bg-red-500' : 'border-gray-300 bg-white'
                    }`}>
                      {paymentMethod === method.id && (
                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                      )}
                    </div>
                    <span className={`font-medium text-sm ${paymentMethod === method.id ? 'text-red-700' : 'text-gray-700'}`}>
                      {method.name}
                    </span>
                  </button>
                ))}
              </div>

              {/* Payment Details */}
              {selectedPaymentMethod && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 mb-0.5">Account Number</p>
                      <p className="font-mono font-semibold text-gray-900 text-sm mb-2 break-all">{selectedPaymentMethod.account_number}</p>
                      <p className="text-xs text-gray-400 mb-0.5">Account Name</p>
                      <p className="text-sm text-gray-700 mb-3">{selectedPaymentMethod.account_name}</p>
                      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 inline-block">
                        <p className="text-xs text-gray-400">Amount to pay</p>
                        <p className="text-lg font-bold text-red-600">₱{grandTotal.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-center">
                      <img
                        src={selectedPaymentMethod.qr_code_url}
                        alt={`${selectedPaymentMethod.name} QR Code`}
                        className="w-28 h-28 rounded-xl border border-gray-200 shadow-sm object-cover"
                        onError={(e) => {
                          e.currentTarget.src = 'https://images.pexels.com/photos/8867482/pexels-photo-8867482.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop';
                        }}
                      />
                      <p className="text-xs text-gray-400 mt-1.5">Scan to pay</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Special Instructions */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
                Special Instructions <span className="text-gray-400 font-normal normal-case">(optional)</span>
              </h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent focus:bg-white transition-all duration-200 placeholder-gray-400 resize-none"
                placeholder="Any special requests or notes for your order…"
                rows={3}
              />
            </div>
          </div>

          {/* ── Right: Order Summary + CTA ── */}
          <div className="space-y-4 lg:sticky lg:top-[65px]">

            {/* Order Summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Order Summary</h2>

              <div className="space-y-5">
                {Object.entries(itemsByMerchant).map(([merchantId, items]) => {
                  const merchant = merchants.find(m => m.id === merchantId);
                  const subtotal = getMerchantSubtotal(merchantId);

                  return (
                    <div key={merchantId}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Store className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{merchant?.name || 'Restaurant'}</span>
                      </div>

                      <div className="space-y-2">
                        {items.map((item) => (
                          <div key={item.id} className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 leading-snug">{item.name}</p>
                              {item.selectedVariation && (
                                <p className="text-xs text-gray-400">{item.selectedVariation.name}</p>
                              )}
                              {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                                <p className="text-xs text-gray-400">{item.selectedAddOns.map(a => a.name).join(', ')}</p>
                              )}
                              <p className="text-xs text-gray-400">₱{item.totalPrice} × {item.quantity}</p>
                            </div>
                            <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">₱{(item.totalPrice * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 pt-3 border-t border-dashed border-gray-200 space-y-1">
                        {deliveryQuotesByMerchant[merchantId]?.distanceKm !== undefined && (
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>Distance</span>
                            <span>{deliveryQuotesByMerchant[merchantId].distanceKm?.toFixed(2)} km</span>
                          </div>
                        )}
                        {!deliveryQuotesByMerchant[merchantId]?.deliverable && (
                          <p className="text-xs text-red-500">{deliveryQuotesByMerchant[merchantId]?.reason}</p>
                        )}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Subtotal</span>
                          <span className="font-semibold text-gray-800">₱{subtotal.toFixed(2)}</span>
                        </div>

                        {merchantValidation[merchantId] && !merchantValidation[merchantId].minOrder.met && (
                          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                            <p className="text-xs text-amber-700">
                              Add ₱{merchantValidation[merchantId].minOrder.remaining.toFixed(2)} more (min. ₱{merchantValidation[merchantId].minOrder.minimum.toFixed(2)})
                            </p>
                          </div>
                        )}
                        {merchantValidation[merchantId] && !merchantValidation[merchantId].openStatus.isOpen && (
                          <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mt-1.5">
                            <Clock className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                            <p className="text-xs text-red-600">
                              Closed — {merchantValidation[merchantId].openStatus.nextOpenTime}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Totals */}
              <div className="border-t border-gray-200 mt-4 pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>Food subtotal</span>
                  <span>₱{totalPrice.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    Delivery fee
                    {merchantIds.length > 1 && primaryDeliveryMerchantId && (
                      <span className="text-xs text-gray-400">(furthest)</span>
                    )}
                  </span>
                  <span>₱{deliveryFeeTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="text-2xl font-bold text-red-600">₱{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Place Order */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={!canPlaceOrder || submitting}
                className={`w-full py-4 rounded-xl font-semibold text-base transition-all duration-200 ${
                  canPlaceOrder && !submitting
                    ? 'bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] shadow-sm'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Placing Order…
                  </span>
                ) : 'Place Order'}
              </button>

              {orderError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-600">{orderError}</p>
                </div>
              )}

              {!canPlaceOrder && !submitting && (
                <p className="text-xs text-gray-400 text-center">
                  {addressOutsidePH && 'Delivery address must be within the Philippines. '}
                  {hasUndeliverableMerchant && 'Some merchants are outside delivery coverage. '}
                  {hasMinOrderIssue && 'Minimum order not met. '}
                  {hasClosedMerchant && 'Some merchants are currently closed. '}
                  {!isDetailsValid && !addressOutsidePH && 'Please fill in all required fields.'}
                </p>
              )}

              <p className="text-xs text-gray-400 text-center">
                You'll be redirected to order tracking once placed.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;

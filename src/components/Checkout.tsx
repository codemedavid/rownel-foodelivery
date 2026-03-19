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
      const maxDist = merchant.maxDeliveryDistanceKm ?? null;
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
      const maxDistanceKm = merchant.maxDeliveryDistanceKm ?? null;
      const isDeliverable = maxDistanceKm === null || distanceKm <= maxDistanceKm;

      if (!isDeliverable) {
        quotes[merchantId] = {
          deliverable: false,
          distanceKm,
          reason: `Outside delivery radius (${maxDistanceKm} km max).`,
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

  // Set default payment method when payment methods are loaded
  React.useEffect(() => {
    if (paymentMethods.length > 0 && !paymentMethod) {
      setPaymentMethod(paymentMethods[0].id as PaymentMethod);
    }
  }, [paymentMethods, paymentMethod]);

  const selectedPaymentMethod = paymentMethods.find(method => method.id === paymentMethod);

  const handleAddressSelected = (suggestion: OSMAddressSuggestion) => {
    setDeliveryLatitude(suggestion.latitude);
    setDeliveryLongitude(suggestion.longitude);
    setDeliveryOsmPlaceId(suggestion.placeId);
  };

  const clearAddressSelection = () => {
    setDeliveryLatitude(null);
    setDeliveryLongitude(null);
    setDeliveryOsmPlaceId(null);
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

        orderIds.push(orderId as string);
      }

      // Build order summary for Messenger
      let orderDetails = `🛒 Row-Nel FooDelivery ORDER\n\n👤 Customer: ${trimmedCustomerName}\n📞 Contact: ${trimmedContactNumber}\n📍 Service: Delivery\n🏠 Address: ${trimmedAddress}${landmark ? `\n🗺️ Landmark: ${landmark}` : ''}\n\n📋 ORDER DETAILS:\n`;

      for (const [merchantId, items] of Object.entries(itemsByMerchant)) {
        const merchant = merchants.find(m => m.id === merchantId);
        const merchantSubtotal = getMerchantSubtotal(merchantId);
        const quote = deliveryQuotesByMerchant[merchantId];

        orderDetails += `\n🏪 ${merchant?.name || 'Restaurant'}`;
        if (quote?.distanceKm !== undefined) {
          orderDetails += ` (${quote.distanceKm.toFixed(2)} km)`;
        }
        orderDetails += `:\n`;

        items.forEach(item => {
          let itemLine = `  • ${item.name}`;
          if (item.selectedVariation) {
            itemLine += ` (${item.selectedVariation.name})`;
          }
          if (item.selectedVariations && Object.keys(item.selectedVariations).length > 0) {
            itemLine += ` [${Object.entries(item.selectedVariations)
              .map(([groupName, variation]) => `${groupName}: ${variation.name}`)
              .join(', ')}]`;
          }
          if (item.selectedAddOns && item.selectedAddOns.length > 0) {
            itemLine += ` + ${item.selectedAddOns.map(addOn =>
              addOn.quantity && addOn.quantity > 1
                ? `${addOn.name} x${addOn.quantity}`
                : addOn.name
            ).join(', ')}`;
          }
          itemLine += ` x${item.quantity} - ₱${item.totalPrice * item.quantity}`;
          orderDetails += itemLine + '\n';
        });

        orderDetails += `  Subtotal: ₱${merchantSubtotal.toFixed(2)}\n`;
      }

      orderDetails += `\n💰 FOOD TOTAL: ₱${totalPrice.toFixed(2)}\n🚚 DELIVERY FEE: ₱${deliveryFeeTotal.toFixed(2)} (${deliveryMode === 'economy' ? 'PASABAY' : 'RUSH ORDER'}${merchantIds.length > 1 ? ' - based on furthest merchant' : ''})\n📍 DELIVERY ADDRESS: ${trimmedAddress}\n💵 GRAND TOTAL: ₱${grandTotal.toFixed(2)}\n\n💳 Payment: ${selectedPaymentMethod?.name || paymentMethod}\n\n${mergedNotes ? `📝 Notes: ${mergedNotes}\n\n` : ''}Please confirm this order to proceed. Thank you for choosing Row-Nel FooDelivery! 🥟`;

      // Copy to clipboard as backup
      try { await navigator.clipboard.writeText(orderDetails); } catch { /* ignore */ }

      clearCart();

      // Redirect to Messenger with prefilled order summary
      const encodedMessage = encodeURIComponent(orderDetails);
      const messengerUrl = `https://www.messenger.com/t/RowNelFooDelivery?text=${encodedMessage}`;
      window.location.replace(messengerUrl);
    } catch (err: any) {
      console.error('Order submission failed:', err);
      setOrderError(err?.message || 'Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasUndeliverableMerchant = merchantIds.some((merchantId) => !deliveryQuotesByMerchant[merchantId]?.deliverable);
  const isDetailsValid = trimmedCustomerName && trimmedContactNumber && isAddressValid;
  const canPlaceOrder = Boolean(isDetailsValid) && !hasUndeliverableMerchant && !hasMinOrderIssue && !hasClosedMerchant;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center mb-8">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 hover:text-black transition-colors duration-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Cart</span>
        </button>
        <h1 className="text-3xl font-noto font-semibold text-black ml-8">Delivery Details</h1>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Order Summary */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-2xl font-noto font-medium text-black mb-6">Order Summary</h2>
          
          <div className="space-y-6 mb-6">
            {Object.entries(itemsByMerchant).map(([merchantId, items]) => {
              const merchant = merchants.find(m => m.id === merchantId);
              const subtotal = getMerchantSubtotal(merchantId);
              
              return (
                <div key={merchantId} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Merchant Header */}
                  <div className="bg-gradient-to-r from-green-50 to-green-100 px-4 py-3 border-b border-green-200">
                    <div className="flex items-center space-x-2">
                      <Store className="h-4 w-4 text-green-600" />
                      <h3 className="font-semibold text-gray-900">{merchant?.name || 'Restaurant'}</h3>
                    </div>
                  </div>
                  
                  {/* Items */}
                  <div className="p-4 space-y-3">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2">
                        <div className="flex-1">
                          <h4 className="font-medium text-black text-sm">{item.name}</h4>
                          {item.selectedVariation && (
                            <p className="text-xs text-gray-600">Size: {item.selectedVariation.name}</p>
                          )}
                          {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                            <p className="text-xs text-gray-600">
                              Add-ons: {item.selectedAddOns.map(addOn => addOn.name).join(', ')}
                            </p>
                          )}
                          <p className="text-xs text-gray-600">₱{item.totalPrice} x {item.quantity}</p>
                        </div>
                        <span className="font-semibold text-black text-sm">₱{item.totalPrice * item.quantity}</span>
                      </div>
                    ))}
                    
                    {/* Merchant Subtotal */}
                    <div className="border-t border-gray-200 pt-3 mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-600 font-medium">Distance:</span>
                        <span className="text-sm text-gray-700">
                          {deliveryQuotesByMerchant[merchantId]?.distanceKm !== undefined
                            ? `${deliveryQuotesByMerchant[merchantId].distanceKm?.toFixed(2)} km`
                            : 'Not available'}
                        </span>
                      </div>
                      {!deliveryQuotesByMerchant[merchantId]?.deliverable && (
                        <p className="text-xs text-red-600 mb-1">
                          {deliveryQuotesByMerchant[merchantId]?.reason}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 font-medium">Subtotal:</span>
                        <span className="font-semibold text-black">₱{subtotal.toFixed(2)}</span>
                      </div>
                      {merchantValidation[merchantId] && !merchantValidation[merchantId].minOrder.met && (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                          <p className="text-xs text-amber-800">
                            Add ₱{merchantValidation[merchantId].minOrder.remaining.toFixed(2)} more (min. ₱{merchantValidation[merchantId].minOrder.minimum.toFixed(2)})
                          </p>
                        </div>
                      )}
                      {merchantValidation[merchantId] && !merchantValidation[merchantId].openStatus.isOpen && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                          <Clock className="h-4 w-4 text-red-600 flex-shrink-0" />
                          <p className="text-xs text-red-700">
                            Currently closed. {merchantValidation[merchantId].openStatus.nextOpenTime}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="border-t border-red-200 pt-4 space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span>Food subtotal:</span>
              <span>₱{totalPrice.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span>
                Delivery fee
                {merchantIds.length > 1 && primaryDeliveryMerchantId && (
                  <span className="text-xs text-gray-500 ml-1">
                    (based on furthest merchant)
                  </span>
                )}
                :
              </span>
              <span>₱{deliveryFeeTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-2xl font-noto font-semibold text-black">
              <span>Grand total:</span>
              <span>₱{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Customer Details Form */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-2xl font-noto font-medium text-black mb-6">Delivery Information</h2>
          
          <form className="space-y-6">
            {/* Customer Information */}
            <div>
              <label className="block text-sm font-medium text-black mb-2">Full Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-4 py-3 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
                placeholder="Enter your full name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black mb-2">Contact Number *</label>
              <input
                type="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className="w-full px-4 py-3 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
                placeholder="09XX XXX XXXX"
                required
              />
            </div>

            {/* Delivery Address */}
            <AddressAutocompleteInput
              label="Delivery Address"
              required
              value={address}
              onChange={setAddress}
              onSelect={handleAddressSelected}
              onClearSelection={clearAddressSelection}
              placeholder="Enter your complete delivery address"
              countryCodes={['ph']}
            />
            {trimmedAddress && !isAddressValid && (
              <p className="text-xs text-red-600 -mt-4">
                Select a suggested address so checkout can calculate delivery and proceed.
              </p>
            )}
            <MapLocationPicker
              latitude={deliveryLatitude}
              longitude={deliveryLongitude}
              onLocationSelect={(lat, lng, address, placeId) => {
                setDeliveryLatitude(lat);
                setDeliveryLongitude(lng);
                setDeliveryOsmPlaceId(placeId);
                setAddress(address);
              }}
              showSearch={false}
              showGpsButton
              height="250px"
              zoom={16}
            />

            {hasEconomyOption && deliveryLatitude !== null && deliveryLongitude !== null && (
              <div>
                <label className="block text-sm font-medium text-black mb-3">Delivery Option</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('priority')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                      deliveryMode === 'priority'
                        ? 'border-red-600 bg-red-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">RUSH ORDER</span>
                      <span className="font-bold text-red-600 text-sm">₱{priorityFeeTotal.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-500">30mins to 45mins waiting</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('economy')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                      deliveryMode === 'economy'
                        ? 'border-red-600 bg-red-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">PASABAY</span>
                      <span className="font-bold text-red-600 text-sm">₱{economyFeeTotal.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-500">45mins to 120mins waiting time</p>
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-black mb-2">Landmark</label>
              <input
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                className="w-full px-4 py-3 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
                placeholder="e.g., Near McDonald's, Beside 7-Eleven, In front of school"
              />
            </div>

            {/* Payment Method Selection */}
            <div>
              <label className="block text-sm font-medium text-black mb-3">Payment Method *</label>
              <div className="grid grid-cols-1 gap-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 flex items-center space-x-3 ${
                      paymentMethod === method.id
                        ? 'border-red-600 bg-red-600 text-white'
                        : 'border-red-300 bg-white text-gray-700 hover:border-red-400'
                    }`}
                  >
                    <span className="text-2xl">💳</span>
                    <span className="font-medium">{method.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Details with QR Code */}
            {selectedPaymentMethod && (
              <div className="bg-red-50 rounded-lg p-4">
                <h3 className="font-medium text-black mb-3">Payment Details</h3>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-gray-600 mb-1">{selectedPaymentMethod.name}</p>
                    <p className="font-mono text-black font-medium">{selectedPaymentMethod.account_number}</p>
                    <p className="text-sm text-gray-600 mb-3">Account Name: {selectedPaymentMethod.account_name}</p>
                    <p className="text-xl font-semibold text-black">Amount: ₱{grandTotal.toFixed(2)}</p>
                  </div>
                  <div className="flex-shrink-0">
                    <img 
                      src={selectedPaymentMethod.qr_code_url} 
                      alt={`${selectedPaymentMethod.name} QR Code`}
                      className="w-32 h-32 rounded-lg border-2 border-red-300 shadow-sm"
                      onError={(e) => {
                        e.currentTarget.src = 'https://images.pexels.com/photos/8867482/pexels-photo-8867482.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop';
                      }}
                    />
                    <p className="text-xs text-gray-500 text-center mt-2">Scan to pay</p>
                  </div>
                </div>
              </div>
            )}

            {/* Special Notes */}
            <div>
              <label className="block text-sm font-medium text-black mb-2">Special Instructions</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
                placeholder="Any special requests or notes..."
                rows={3}
              />
            </div>

            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={!canPlaceOrder || submitting}
              className={`w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 transform ${
                canPlaceOrder && !submitting
                  ? 'bg-red-600 text-white hover:bg-red-700 hover:scale-[1.02]'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {submitting ? 'Submitting Order...' : 'Submit Order'}
            </button>

            {orderError && (
              <p className="text-red-500 text-sm mt-2 text-center">{orderError}</p>
            )}

            {!canPlaceOrder && !submitting && (
              <p className="text-xs text-red-600 text-center mt-2">
                {hasUndeliverableMerchant && 'Some merchants are outside delivery coverage. '}
                {hasMinOrderIssue && 'Some merchants have not met minimum order. '}
                {hasClosedMerchant && 'Some merchants are currently closed. '}
                {!isDetailsValid && 'Please fill in all required fields.'}
              </p>
            )}

            <p className="text-xs text-gray-500 text-center mt-3">
              Your order will be saved and you'll be redirected to Facebook Messenger to confirm. Please attach your payment receipt screenshot.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Checkout;

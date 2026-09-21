import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Store, Clock } from 'lucide-react';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { useCartContext } from '../contexts/CartContext';
import { useMerchant } from '../contexts/MerchantContext';
import { useUserLocation } from '../contexts/LocationContext';
import { createOrder } from '../hooks/useOrdersData';
import { resolveDeliveryMode } from '../lib/deliveryMode';
import { getMinOrderStatus, isMerchantOpen } from '../lib/timeUtils';
import { requestNotificationPermission } from '../lib/notificationUtils';
import { addOrderToHistory } from '../lib/orderHistory';
import {
  isValidPhMobile,
  readCustomerContact,
  readFulfilmentPreference,
  saveCustomerContact,
  saveFulfilmentPreference,
} from '../lib/customerPrefs';
import {
  basketSupportsEconomy,
  pickPrimaryDeliveryMerchant,
  quoteAllMerchants,
  totalFeeForMode,
  type DeliveryMode,
} from '../lib/checkoutQuotes';
import DeliveryAddressSheet, { type DeliveryAddress } from './checkout/DeliveryAddressSheet';
import { AddressCard, Card, DeliveryModePicker, FulfilmentToggle, PaymentPicker, inputClass } from './checkout/CheckoutSections';
import { formatPeso } from './ui';

const IP_LOOKUP_TIMEOUT_MS = 3000;

async function lookupClientIp(): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT_MS);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timer);
    const data = (await res.json()) as { ip?: string };
    return typeof data.ip === 'string' ? data.ip : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Mobile-first checkout: delivery or pick-up, address prefilled from the
 * shopper's saved location, contact details remembered on the device,
 * Rush/Pasabay choice, payment instructions, and a sticky place-order bar.
 */
const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const { paymentMethods: allPaymentMethods } = usePaymentMethods();
  const { cartItems, getTotalPrice, clearCart } = useCartContext();
  const { merchants } = useMerchant();
  const { userLocation, locationDisplayName } = useUserLocation();

  const savedContact = useMemo(readCustomerContact, []);
  const savedFulfilment = useMemo(readFulfilmentPreference, []);

  const [serviceType, setServiceType] = useState<'delivery' | 'pickup'>(savedFulfilment.serviceType);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(savedFulfilment.deliveryMode);
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddress | null>(() =>
    userLocation && locationDisplayName
      ? { address: locationDisplayName, latitude: userLocation.latitude, longitude: userLocation.longitude }
      : null
  );
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [customerName, setCustomerName] = useState(savedContact?.name ?? '');
  const [contactNumber, setContactNumber] = useState(savedContact?.contactNumber ?? '');
  const [landmark, setLandmark] = useState(savedContact?.landmark ?? '');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    if (cartItems.length === 0 && !submitting) navigate('/cart', { replace: true });
  }, [cartItems.length, submitting, navigate]);

  // Adopt the saved location once it resolves (e.g. arriving straight at /checkout).
  useEffect(() => {
    if (!deliveryAddress && userLocation && locationDisplayName) {
      setDeliveryAddress({ address: locationDisplayName, latitude: userLocation.latitude, longitude: userLocation.longitude });
    }
  }, [deliveryAddress, userLocation, locationDisplayName]);

  const itemsByMerchant = useMemo(() => {
    const grouped: Record<string, typeof cartItems> = {};
    cartItems.forEach((item) => {
      grouped[item.merchantId] = [...(grouped[item.merchantId] ?? []), item];
    });
    return grouped;
  }, [cartItems]);
  const merchantIds = useMemo(() => Object.keys(itemsByMerchant), [itemsByMerchant]);

  const isDelivery = serviceType === 'delivery';
  const dropoff = useMemo(
    () => (isDelivery && deliveryAddress ? { latitude: deliveryAddress.latitude, longitude: deliveryAddress.longitude } : null),
    [isDelivery, deliveryAddress]
  );

  const hasEconomy = useMemo(() => basketSupportsEconomy(merchants, merchantIds), [merchants, merchantIds]);
  useEffect(() => {
    if (!hasEconomy && deliveryMode === 'economy') setDeliveryMode('priority');
  }, [hasEconomy, deliveryMode]);

  const priorityFee = useMemo(() => totalFeeForMode(merchants, merchantIds, dropoff, 'priority'), [merchants, merchantIds, dropoff]);
  const economyFee = useMemo(() => totalFeeForMode(merchants, merchantIds, dropoff, 'economy'), [merchants, merchantIds, dropoff]);
  const quotes = useMemo(() => quoteAllMerchants(merchants, merchantIds, dropoff, deliveryMode), [merchants, merchantIds, dropoff, deliveryMode]);
  const primaryMerchantId = useMemo(() => pickPrimaryDeliveryMerchant(quotes), [quotes]);
  const deliveryFee = isDelivery && primaryMerchantId ? quotes[primaryMerchantId].deliveryFee ?? 0 : 0;

  const subtotal = getTotalPrice();
  const grandTotal = subtotal + deliveryFee;

  const paymentMethods = useMemo(
    () => allPaymentMethods.filter((m) => m.merchant_id === null || (merchantIds.length === 1 && m.merchant_id === merchantIds[0])),
    [allPaymentMethods, merchantIds]
  );
  useEffect(() => {
    if (paymentMethods.length > 0 && !paymentMethods.some((m) => m.id === paymentMethod)) setPaymentMethod(paymentMethods[0].id);
  }, [paymentMethods, paymentMethod]);

  const merchantSubtotal = (merchantId: string) => (itemsByMerchant[merchantId] ?? []).reduce((sum, i) => sum + i.totalPrice * i.quantity, 0);

  const merchantIssues = useMemo(
    () =>
      merchantIds.map((merchantId) => {
        const merchant = merchants.find((m) => m.id === merchantId);
        const minOrder = getMinOrderStatus(merchant?.minimumOrder ?? 0, merchantSubtotal(merchantId));
        const openStatus = isMerchantOpen(merchant?.openingHours);
        const quote = quotes[merchantId];
        return { merchantId, name: merchant?.name ?? 'Store', minOrder, openStatus, quote };
      }),
    // merchantSubtotal is derived from itemsByMerchant
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [merchantIds, merchants, itemsByMerchant, quotes]
  );

  const blockers: string[] = [];
  if (merchantIssues.some((m) => !m.openStatus.isOpen)) blockers.push('A store in your basket is closed right now.');
  if (merchantIssues.some((m) => !m.minOrder.met)) blockers.push('Minimum order not met for a store in your basket.');
  if (isDelivery && !deliveryAddress) blockers.push('Add your delivery address.');
  if (isDelivery && deliveryAddress && merchantIssues.some((m) => !m.quote.deliverable)) blockers.push('Your address is outside a store’s delivery area.');
  if (paymentMethods.length === 0) blockers.push('No payment method available.');

  const trimmedName = customerName.trim();
  const trimmedPhone = contactNumber.trim();
  const nameError = trimmedName.length < 2 ? 'Enter your name.' : null;
  const phoneError = !trimmedPhone ? 'Enter your mobile number.' : !isValidPhMobile(trimmedPhone) ? 'Use a valid PH mobile number (09XX XXX XXXX).' : null;

  const canPlaceOrder = blockers.length === 0 && !nameError && !phoneError && !submitting;

  const handlePlaceOrder = async () => {
    setShowValidation(true);
    if (!canPlaceOrder) {
      if (isDelivery && !deliveryAddress) setIsAddressOpen(true);
      return;
    }
    setSubmitting(true);
    setOrderError(null);

    try {
      const ipAddress = await lookupClientIp();
      const mergedNotes = [notes.trim(), landmark.trim() ? `Landmark: ${landmark.trim()}` : '']
        .filter(Boolean)
        .join(' | ');
      const orderIds: string[] = [];

      for (const merchantId of merchantIds) {
        const items = itemsByMerchant[merchantId];
        const merchant = merchants.find((m) => m.id === merchantId);
        const quote = quotes[merchantId];
        const merchantFee = isDelivery && merchantId === primaryMerchantId ? deliveryFee : 0;
        const orderTotal = merchantSubtotal(merchantId) + merchantFee;

        const orderId = await createOrder({
          merchantId,
          customerName: trimmedName,
          contactNumber: trimmedPhone,
          serviceType,
          address: isDelivery ? deliveryAddress?.address : undefined,
          deliveryLatitude: isDelivery ? deliveryAddress?.latitude : undefined,
          deliveryLongitude: isDelivery ? deliveryAddress?.longitude : undefined,
          merchantLatitude: merchant?.latitude ?? undefined,
          merchantLongitude: merchant?.longitude ?? undefined,
          distanceKm: isDelivery ? quote?.distanceKm : undefined,
          deliveryFee: merchantFee,
          deliveryMode: isDelivery ? resolveDeliveryMode(hasEconomy, deliveryMode) : 'priority',
          paymentMethod,
          referenceNumber: reference.trim() || undefined,
          notes: mergedNotes || undefined,
          total: orderTotal,
          ipAddress,
          items: items.map((item) => ({
            itemId: item.menuItemId ?? item.id,
            name: item.name,
            variation: item.selectedVariation
              ? { name: item.selectedVariation.name, price: item.selectedVariation.price }
              : item.selectedVariations && Object.keys(item.selectedVariations).length > 0
                ? Object.fromEntries(Object.entries(item.selectedVariations).map(([group, v]) => [group, { name: v.name, price: v.price }]))
                : undefined,
            addOns: item.selectedAddOns && item.selectedAddOns.length > 0
              ? item.selectedAddOns.map((a) => ({ name: a.name, price: a.price, quantity: a.quantity ?? 1 }))
              : undefined,
            unitPrice: item.totalPrice,
            quantity: item.quantity,
            subtotal: item.totalPrice * item.quantity,
          })),
          stockAdjustments: items.map((item) => ({ id: item.menuItemId ?? item.id, quantity: item.quantity })),
        });

        addOrderToHistory({
          orderId,
          merchantId,
          merchantName: merchant?.name ?? 'Store',
          customerName: trimmedName,
          contactNumber: trimmedPhone,
          serviceType,
          total: orderTotal,
          deliveryFee: merchantFee,
          address: isDelivery ? deliveryAddress?.address : undefined,
          paymentMethod,
          placedAt: Date.now(),
          items: items.map((item) => ({ name: item.name, quantity: item.quantity, subtotal: item.totalPrice * item.quantity })),
        });
        orderIds.push(orderId);
      }

      saveCustomerContact({ name: trimmedName, contactNumber: trimmedPhone, landmark: landmark.trim() || undefined });
      saveFulfilmentPreference({ serviceType, deliveryMode });
      clearCart();
      // Fired from the click handler so browsers that need a gesture accept it.
      void requestNotificationPermission();
      navigate(`/track/${orderIds[0]}`, { replace: true, state: { justPlaced: true, orderIds } });
    } catch (err) {
      console.error('Order submission failed:', err);
      setOrderError(err instanceof Error ? err.message : 'We could not place your order. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-40 md:pb-32">
      <div className="sticky top-0 z-30 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-3">
          <button type="button" onClick={() => navigate('/cart')} aria-label="Back to basket" className="rounded-full p-2 text-gray-700 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Checkout</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        <Card>
          <FulfilmentToggle
            value={serviceType}
            onChange={(value) => {
              setServiceType(value);
              saveFulfilmentPreference({ serviceType: value });
            }}
          />
          {isDelivery ? (
            <div className="mt-3 space-y-3">
              <AddressCard
                address={deliveryAddress?.address ?? null}
                onEdit={() => setIsAddressOpen(true)}
                error={showValidation && !deliveryAddress ? 'Required for delivery' : null}
              />
              <input type="text" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Landmark or delivery note for the rider (optional)" className={inputClass} />
              <DeliveryModePicker
                value={deliveryMode}
                priorityFee={priorityFee}
                economyFee={economyFee}
                hasEconomy={hasEconomy}
                onChange={(mode) => {
                  setDeliveryMode(mode);
                  saveFulfilmentPreference({ deliveryMode: mode });
                }}
              />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {merchantIssues.map((m) => {
                const merchant = merchants.find((x) => x.id === m.merchantId);
                return (
                  <div key={m.merchantId} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <Store className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-700" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{m.name}</p>
                      <p className="text-xs text-gray-600">{merchant?.formattedAddress || merchant?.address || 'Pick up at the store counter.'}</p>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-gray-500">No delivery fee. We’ll notify you when your order is ready for pick-up.</p>
            </div>
          )}
        </Card>

        <Card title="Your details">
          <div className="space-y-2">
            <div>
              <input type="text" autoComplete="name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" className={inputClass} />
              {showValidation && nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
            </div>
            <div>
              <input type="tel" autoComplete="tel" inputMode="tel" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="Mobile number (09XX XXX XXXX)" className={inputClass} />
              {showValidation && phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
            </div>
          </div>
        </Card>

        <Card title="Payment">
          <PaymentPicker methods={paymentMethods} value={paymentMethod} amount={grandTotal} reference={reference} onChange={setPaymentMethod} onReferenceChange={setReference} />
        </Card>

        <Card title="Order summary">
          <div className="space-y-4">
            {merchantIssues.map((m) => (
              <div key={m.merchantId}>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Store className="h-3.5 w-3.5" /> {m.name}
                </div>
                <div className="space-y-1.5">
                  {itemsByMerchant[m.merchantId].map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 text-gray-800">
                        <span className="font-medium">{item.quantity}× {item.name}</span>
                        {item.selectedVariation && <span className="block text-xs text-gray-500">{item.selectedVariation.name}</span>}
                        {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
                          <span className="block text-xs text-gray-500">{Object.values(item.selectedVariations).map((v) => v.name).join(', ')}</span>
                        )}
                        {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                          <span className="block text-xs text-gray-500">+ {item.selectedAddOns.map((a) => a.name).join(', ')}</span>
                        )}
                      </span>
                      <span className="whitespace-nowrap font-semibold text-gray-900">{formatPeso(item.totalPrice * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                {!m.openStatus.isOpen && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                    <Clock className="h-3.5 w-3.5" /> Closed — {m.openStatus.nextOpenTime}
                  </p>
                )}
                {!m.minOrder.met && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" /> Add {formatPeso(m.minOrder.remaining)} more to reach the {formatPeso(m.minOrder.minimum)} minimum.
                  </p>
                )}
                {isDelivery && deliveryAddress && !m.quote.deliverable && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> {m.quote.reason}
                  </p>
                )}
              </div>
            ))}
            <div className="space-y-1.5 border-t border-dashed border-gray-200 pt-3 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatPeso(subtotal)}</span></div>
              {isDelivery && (
                <div className="flex justify-between text-gray-600">
                  <span>Delivery fee {merchantIds.length > 1 && <span className="text-xs text-gray-400">(one fee, furthest store)</span>}</span>
                  <span>{formatPeso(deliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900"><span>Total</span><span>{formatPeso(grandTotal)}</span></div>
            </div>
          </div>
        </Card>

        <Card title="Notes for the store">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. no onions, extra sauce (optional)" className={`${inputClass} resize-none`} />
        </Card>
      </div>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-[60px] z-40 border-t border-gray-100 bg-white px-4 py-3 safe-bottom md:bottom-0">
        <div className="mx-auto max-w-2xl space-y-2">
          {orderError && (
            <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700"><AlertTriangle className="h-4 w-4 flex-shrink-0" /> {orderError}</p>
          )}
          {showValidation && blockers.length > 0 && <p className="text-xs text-red-600">{blockers[0]}</p>}
          <button
            type="button"
            onClick={handlePlaceOrder}
            disabled={submitting}
            className={`flex w-full items-center justify-between rounded-2xl px-5 py-3.5 text-white shadow-lg transition-all active:scale-[0.99] ${
              canPlaceOrder ? 'bg-brand-600 hover:bg-brand-700' : 'bg-gray-400'
            }`}
          >
            <span className="text-sm font-semibold">{submitting ? 'Placing order…' : isDelivery ? 'Place delivery order' : 'Place pick-up order'}</span>
            <span className="text-base font-bold">{formatPeso(grandTotal)}</span>
          </button>
        </div>
      </div>

      <DeliveryAddressSheet
        open={isAddressOpen}
        initial={deliveryAddress}
        onClose={() => setIsAddressOpen(false)}
        onSave={(address) => {
          setDeliveryAddress(address);
          setIsAddressOpen(false);
        }}
      />
    </main>
  );
};

export default Checkout;

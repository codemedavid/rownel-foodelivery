import React, { useState, useMemo } from 'react';
import { ArrowLeft, Store } from 'lucide-react';
import { useOrders } from '../hooks/useOrders';
import { useCartContext } from '../contexts/CartContext';
import { useMerchants } from '../hooks/useMerchants';

interface CheckoutProps {
  onBack: () => void;
}

const Checkout: React.FC<CheckoutProps> = ({ onBack }) => {
  const { createOrder, creating, error } = useOrders();
  const { cartItems, getTotalPrice, clearCart } = useCartContext();
  const { merchants } = useMerchants();
  const totalPrice = getTotalPrice();
  
  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [uiNotice, setUiNotice] = useState<string | null>(null);

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

  // Calculate subtotal for a merchant
  const getMerchantSubtotal = (merchantId: string) => {
    const items = itemsByMerchant[merchantId] || [];
    return items.reduce((sum, item) => sum + (item.totalPrice * item.quantity), 0);
  };

  const copyOrderDetails = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const handlePlaceOrder = async () => {
    // Persist orders to database - one order per merchant
    try {
      const mergedNotes = landmark ? `${notes ? notes + ' | ' : ''}Landmark: ${landmark}` : notes;
      
      // Create orders for each merchant
      for (const [merchantId, items] of Object.entries(itemsByMerchant)) {
        const merchantSubtotal = getMerchantSubtotal(merchantId);
        
        await createOrder({
          merchantId,
          customerName,
          contactNumber,
          serviceType: 'delivery',
          address,
          paymentMethod: 'cash',
          notes: mergedNotes,
          total: merchantSubtotal,
          items: items,
        });
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      if (/insufficient stock/i.test(raw)) {
        setUiNotice(raw);
        return;
      }
      if (/rate limit/i.test(raw)) {
        setUiNotice('Too many orders: Please wait 1 minute before placing another order.');
      } else if (/missing identifiers/i.test(raw)) {
        setUiNotice('Too many orders: Please wait 1 minute before placing another order.');
      } else {
        setUiNotice('Too many orders: Please wait 1 minute before placing another order.');
      }
      return;
    }

    // Build order details with merchant grouping
    let orderDetails = `
🛒 Row-Nel FooDelivery ORDER

👤 Customer: ${customerName}
📞 Contact: ${contactNumber}
📍 Service: Delivery
🏠 Address: ${address}${landmark ? `\n🗺️ Landmark: ${landmark}` : ''}

📋 ORDER DETAILS:
`;

    // Add items grouped by merchant
    for (const [merchantId, items] of Object.entries(itemsByMerchant)) {
      const merchant = merchants.find(m => m.id === merchantId);
      const merchantSubtotal = getMerchantSubtotal(merchantId);
      
      orderDetails += `\n🏪 ${merchant?.name || 'Restaurant'}:\n`;
      
      items.forEach(item => {
        let itemDetails = `  • ${item.name}`;
        if (item.selectedVariation) {
          itemDetails += ` (${item.selectedVariation.name})`;
        }
        if (item.selectedAddOns && item.selectedAddOns.length > 0) {
          itemDetails += ` + ${item.selectedAddOns.map(addOn => 
            addOn.quantity && addOn.quantity > 1 
              ? `${addOn.name} x${addOn.quantity}`
              : addOn.name
          ).join(', ')}`;
        }
        itemDetails += ` x${item.quantity} - ₱${item.totalPrice * item.quantity}`;
        orderDetails += itemDetails + '\n';
      });
      
      orderDetails += `  Subtotal: ₱${merchantSubtotal.toFixed(2)}\n`;
    }

    orderDetails += `
💰 TOTAL: ₱${totalPrice.toFixed(2)}

💳 Payment: Cash on Delivery

${notes ? `📝 Notes: ${notes}` : ''}

Please confirm this order to proceed. Thank you for choosing ClickEats! 🥟
    `.trim();

    const pageId = '61579693577478';
    const encodedMessage = encodeURIComponent(orderDetails);
    const webLink = `https://m.me/${pageId}?text=${encodedMessage}`;

    // Best effort: copy order details so user can paste in Messenger if text cannot be prefilled
    await copyOrderDetails(orderDetails);

    // Clear cart after successful order
    clearCart();

    // Use window.location for both mobile and desktop to avoid popup blocker
    // This will navigate away from the site but ensures the link always works
    window.location.href = webLink;
  };

  const isDetailsValid = customerName && contactNumber && address;

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

      {uiNotice && (
        <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-800 p-4 text-sm">
          {uiNotice}
        </div>
      )}

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
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 font-medium">Subtotal:</span>
                        <span className="font-semibold text-black">₱{subtotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="border-t border-red-200 pt-4">
            <div className="flex items-center justify-between text-2xl font-noto font-semibold text-black">
              <span>Total:</span>
              <span>₱{totalPrice.toFixed(2)}</span>
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
            <div>
              <label className="block text-sm font-medium text-black mb-2">Delivery Address *</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-4 py-3 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
                placeholder="Enter your complete delivery address"
                rows={3}
                required
              />
            </div>
            
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
              onClick={handlePlaceOrder}
              disabled={!isDetailsValid || creating}
              className={`w-full py-4 rounded-xl font-medium text-lg transition-all duration-200 transform ${
                isDetailsValid && !creating
                  ? 'bg-red-600 text-white hover:bg-red-700 hover:scale-[1.02]'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {creating ? 'Placing Order...' : 'Place Order via Messenger'}
            </button>
            {error && !uiNotice && (
              <p className="text-sm text-red-600 text-center mt-2">{error}</p>
            )}
            
            <p className="text-xs text-gray-500 text-center mt-3">
              You'll be redirected to Facebook Messenger to confirm your order.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Checkout;

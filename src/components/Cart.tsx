import React, { useMemo } from 'react';
import { Trash2, Plus, Minus, ArrowLeft, Store, AlertTriangle, Clock } from 'lucide-react';
import { getMinOrderStatus, isMerchantOpen } from '../lib/timeUtils';
import { useCartContext } from '../contexts/CartContext';
import { useMerchants } from '../hooks/useMerchants';

interface CartProps {
  onContinueShopping: () => void;
  onCheckout: () => void;
}

const Cart: React.FC<CartProps> = ({
  onContinueShopping,
  onCheckout
}) => {
  const { cartItems, updateQuantity, removeFromCart, clearCart, getTotalPrice } = useCartContext();
  const { merchants } = useMerchants();

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

  const merchantStatuses = useMemo(() => {
    const statuses: Record<string, { minOrder: ReturnType<typeof getMinOrderStatus>; openStatus: ReturnType<typeof isMerchantOpen> }> = {};

    Object.keys(itemsByMerchant).forEach(merchantId => {
      const merchant = merchants.find(m => m.id === merchantId);
      const subtotal = getMerchantSubtotal(merchantId);
      statuses[merchantId] = {
        minOrder: getMinOrderStatus(merchant?.minimumOrder || 0, subtotal),
        openStatus: isMerchantOpen(merchant?.openingHours),
      };
    });

    return statuses;
  }, [itemsByMerchant, merchants]);

  const hasMinOrderIssue = Object.values(merchantStatuses).some(s => !s.minOrder.met);
  const hasClosedMerchant = Object.values(merchantStatuses).some(s => !s.openStatus.isOpen);
  const canCheckout = !hasMinOrderIssue && !hasClosedMerchant;

  if (cartItems.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center py-16">
          <div className="text-6xl mb-4">☕</div>
          <h2 className="text-2xl font-playfair font-medium text-black mb-2">Your cart is empty</h2>
          <p className="text-gray-600 mb-6">Add some delicious items to get started!</p>
          <button
            onClick={onContinueShopping}
            className="bg-red-600 text-white px-6 py-3 rounded-full hover:bg-red-700 transition-all duration-200"
          >
            Browse Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 gap-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onContinueShopping}
            className="flex items-center space-x-2 text-gray-600 hover:text-black transition-colors duration-200"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="hidden sm:inline">Continue Shopping</span>
            <span className="sm:hidden">Back</span>
          </button>
          <button
            onClick={clearCart}
            className="text-red-500 hover:text-red-600 transition-colors duration-200 text-sm font-medium"
          >
            Clear All
          </button>
        </div>
        <h1 className="text-2xl sm:text-3xl font-noto font-semibold text-black text-center sm:text-left">Your Cart</h1>
      </div>

      {/* Items grouped by merchant */}
      {Object.entries(itemsByMerchant).map(([merchantId, items]) => {
        const merchant = merchants.find(m => m.id === merchantId);
        const subtotal = getMerchantSubtotal(merchantId);
        
        return (
          <div key={merchantId} className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            {/* Merchant Header */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 px-4 sm:px-6 py-3 sm:py-4 border-b border-green-200">
              <div className="flex items-center space-x-3">
                <Store className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{merchant?.name || 'Unknown Restaurant'}</h3>
                  <p className="text-xs sm:text-sm text-gray-600">{items.length} item{items.length > 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            {/* Min order warning */}
            {merchantStatuses[merchantId] && !merchantStatuses[merchantId].minOrder.met && (
              <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  Add ₱{merchantStatuses[merchantId].minOrder.remaining.toFixed(2)} more to meet minimum order of ₱{merchantStatuses[merchantId].minOrder.minimum.toFixed(2)}
                </p>
              </div>
            )}

            {/* Closed merchant warning */}
            {merchantStatuses[merchantId] && !merchantStatuses[merchantId].openStatus.isOpen && (
              <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 px-4 sm:px-6 py-2.5">
                <Clock className="h-4 w-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">
                  {merchant?.name || 'This restaurant'} is currently closed.{' '}
                  {merchantStatuses[merchantId].openStatus.nextOpenTime}
                </p>
              </div>
            )}

            {/* Items for this merchant */}
            {items.map((item, index) => (
              <div key={item.id} className={`p-4 sm:p-6 ${index !== items.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Item Details */}
                  <div className="flex-1">
                    <h3 className="text-base sm:text-lg font-noto font-medium text-black mb-2 leading-tight">{item.name}</h3>
                    
                    <div className="space-y-1 mb-3">
                      {item.selectedVariation && (
                        <p className="text-xs sm:text-sm text-gray-500">
                          <span className="font-medium">Size:</span> {item.selectedVariation.name}
                        </p>
                      )}
                      {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
                        <p className="text-xs sm:text-sm text-gray-500">
                          <span className="font-medium">Options:</span>{' '}
                          {Object.entries(item.selectedVariations)
                            .map(([groupName, variation]) => `${groupName}: ${variation.name}`)
                            .join(', ')}
                        </p>
                      )}
                      {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                        <p className="text-xs sm:text-sm text-gray-500">
                          <span className="font-medium">Add-ons:</span> {item.selectedAddOns.map(addOn => 
                            addOn.quantity && addOn.quantity > 1 
                              ? `${addOn.name} x${addOn.quantity}`
                              : addOn.name
                          ).join(', ')}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-start sm:gap-4">
                      <span className="text-sm text-gray-600">₱{item.totalPrice} each</span>
                      <span className="text-lg sm:text-xl font-semibold text-black">
                        ₱{item.totalPrice * item.quantity}
                      </span>
                    </div>
                  </div>
                  
                  {/* Quantity Controls & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="flex items-center bg-yellow-100 rounded-lg px-3 py-2">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="p-1 hover:bg-yellow-200 rounded-full transition-colors duration-200"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="font-semibold text-black min-w-[36px] text-center mx-2">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="p-1 hover:bg-yellow-200 rounded-full transition-colors duration-200"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-all duration-200"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Merchant Subtotal */}
            <div className="bg-gray-50 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm sm:text-base text-gray-600 font-medium">
                  <span className="hidden sm:inline">Subtotal for {merchant?.name || 'this restaurant'}:</span>
                  <span className="sm:hidden">{merchant?.name || 'Subtotal'}:</span>
                </span>
                <span className="text-lg sm:text-xl font-semibold text-black">₱{subtotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Overall Total */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between text-xl sm:text-2xl font-noto font-semibold text-black mb-4 sm:mb-6">
          <span>Total:</span>
          <span>₱{getTotalPrice().toFixed(2)}</span>
        </div>
        
        <button
          onClick={onCheckout}
          disabled={!canCheckout}
          className={`w-full py-3 sm:py-4 rounded-xl transition-all duration-200 transform font-medium text-base sm:text-lg ${
            canCheckout
              ? 'bg-red-600 text-white hover:bg-red-700 hover:scale-[1.02]'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Proceed to Checkout
        </button>
        {!canCheckout && (
          <p className="text-xs text-red-600 text-center mt-2">
            {hasMinOrderIssue && 'Some merchants have not met minimum order requirements. '}
            {hasClosedMerchant && 'Some merchants are currently closed.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default Cart;

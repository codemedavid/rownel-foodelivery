import React, { useMemo } from 'react';
import { Trash2, Plus, Minus, ArrowLeft, Store } from 'lucide-react';
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
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onContinueShopping}
          className="flex items-center space-x-2 text-gray-600 hover:text-black transition-colors duration-200"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Continue Shopping</span>
        </button>
        <h1 className="text-3xl font-noto font-semibold text-black">Your Cart</h1>
        <button
          onClick={clearCart}
          className="text-red-500 hover:text-red-600 transition-colors duration-200"
        >
          Clear All
        </button>
      </div>

      {/* Items grouped by merchant */}
      {Object.entries(itemsByMerchant).map(([merchantId, items]) => {
        const merchant = merchants.find(m => m.id === merchantId);
        const subtotal = getMerchantSubtotal(merchantId);
        
        return (
          <div key={merchantId} className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            {/* Merchant Header */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
              <div className="flex items-center space-x-3">
                <Store className="h-5 w-5 text-green-600" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{merchant?.name || 'Unknown Restaurant'}</h3>
                  <p className="text-sm text-gray-600">{items.length} item{items.length > 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            {/* Items for this merchant */}
            {items.map((item, index) => (
              <div key={item.id} className={`p-6 ${index !== items.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-noto font-medium text-black mb-1">{item.name}</h3>
                    {item.selectedVariation && (
                      <p className="text-sm text-gray-500 mb-1">Size: {item.selectedVariation.name}</p>
                    )}
                    {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                      <p className="text-sm text-gray-500 mb-1">
                        Add-ons: {item.selectedAddOns.map(addOn => 
                          addOn.quantity && addOn.quantity > 1 
                            ? `${addOn.name} x${addOn.quantity}`
                            : addOn.name
                        ).join(', ')}
                      </p>
                    )}
                    <p className="text-lg font-semibold text-black">₱{item.totalPrice} each</p>
                  </div>
                  
                  <div className="flex items-center space-x-4 ml-4">
                    <div className="flex items-center space-x-3 bg-yellow-100 rounded-full p-1">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="p-2 hover:bg-yellow-200 rounded-full transition-colors duration-200"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="font-semibold text-black min-w-[32px] text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="p-2 hover:bg-yellow-200 rounded-full transition-colors duration-200"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-lg font-semibold text-black">₱{item.totalPrice * item.quantity}</p>
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
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 font-medium">Subtotal for {merchant?.name || 'this restaurant'}:</span>
                <span className="text-xl font-semibold text-black">₱{subtotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Overall Total */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between text-2xl font-noto font-semibold text-black mb-6">
          <span>Total:</span>
          <span>₱{getTotalPrice().toFixed(2)}</span>
        </div>
        
        <button
          onClick={onCheckout}
          className="w-full bg-red-600 text-white py-4 rounded-xl hover:bg-red-700 transition-all duration-200 transform hover:scale-[1.02] font-medium text-lg"
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
};

export default Cart;
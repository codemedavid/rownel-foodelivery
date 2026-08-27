import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Cart from './Cart';
import Checkout from './Checkout';

/** Standalone cart route for the bottom navigation (cart → checkout flow). */
const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<'cart' | 'checkout'>('cart');

  if (view === 'checkout') {
    return <Checkout onBack={() => setView('cart')} />;
  }

  return (
    <div className="pb-20 md:pb-0">
      <Cart
        onContinueShopping={() => navigate('/')}
        onCheckout={() => setView('checkout')}
      />
    </div>
  );
};

export default CartPage;

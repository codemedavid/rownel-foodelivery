import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Menu from './components/Menu';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import FloatingCartButton from './components/FloatingCartButton';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/AdminLogin';
import ProtectedRoute from './components/ProtectedRoute';
import MerchantsList from './components/MerchantsList';
import MenuItemDetailsPage from './components/MenuItemDetailsPage';
import { useMenu } from './hooks/useMenu';
import { AuthProvider } from './contexts/AuthContext';
import { MerchantProvider, useMerchant } from './contexts/MerchantContext';
import { CartProvider } from './contexts/CartContext';

function MerchantMenu() {
  const { selectedMerchant } = useMerchant();
  const { menuItems } = useMenu();
  const [currentView, setCurrentView] = React.useState<'menu' | 'cart' | 'checkout'>('menu');

  const handleViewChange = (view: 'menu' | 'cart' | 'checkout') => {
    setCurrentView(view);
  };

  // Filter menu items based on selected merchant
  const filteredMenuItems = menuItems
    .filter(item => selectedMerchant ? item.merchantId === selectedMerchant.id : true);

  if (!selectedMerchant) {
    return null;
  }

  return (
    <div className="min-h-screen bg-cream-50 font-inter">
      <Header 
        onCartClick={() => handleViewChange('cart')}
        onMenuClick={() => handleViewChange('menu')}
      />
      
      {currentView === 'menu' && (
        <Menu 
          menuItems={filteredMenuItems}
        />
      )}
      
      {currentView === 'cart' && (
        <Cart 
          onContinueShopping={() => handleViewChange('menu')}
          onCheckout={() => handleViewChange('checkout')}
        />
      )}
      
      {currentView === 'checkout' && (
        <Checkout 
          onBack={() => handleViewChange('cart')}
        />
      )}
      
      {currentView === 'menu' && (
        <FloatingCartButton 
          onCartClick={() => handleViewChange('cart')}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <MerchantProvider>
          <Router>
            <Routes>
              <Route path="/" element={<MerchantsList />} />
              <Route path="/merchant/:merchantId" element={<MerchantMenu />} />
              <Route path="/merchant/:merchantId/item/:itemId" element={<MenuItemDetailsPage />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute>
                    <AdminDashboard />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </Router>
        </MerchantProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;

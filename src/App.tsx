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
import StaffLogin from './components/StaffLogin';
import StaffOrdersPanel from './components/StaffOrdersPanel';
import ProtectedStaffRoute from './components/ProtectedStaffRoute';
import RiderLogin from './components/RiderLogin';
import RiderSignup from './components/RiderSignup';
import RiderDashboard from './components/RiderDashboard';
import RiderOrderDetail from './components/RiderOrderDetail';
import RiderProfilePage from './components/RiderProfilePage';
import ProtectedRiderRoute from './components/ProtectedRiderRoute';
import ErrorBoundary from './components/ErrorBoundary';
import MerchantsList from './components/MerchantsList';
import MenuItemDetailsPage from './components/MenuItemDetailsPage';
import OrderTracking from './components/OrderTracking';
import { AuthProvider } from './contexts/AuthContext';
import { MerchantProvider, useMerchant } from './contexts/MerchantContext';
import { CartProvider } from './contexts/CartContext';
import { MenuProvider, useMenuContext } from './contexts/MenuContext';

function MerchantMenu() {
  const { selectedMerchant } = useMerchant();
  const { menuItems } = useMenuContext();
  const [currentView, setCurrentView] = React.useState<'menu' | 'cart' | 'checkout'>('menu');

  const handleViewChange = (view: 'menu' | 'cart' | 'checkout') => {
    setCurrentView(view);
  };

  // Menu items are already filtered by merchant in the context
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
          <MenuProvider>
            <Router>
              <ErrorBoundary>
              <Routes>
                <Route path="/" element={<MerchantsList />} />
                <Route path="/merchant/:merchantId" element={<MerchantMenu />} />
                <Route path="/merchant/:merchantId/item/:itemId" element={<MenuItemDetailsPage />} />
                <Route path="/track" element={<OrderTracking />} />
                <Route path="/track/:orderId" element={<OrderTracking />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requireAdmin={true}>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route path="/staff/login" element={<StaffLogin />} />
                <Route
                  path="/staff/orders"
                  element={
                    <ProtectedStaffRoute>
                      <StaffOrdersPanel />
                    </ProtectedStaffRoute>
                  }
                />
                <Route path="/rider/login" element={<RiderLogin />} />
                <Route path="/rider/signup" element={<RiderSignup />} />
                <Route
                  path="/rider/dashboard"
                  element={
                    <ProtectedRiderRoute>
                      <RiderDashboard />
                    </ProtectedRiderRoute>
                  }
                />
                <Route
                  path="/rider/order/:orderId"
                  element={
                    <ProtectedRiderRoute>
                      <RiderOrderDetail />
                    </ProtectedRiderRoute>
                  }
                />
                <Route
                  path="/rider/profile"
                  element={
                    <ProtectedRiderRoute>
                      <RiderProfilePage />
                    </ProtectedRiderRoute>
                  }
                />
              </Routes>
              </ErrorBoundary>
            </Router>
          </MenuProvider>
        </MerchantProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;

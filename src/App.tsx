import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './components/home/HomePage';
import MerchantPage from './components/merchant/MerchantPage';
import Checkout from './components/Checkout';
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
import MenuItemDetailsPage from './components/MenuItemDetailsPage';
import OrderTracking from './components/OrderTracking';
import BottomNav from './components/BottomNav';
import CustomerNotificationsWatcher from './components/CustomerNotificationsWatcher';
import ToastHost from './components/ToastHost';
import CartPage from './components/CartPage';
import ProfilePage from './components/ProfilePage';
import PrivacyPolicy from './components/legal/PrivacyPolicy';
import DeleteAccount from './components/legal/DeleteAccount';
import DownloadPage from './components/download/DownloadPage';
import { AuthProvider } from './contexts/AuthContext';
import { MerchantProvider } from './contexts/MerchantContext';
import { CartProvider } from './contexts/CartContext';
import { MenuProvider } from './contexts/MenuContext';
import { LocationProvider } from './contexts/LocationContext';

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <LocationProvider>
          <MerchantProvider>
            <MenuProvider>
              <Router>
                <ErrorBoundary>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/merchant/:merchantId" element={<MerchantPage />} />
                    <Route path="/merchant/:merchantId/item/:itemId" element={<MenuItemDetailsPage />} />
                    <Route path="/track" element={<OrderTracking />} />
                    <Route path="/track/:orderId" element={<OrderTracking />} />
                    <Route path="/orders" element={<OrderTracking />} />
                    <Route path="/cart" element={<CartPage />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/delete-account" element={<DeleteAccount />} />
                    <Route path="/download" element={<DownloadPage />} />
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
                  <BottomNav />
                  <CustomerNotificationsWatcher />
                  <ToastHost />
                </ErrorBoundary>
              </Router>
            </MenuProvider>
          </MerchantProvider>
        </LocationProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useConvexAuth } from 'convex/react';
import { useAuth } from '../contexts/AuthContext';
import { useRiderProfile } from '../hooks/useRiderProfile';

interface Props {
  children: React.ReactNode;
}

const ProtectedRiderRoute: React.FC<Props> = ({ children }) => {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useRiderProfile();
  const { isLoading: convexAuthLoading } = useConvexAuth();

  // Wait until Convex has attempted its auth handshake — children subscribe to
  // Convex queries on mount, so rendering before the handshake completes makes
  // those queries throw "Unauthorized" mid-render. We don't require the
  // handshake to *succeed* (that would hang forever on misconfig); the
  // ErrorBoundary catches anything that still throws downstream.
  if (loading || (user && (profileLoading || convexAuthLoading))) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }

  // Auth has resolved and there is no signed-in user.
  if (!user) return <Navigate to="/rider/login" replace />;

  // Signed in but no rider profile in Supabase — they're not a rider.
  if (!profile) return <Navigate to="/rider/login" replace />;

  if (!profile.is_approved) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Awaiting approval</h1>
          <p className="text-gray-600 mb-6">
            Your rider account hasn't been approved yet. Please check back later.
          </p>
        </div>
      </div>
    );
  }

  if (!profile.is_active) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Account deactivated</h1>
          <p className="text-gray-600">Contact support to reactivate your rider account.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRiderRoute;

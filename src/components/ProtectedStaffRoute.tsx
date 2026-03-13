import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedStaffRouteProps {
  children: React.ReactNode;
}

const ProtectedStaffRoute: React.FC<ProtectedStaffRouteProps> = ({ children }) => {
  const { user, loading, isStaff } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/staff/login" replace />;
  }

  if (!isStaff) {
    return <Navigate to="/staff/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedStaffRoute;

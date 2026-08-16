import React from 'react';
import { Navigate } from 'react-router-dom';
import { useCurrentProfile } from '../profile/ProfileProvider';
import { ProfileRole } from '../types';
import ProtectedRoute from './ProtectedRoute';

interface RoleRouteProps {
  children: React.ReactNode;
  allowedRoles: ProfileRole[];
}

const RoleRouteContent: React.FC<RoleRouteProps> = ({ children, allowedRoles }) => {
  const { profile, loading } = useCurrentProfile();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-200">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-emerald-400 font-medium">Đang kiểm tra quyền truy cập...</p>
      </div>
    );
  }

  // If we have a profile, check if its role is inside allowed list
  if (!profile || !allowedRoles.includes(profile.role)) {
    console.warn(`Access denied. Role ${profile?.role} not allowed for this route.`);
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const RoleRoute: React.FC<RoleRouteProps> = ({ children, allowedRoles }) => {
  return (
    <ProtectedRoute>
      <RoleRouteContent allowedRoles={allowedRoles}>{children}</RoleRouteContent>
    </ProtectedRoute>
  );
};

export default RoleRoute;

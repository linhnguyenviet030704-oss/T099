import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import type { ProfileRole } from "../types";
import LoadingScreen from "./LoadingScreen";
import ProtectedRoute from "./ProtectedRoute";

function RoleRouteContent({ children, allowedRoles }: { children: ReactNode; allowedRoles: ProfileRole[] }) {
  const { user } = useAuth();
  const { profile, loading, error } = useCurrentProfile();
  // ponytail: ProfileProvider loading starts false; wait until fetch finishes so a hard reload doesn't bounce to /.
  if (loading || (user && !profile && !error)) return <LoadingScreen text="Đang kiểm tra quyền truy cập..." />;
  if (!profile || !allowedRoles.includes(profile.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function RoleRoute({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles: ProfileRole[];
}) {
  return (
    <ProtectedRoute>
      <RoleRouteContent allowedRoles={allowedRoles}>{children}</RoleRouteContent>
    </ProtectedRoute>
  );
}

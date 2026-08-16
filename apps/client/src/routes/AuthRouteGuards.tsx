import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../contexts/Auth.context";
import { PwaBootScreen } from "../pwa/PwaStatusScreen";

const AuthLoadingState = () => <PwaBootScreen />;

export const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <AuthLoadingState />;

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export const PublicRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <AuthLoadingState />;

  return isAuthenticated ? <Navigate to="/" replace /> : <Outlet />;
};

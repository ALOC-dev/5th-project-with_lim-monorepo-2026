import { Navigate, Outlet } from "react-router-dom";

import FeedbackState from "../components/FeedbackState/FeedbackState";
import PageRoot from "../components/PageRoot/PageRoot";
import { useAuth } from "../contexts/Auth.context";
import { tokens } from "../design-system/tokens.generated";

const AuthLoadingState = () => {
  return (
    <PageRoot backgroundColor={tokens.color.neutral["50"]} layout="contained">
      <FeedbackState kind="loading" title="로그인 정보를 확인하고 있어요" />
    </PageRoot>
  );
};

export const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <AuthLoadingState />;

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export const PublicRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <AuthLoadingState />;

  return isAuthenticated ? <Navigate to="/place/recommendation/form" replace /> : <Outlet />;
};

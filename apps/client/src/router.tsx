import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import { useAuth } from "./contexts/Auth.context";
import ForgotPasswordForm from "./pages/ForgotPassword/ForgotPasswordForm";
import ForgotPasswordPage from "./pages/ForgotPassword/ForgotPasswordPage";
import ForgotPasswordResetForm from "./pages/ForgotPassword/ForgotPasswordResetForm";
import HealthCheckPage from "./pages/HealthCheck/page";
import LoginPage from "./pages/Login/LoginPage";
import RecommendationFormPage from "./pages/RecommendationForm/RecommendationForm.page";
import RecommendationMemberPage from "./pages/RecommendationMember/page";
import RecommendationPendingPage from "./pages/RecommendationPending/page";
import RecommendationResultPage from "./pages/RecommendationResult/page";
import SignupPage from "./pages/Signup/SignupPage";

const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <div>로딩 중...</div>;

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const PublicRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <div>로딩 중...</div>;

  return isAuthenticated ? <Navigate to="/place/recommendation/form" replace /> : <Outlet />;
};
const NotFoundPage = () => <div>NotFoundPage</div>;

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/place/recommendation/form",
        element: <RecommendationFormPage />,
      },
      {
        path: "/place/recommendation/pending",
        element: <RecommendationPendingPage />,
      },
      {
        path: "/place/recommendation/result",
        element: <RecommendationResultPage />,
      },
      {
        path: "/place/recommendation/member",
        element: <RecommendationMemberPage />,
      },
    ],
  },

  {
    element: <PublicRoute />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
      {
        path: "/login/forgotpassword",
        element: <ForgotPasswordPage />,
        children: [
          {
            index: true,
            element: <ForgotPasswordForm />,
          },
          {
            path: "reset",
            element: <ForgotPasswordResetForm />,
          },
        ],
      },
    ],
  },
  {
    path: "/",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/health",
    element: <HealthCheckPage />,
  },

  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

import { createBrowserRouter, Navigate } from "react-router-dom";

import ForgotPasswordForm from "./pages/ForgotPassword/ForgotPasswordForm";
import ForgotPasswordPage from "./pages/ForgotPassword/ForgotPasswordPage";
import ForgotPasswordResetForm from "./pages/ForgotPassword/ForgotPasswordResetForm";
import HealthCheckPage from "./pages/HealthCheck/page";
import LoginPage from "./pages/Login/LoginPage";
import RecommendationFormPage from "./pages/RecommendationForm/RecommendationForm.page";
import RecommendationMemberPage from "./pages/RecommendationMember/page";
import RecommendationPendingPage from "./pages/RecommendationPending/page";
import RecommendationResultPage from "./pages/RecommendationResult/RecommendationResult.page";
import SignupPage from "./pages/Signup/SignupPage";

const NotFoundPage = () => <div>NotFoundPage</div>;

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/place/recommendation/form" replace />,
  },
  {
    path: "/place/recommendation/form",
    element: <RecommendationFormPage />,
  },
  {
    path: "/place/recommendation/pending",
    element: <RecommendationPendingPage />,
  },
  {
    path: "/place/recommendation/result/:recommendationId",
    element: <RecommendationResultPage />,
  },
  {
    path: "/place/recommendation/result/:recommendationId/place/:placeId",
    element: <RecommendationResultPage />,
  },
  {
    path: "/place/recommendation/member",
    element: <RecommendationMemberPage />,
  },
  {
    path: "/health",
    element: <HealthCheckPage />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/signup",
    element: <SignupPage />,
  },

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

  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

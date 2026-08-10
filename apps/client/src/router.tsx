import { createBrowserRouter, Navigate } from "react-router-dom";

import FavoritePlacesPage from "./pages/FavoritePlaces/FavoritePlacesPage";
import { ActivityHubPage } from "./pages/ActivityHub/ActivityHubPage";
import {
  CourseFavoritePage,
  CourseRecommendationFormPage,
  CourseRecommendationHistoryPage,
  CourseRecommendationOptionDetailPage,
  CourseRecommendationPendingPage,
  CourseRecommendationResultPage,
} from "./pages/CourseRecommendation/CourseRecommendationPages";
import ForgotPasswordForm from "./pages/ForgotPassword/ForgotPasswordForm";
import ForgotPasswordPage from "./pages/ForgotPassword/ForgotPasswordPage";
import ForgotPasswordResetForm from "./pages/ForgotPassword/ForgotPasswordResetForm";
import HealthCheckPage from "./pages/HealthCheck/page";
import LoginPage from "./pages/Login/LoginPage";
import RecommendationFormPage from "./pages/RecommendationForm/RecommendationForm.page";
import RecommendationHistoryPage from "./pages/RecommendationHistory/RecommendationHistoryPage";
import RecommendationPendingPage from "./pages/RecommendationPending/page";
import RecommendationResultPage from "./pages/RecommendationResult/RecommendationResult.page";
import SignupPage from "./pages/Signup/SignupPage";
import { ProtectedRoute, PublicRoute } from "./routes/AuthRouteGuards";
const NotFoundPage = () => <div>NotFoundPage</div>;

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/activity",
        element: <ActivityHubPage />,
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
        element: <Navigate to="/activity" replace />,
      },
      {
        path: "/place/recommendation/history",
        element: <RecommendationHistoryPage />,
      },
      {
        path: "/place/favorite",
        element: <FavoritePlacesPage />,
      },
      {
        path: "/course/recommendation/form",
        element: <CourseRecommendationFormPage />,
      },
      {
        path: "/course/recommendation/pending/:courseId",
        element: <CourseRecommendationPendingPage />,
      },
      {
        path: "/course/recommendation/result/:courseId",
        element: <CourseRecommendationResultPage />,
      },
      {
        path: "/course/recommendation/result/:courseId/option/:optionId",
        element: <CourseRecommendationOptionDetailPage />,
      },
      {
        path: "/course/recommendation/history",
        element: <CourseRecommendationHistoryPage />,
      },
      {
        path: "/course/favorite",
        element: <CourseFavoritePage />,
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

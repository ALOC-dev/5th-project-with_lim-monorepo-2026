import { createBrowserRouter, Navigate } from "react-router-dom";

import { ActivityHubPage } from "./pages/ActivityHub/ActivityHubPage";
import { CourseFavoritePage } from "./pages/CourseFavorite/CourseFavoritePage";
import { CourseRecommendationDetailPage } from "./pages/CourseRecommendationDetail/CourseRecommendationDetailPage";
import { CourseRecommendationFormPage } from "./pages/CourseRecommendationForm/CourseRecommendationFormPage";
import { CourseRecommendationHistoryPage } from "./pages/CourseRecommendationHistory/CourseRecommendationHistoryPage";
import { CourseRecommendationOptionDetailPage } from "./pages/CourseRecommendationOptionDetail/CourseRecommendationOptionDetailPage";
import FavoritePlacesPage from "./pages/FavoritePlaces/FavoritePlacesPage";
import ForgotPasswordForm from "./pages/ForgotPassword/ForgotPasswordForm";
import ForgotPasswordPage from "./pages/ForgotPassword/ForgotPasswordPage";
import ForgotPasswordResetForm from "./pages/ForgotPassword/ForgotPasswordResetForm";
import HealthCheckPage from "./pages/HealthCheck/page";
import HomePage from "./pages/Home/HomePage";
import LoginPage from "./pages/Login/LoginPage";
import RecommendationDetailPage from "./pages/RecommendationDetail/RecommendationDetailPage";
import RecommendationFormPage from "./pages/RecommendationForm/RecommendationForm.page";
import RecommendationHistoryPage from "./pages/RecommendationHistory/RecommendationHistoryPage";
import SignupPage from "./pages/Signup/SignupPage";
import { ProtectedRoute, PublicRoute } from "./routes/AuthRouteGuards";
const NotFoundPage = () => <div>NotFoundPage</div>;

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "/activity",
        element: <ActivityHubPage />,
      },
      {
        path: "/place/recommendation/form",
        element: <RecommendationFormPage />,
      },
      {
        path: "/place/recommendation/:recommendationId",
        element: <RecommendationDetailPage />,
      },
      {
        path: "/place/recommendation/:recommendationId/place/:placeId",
        element: <RecommendationDetailPage />,
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
        path: "/course/recommendation/:courseId",
        element: <CourseRecommendationDetailPage />,
      },
      {
        path: "/course/recommendation/:courseId/option/:optionId",
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
    path: "/health",
    element: <HealthCheckPage />,
  },

  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

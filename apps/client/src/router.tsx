import {
  createBrowserRouter,
  Navigate,
  Outlet,
  ScrollRestoration,
  useLocation,
} from "react-router-dom";

import { ActivityHubPage } from "./pages/ActivityHub/ActivityHubPage";
import { CourseFavoritePage } from "./pages/CourseFavorite/CourseFavoritePage";
import { CourseRecommendationFormPage } from "./pages/CourseRecommendationForm/CourseRecommendationFormPage";
import { CourseRecommendationHistoryPage } from "./pages/CourseRecommendationHistory/CourseRecommendationHistoryPage";
import { CourseRecommendationResultPage } from "./pages/CourseRecommendationResult/CourseRecommendationResultPage";
import { CourseRecommendationResultItemDetailPage } from "./pages/CourseRecommendationResultItemDetail/CourseRecommendationResultItemDetailPage";
import FavoritePlacesPage from "./pages/FavoritePlaces/FavoritePlacesPage";
import ForgotPasswordForm from "./pages/ForgotPassword/ForgotPasswordForm";
import ForgotPasswordPage from "./pages/ForgotPassword/ForgotPasswordPage";
import ForgotPasswordResetForm from "./pages/ForgotPassword/ForgotPasswordResetForm";
import HealthCheckPage from "./pages/HealthCheck/page";
import HomePage from "./pages/Home/HomePage";
import LoginPage from "./pages/Login/LoginPage";
import PlaceRecommendationFormPage from "./pages/PlaceRecommendationForm/PlaceRecommendationFormPage";
import PlaceRecommendationHistoryPage from "./pages/PlaceRecommendationHistory/PlaceRecommendationHistoryPage";
import PlaceRecommendationResultPage from "./pages/PlaceRecommendationResult/PlaceRecommendationResultPage";
import PlaceRecommendationResultItemDetailPage from "./pages/PlaceRecommendationResultItemDetail/PlaceRecommendationResultItemDetailPage";
import SignupPage from "./pages/Signup/SignupPage";
import { ProtectedRoute, PublicRoute } from "./routes/AuthRouteGuards";

const NotFoundPage = () => <div>NotFoundPage</div>;

const AppRouteFrame = () => {
  const location = useLocation();

  return (
    <>
      <ScrollRestoration getKey={(scrollLocation) => scrollLocation.key} />
      <div data-route-transition key={location.key}>
        <Outlet />
      </div>
    </>
  );
};

export const router = createBrowserRouter([
  {
    element: <AppRouteFrame />,
    children: [
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
            element: <PlaceRecommendationFormPage />,
          },
          {
            path: "/place/recommendation/:recommendationId",
            element: <PlaceRecommendationResultPage />,
          },
          {
            path: "/place/recommendation/:recommendationId/place/:placeId",
            element: <PlaceRecommendationResultItemDetailPage />,
          },
          {
            path: "/place/recommendation/member",
            element: <Navigate to="/activity" replace />,
          },
          {
            path: "/place/recommendation/history",
            element: <PlaceRecommendationHistoryPage />,
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
            element: <CourseRecommendationResultPage />,
          },
          {
            path: "/course/recommendation/:courseId/option/:optionId",
            element: <CourseRecommendationResultItemDetailPage />,
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
    ],
  },
]);

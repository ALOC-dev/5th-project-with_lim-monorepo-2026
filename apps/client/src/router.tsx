import { createBrowserRouter, Navigate, Outlet, ScrollRestoration } from "react-router-dom";

import FeedbackState from "./components/FeedbackState/FeedbackState";
import PageRoot from "./components/PageRoot/PageRoot";
import { useAuth } from "./contexts/Auth.context";
import { tokens } from "./design-system/tokens.generated";
import ChangePasswordPage from "./pages/ChangePassword/ChangePasswordPage";
import { CourseBookmarksPage } from "./pages/CourseFavorite/CourseFavoritePage";
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
import { MyPage } from "./pages/MyPage/MyPageContent";
import PlaceRecommendationFormPage from "./pages/PlaceRecommendationForm/PlaceRecommendationFormPage";
import PlaceRecommendationHistoryPage from "./pages/PlaceRecommendationHistory/PlaceRecommendationHistoryPage";
import PlaceRecommendationResultPage from "./pages/PlaceRecommendationResult/PlaceRecommendationResultPage";
import PlaceRecommendationResultItemDetailPage from "./pages/PlaceRecommendationResultItemDetail/PlaceRecommendationResultItemDetailPage";
import SignupPage from "./pages/Signup/SignupPage";
import { ProtectedRoute, PublicRoute } from "./routes/AuthRouteGuards";
import { MainNavigationLayout } from "./routes/MainNavigationLayout";
import { useAppNavigate } from "./routes/useAppNavigate";

const NotFoundPage = () => {
  const navigate = useAppNavigate();
  const { isAuthenticated } = useAuth();
  const recoveryPath = isAuthenticated ? "/" : "/login";

  return (
    <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
      <FeedbackState
        action={{
          label: isAuthenticated ? "홈으로 이동" : "로그인 화면으로 이동",
          onClick: () => void navigate(recoveryPath, { replace: true }),
        }}
        description="주소가 잘못되었거나 페이지가 이동되었을 수 있어요."
        kind="empty"
        title="요청한 페이지를 찾을 수 없어요"
      />
    </PageRoot>
  );
};

const AppRouteFrame = () => {
  return (
    <>
      <ScrollRestoration getKey={(scrollLocation) => scrollLocation.key} />
      <div data-route-frame>
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
            element: <MainNavigationLayout />,
            children: [
              {
                index: true,
                element: <HomePage />,
              },
              {
                path: "/my",
                element: <MyPage />,
              },
              {
                path: "/my/changepassword",
                element: <ChangePasswordPage />,
              },
            ],
          },
          {
            path: "/activity",
            element: <Navigate to="/my" replace />,
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
            element: <Navigate to="/my" replace />,
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
            element: <CourseBookmarksPage />,
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

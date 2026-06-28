import { createBrowserRouter, Navigate } from "react-router-dom";

import HealthCheckPage from "./pages/HealthCheck/page";
import RecommendationFormPage from "./pages/RecommendationForm/page";
import RecommendationMemberPage from "./pages/RecommendationMember/page";
import RecommendationPendingPage from "./pages/RecommendationPending/page";
import RecommendationResultPage from "./pages/RecommendationResult/page";

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
    path: "/place/recommendation/result",
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
    path: "*",
    element: <NotFoundPage />,
  },
]);

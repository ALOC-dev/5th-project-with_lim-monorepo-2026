import { createBrowserRouter, Navigate } from "react-router-dom";

import RecommendationFormPage from "./page/RecommendationForm/page";
import RecommendationMemberPage from "./page/RecommendationMember/page";
import RecommendationPendingPage from "./page/RecommendationPending/page";
import RecommendationResultPage from "./page/RecommendationResult/page";

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
    path: "*",
    element: <NotFoundPage />,
  },
]);

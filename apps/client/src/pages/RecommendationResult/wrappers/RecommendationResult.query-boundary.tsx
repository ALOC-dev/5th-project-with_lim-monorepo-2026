import type { ComponentType } from "react";

import {
  type RecommendationResultSuccess,
  useRecommendationResultDataContext,
} from "./RecommendationResult.data.context";

export type RecommendationResultQueryBoundaryProps = {
  readonly views: {
    readonly loading: ComponentType;
    readonly error: ComponentType;
    readonly success: ComponentType<{ readonly result: RecommendationResultSuccess }>;
  };
};

export const RecommendationResultQueryBoundary = ({
  views,
}: RecommendationResultQueryBoundaryProps) => {
  const dataContext = useRecommendationResultDataContext();

  switch (dataContext.status) {
    case "loading": {
      const LoadingView = views.loading;
      return <LoadingView />;
    }
    case "error": {
      const ErrorView = views.error;
      return <ErrorView />;
    }
    case "success": {
      const SuccessView = views.success;

      return <SuccessView result={dataContext.result} />;
    }
  }
};

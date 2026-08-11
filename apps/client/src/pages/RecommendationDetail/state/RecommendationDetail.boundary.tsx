import type { ComponentType } from "react";

import {
  type RecommendationDetailSuccess,
  useRecommendationDetailDataContext,
} from "./RecommendationDetail.data.context";

export type RecommendationDetailBoundaryProps = {
  readonly views: {
    readonly loading: ComponentType;
    readonly empty: ComponentType;
    readonly error: ComponentType;
    readonly success: ComponentType<{ readonly result: RecommendationDetailSuccess }>;
  };
};

export const RecommendationDetailBoundary = ({ views }: RecommendationDetailBoundaryProps) => {
  const dataContext = useRecommendationDetailDataContext();

  switch (dataContext.status) {
    case "loading": {
      const LoadingView = views.loading;
      return <LoadingView />;
    }
    case "empty": {
      const EmptyView = views.empty;
      return <EmptyView />;
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

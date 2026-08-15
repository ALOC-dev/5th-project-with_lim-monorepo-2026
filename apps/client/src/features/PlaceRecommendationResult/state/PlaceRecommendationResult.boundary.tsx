import type { ComponentType } from "react";

import {
  type PlaceRecommendationResultSuccess,
  usePlaceRecommendationResultDataContext,
} from "./PlaceRecommendationResult.data.context";

export type PlaceRecommendationResultBoundaryProps = {
  readonly views: {
    readonly loading: ComponentType;
    readonly empty: ComponentType;
    readonly error: ComponentType;
    readonly success: ComponentType<{
      readonly durationLabel: string | null;
      readonly result: PlaceRecommendationResultSuccess;
    }>;
  };
};

export const PlaceRecommendationResultBoundary = ({
  views,
}: PlaceRecommendationResultBoundaryProps) => {
  const dataContext = usePlaceRecommendationResultDataContext();

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

      return <SuccessView durationLabel={dataContext.durationLabel} result={dataContext.result} />;
    }
  }
};

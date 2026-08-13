import type { PlaceRecommendationItem } from "@monorepo/recommendation-engine/v1/contracts";
import { createContext, useContext } from "react";

export type PlaceRecommendationResultBookmarksContextType = {
  readonly errorMessage: string | null;
  readonly isBookmarkActionDisabled: boolean;
  readonly isSaved: (recommendationId: string) => boolean;
  readonly retry: () => void;
  readonly toggleBookmark: (place: PlaceRecommendationItem) => void;
};

export const PlaceRecommendationResultBookmarksContext =
  createContext<PlaceRecommendationResultBookmarksContextType | null>(null);

export const usePlaceRecommendationResultBookmarksContext = () => {
  const context = useContext(PlaceRecommendationResultBookmarksContext);
  if (!context) {
    throw new Error(
      "usePlaceRecommendationResultBookmarksContext must be used within a PlaceRecommendationResultBookmarksProvider",
    );
  }

  return context;
};

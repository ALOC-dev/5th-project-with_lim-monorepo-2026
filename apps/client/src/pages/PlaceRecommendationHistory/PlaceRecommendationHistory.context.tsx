import type { PlaceRecommendationHistoryStatus } from "@monorepo/api-contracts";
import { createContext, useContext } from "react";

export type PlaceRecommendationHistoryStatusValue = PlaceRecommendationHistoryStatus;

export type PlaceRecommendationHistoryDisplayStatus = "pending" | "success" | "failed";

export type PlaceRecommendationHistoryItem = {
  readonly id: string;
  readonly status: PlaceRecommendationHistoryStatusValue;
  readonly displayStatus: PlaceRecommendationHistoryDisplayStatus;
  readonly dateLabel: string;
  readonly title: string;
  readonly description: string;
};

export type PlaceRecommendationHistoryContextType = {
  readonly historyList: readonly PlaceRecommendationHistoryItem[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly retry: () => void;

  readonly handleCardClick: (id: string) => Promise<void>;
  readonly handleDeleteItem: (id: string) => Promise<boolean>;
  readonly handleUpdateTitle: (id: string, newTitle: string) => Promise<boolean>;
};

export const PlaceRecommendationHistoryContext =
  createContext<PlaceRecommendationHistoryContextType | null>(null);

export const usePlaceRecommendationHistory = () => {
  const context = useContext(PlaceRecommendationHistoryContext);

  if (!context) {
    throw new Error(
      "usePlaceRecommendationHistory must be used within PlaceRecommendationHistoryProvider",
    );
  }

  return context;
};

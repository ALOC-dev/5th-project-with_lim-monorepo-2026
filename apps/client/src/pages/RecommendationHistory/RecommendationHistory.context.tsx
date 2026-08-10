import type { PlaceRecommendationHistoryStatus } from "@monorepo/api-contracts";
import { createContext, useContext } from "react";

export type HistoryStatus = PlaceRecommendationHistoryStatus;

export type HistoryDisplayStatus = "pending" | "success" | "failed";

export type HistoryItem = {
  readonly id: string;
  readonly status: HistoryStatus;
  readonly displayStatus: HistoryDisplayStatus;
  readonly dateLabel: string;
  readonly title: string;
  readonly description: string;
};

export type RecommendationHistoryContextType = {
  readonly historyList: readonly HistoryItem[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly retry: () => void;

  readonly handleCardClick: (id: string, status: HistoryStatus) => Promise<void>;
  readonly handleDeleteItem: (id: string) => Promise<boolean>;
  readonly handleUpdateTitle: (id: string, newTitle: string) => Promise<boolean>;
};

export const RecommendationHistoryContext = createContext<RecommendationHistoryContextType | null>(
  null,
);

export const useRecommendationHistory = () => {
  const context = useContext(RecommendationHistoryContext);

  if (!context) {
    throw new Error("useRecommendationHistory must be used within RecommendationHistoryProvider");
  }

  return context;
};

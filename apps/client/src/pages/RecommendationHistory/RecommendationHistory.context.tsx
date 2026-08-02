import { createContext, useContext } from "react";

// 기록 아이템 타입 정의
export type HistoryStatus = "pending" | "success" | "failed";

export type HistoryItem = {
  id: string;
  status: HistoryStatus;
  dateLabel: string;
  title: string;
  description: string;
};

export type RecommendationHistoryContextType = {
  readonly historyList: HistoryItem[];
  readonly isLoading: boolean;

  readonly handleCardClick: (id: string, status: HistoryStatus) => void;
  readonly handleDeleteItem: (id: string) => void;
  readonly handleUpdateTitle: (id: string, newTitle: string) => void;
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

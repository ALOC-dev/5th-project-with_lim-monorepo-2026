import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  type HistoryItem,
  type HistoryStatus,
  RecommendationHistoryContext,
  type RecommendationHistoryContextType,
} from "./RecommendationHistory.context";
import RecommendationHistoryContent from "./RecommendationHistoryForm";

export const RecommendationHistoryProvider = ({ children }: { readonly children: ReactNode }) => {
  const navigate = useNavigate();
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMockData = () => {
      const mockData: HistoryItem[] = [
        {
          id: "req_1",
          status: "pending",
          dateLabel: "방금 요청함",
          title: "대화하기 좋은 저녁 식사",
          description: "출발지 3곳의 이동 시간을 계산하고 있어요.",
        },
        {
          id: "req_2",
          status: "failed",
          dateLabel: "2026.07.08 수",
          title: "비 오는 날 실내 데이트",
          description: "출발지 3곳 기준으로 추천을 만들지 못했어요.",
        },
        {
          id: "req_3",
          status: "success",
          dateLabel: "2026.07.02 목",
          title: "친구와 가볍게 만날 카페",
          description: "출발지 3곳",
        },
      ];
      setHistoryList(mockData);
      setIsLoading(false);
    };

    void fetchMockData();
  }, []);

  const handleCardClick = useCallback(
    (id: string, status: HistoryStatus) => {
      if (status === "pending") {
        void navigate("/place/recommendation/pending");
      } else if (status === "success") {
        void navigate(`/place/recommendation/result/${id}`);
      }
    },
    [navigate],
  );

  const handleDeleteItem = useCallback((id: string) => {
    try {
      setHistoryList((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("기록 삭제 실패:", error);
    }
  }, []);

  const handleUpdateTitle = useCallback((id: string, newTitle: string) => {
    try {
      // TODO: requestUpdateHistoryTitle(id, newTitle) API 호출
      setHistoryList((prev) =>
        prev.map((item) => (item.id === id ? { ...item, title: newTitle } : item)),
      );
    } catch (error) {
      console.error("기록 수정 실패:", error);
    }
  }, []);

  const contextValue = useMemo<RecommendationHistoryContextType>(
    () => ({
      historyList,
      isLoading,
      handleCardClick,
      handleDeleteItem,
      handleUpdateTitle,
    }),
    [historyList, isLoading, handleCardClick, handleDeleteItem, handleUpdateTitle],
  );

  return (
    <RecommendationHistoryContext.Provider value={contextValue}>
      {children}
    </RecommendationHistoryContext.Provider>
  );
};

export default function RecommendationHistoryPage() {
  return (
    <RecommendationHistoryProvider>
      <RecommendationHistoryContent />
    </RecommendationHistoryProvider>
  );
}

import type { PlaceRecommendationHistoryListResponseData } from "@monorepo/api-contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  deletePlaceRecommendationHistory,
  getPlaceRecommendationHistories,
  getPlaceRecommendationHistory,
  renamePlaceRecommendationHistory,
} from "../../apis/server/placeRecommendationHistories";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import { getRecommendationResultQueryKey } from "../RecommendationResult/wrappers/RecommendationResult.query-key";
import {
  type HistoryStatus,
  RecommendationHistoryContext,
  type RecommendationHistoryContextType,
} from "./RecommendationHistory.context";
import {
  recommendationHistoriesQueryKey,
  toCompletedEngineOutput,
  toHistoryItem,
  unwrapRecommendationHistoryApiResponse,
} from "./RecommendationHistory.data";
import RecommendationHistoryContent from "./RecommendationHistoryForm";

export const RecommendationHistoryProvider = ({ children }: { readonly children: ReactNode }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [failedDetailId, setFailedDetailId] = useState<string | null>(null);
  const {
    data: historyData,
    isError: isHistoryListError,
    isPending,
    refetch,
  } = useQuery({
    queryKey: recommendationHistoriesQueryKey,
    queryFn: async () =>
      unwrapRecommendationHistoryApiResponse(await getPlaceRecommendationHistories()),
    retry: false,
  });

  const loadCompletedHistory = useCallback(
    async (id: string): Promise<void> => {
      setFailedDetailId(null);

      const response = await getPlaceRecommendationHistory(id);
      if (!response.success) {
        setFailedDetailId(id);
        return;
      }

      const result = toCompletedEngineOutput(response.data);
      if (result === null) {
        setFailedDetailId(id);
        return;
      }

      queryClient.setQueryData(getRecommendationResultQueryKey(id), result);
      void navigate("/place/recommendation/result/" + encodeURIComponent(id), {
        state: { result },
      });
    },
    [navigate, queryClient],
  );

  const handleCardClick = useCallback(
    async (id: string, status: HistoryStatus): Promise<void> => {
      switch (status) {
        case "PENDING":
        case "FAILED":
          return;
        case "COMPLETED":
          await loadCompletedHistory(id);
      }
    },
    [loadCompletedHistory],
  );

  const handleDeleteItem = useCallback(
    async (id: string): Promise<boolean> => {
      const response = await deletePlaceRecommendationHistory(id);
      if (!response.success) {
        return false;
      }

      queryClient.setQueryData<PlaceRecommendationHistoryListResponseData>(
        recommendationHistoriesQueryKey,
        (current) => {
          if (current === undefined) {
            return current;
          }

          return {
            ...current,
            items: current.items.filter((item) => item.id !== response.data.deletedId),
          };
        },
      );

      return true;
    },
    [queryClient],
  );

  const handleUpdateTitle = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      const response = await renamePlaceRecommendationHistory(id, title);
      if (!response.success) {
        return false;
      }

      queryClient.setQueryData<PlaceRecommendationHistoryListResponseData>(
        recommendationHistoriesQueryKey,
        (current) => {
          if (current === undefined) {
            return current;
          }

          return {
            ...current,
            items: current.items.map((item) =>
              item.id === response.data.id ? { ...item, title: response.data.title } : item,
            ),
          };
        },
      );

      return true;
    },
    [queryClient],
  );

  const historyList = useMemo(
    () => historyData?.items.map(toHistoryItem) ?? [],
    [historyData?.items],
  );

  const isError = isHistoryListError || failedDetailId !== null;

  const retry = useCallback(() => {
    if (failedDetailId !== null) {
      void loadCompletedHistory(failedDetailId);
      return;
    }

    void refetch();
  }, [failedDetailId, loadCompletedHistory, refetch]);

  const contextValue = useMemo<RecommendationHistoryContextType>(
    () => ({
      handleCardClick,
      handleDeleteItem,
      handleUpdateTitle,
      historyList,
      isError,
      isLoading: isPending,
      retry,
    }),
    [handleCardClick, handleDeleteItem, handleUpdateTitle, historyList, isError, isPending, retry],
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
      <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
        <RecommendationHistoryContent />
      </PageRoot>
    </RecommendationHistoryProvider>
  );
}

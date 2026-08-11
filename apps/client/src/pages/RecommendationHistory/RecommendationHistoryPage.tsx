import type { PlaceRecommendationHistoryListResponseData } from "@monorepo/api-contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import {
  deletePlaceRecommendationHistory,
  getPlaceRecommendationHistories,
  renamePlaceRecommendationHistory,
} from "../../apis/server/placeRecommendationHistories";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import {
  RecommendationHistoryContext,
  type RecommendationHistoryContextType,
} from "./RecommendationHistory.context";
import {
  recommendationHistoriesQueryKey,
  toHistoryItem,
  unwrapRecommendationHistoryApiResponse,
} from "./RecommendationHistory.data";
import RecommendationHistoryContent from "./RecommendationHistoryForm";

export const RecommendationHistoryProvider = ({ children }: { readonly children: ReactNode }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === "PENDING") ? 5_000 : false,
  });

  const handleCardClick = useCallback(
    async (id: string): Promise<void> => {
      await navigate("/place/recommendation/" + encodeURIComponent(id));
    },
    [navigate],
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

  const retry = useCallback(() => void refetch(), [refetch]);

  const contextValue = useMemo<RecommendationHistoryContextType>(
    () => ({
      handleCardClick,
      handleDeleteItem,
      handleUpdateTitle,
      historyList,
      isError: isHistoryListError,
      isLoading: isPending,
      retry,
    }),
    [
      handleCardClick,
      handleDeleteItem,
      handleUpdateTitle,
      historyList,
      isHistoryListError,
      isPending,
      retry,
    ],
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

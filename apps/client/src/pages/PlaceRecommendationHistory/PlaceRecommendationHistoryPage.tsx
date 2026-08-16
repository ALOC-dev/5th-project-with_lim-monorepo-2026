import type { PlaceRecommendationHistoryListResponseData } from "@monorepo/api-contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo } from "react";

import {
  deletePlaceRecommendationHistory,
  getPlaceRecommendationHistories,
  renamePlaceRecommendationHistory,
} from "../../apis/server/placeRecommendationHistories";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import { useAppNavigate } from "../../routes/useAppNavigate";
import {
  PlaceRecommendationHistoryContext,
  type PlaceRecommendationHistoryContextType,
} from "./PlaceRecommendationHistory.context";
import {
  placeRecommendationHistoriesQueryKey,
  toPlaceRecommendationHistoryItem,
  unwrapPlaceRecommendationHistoryApiResponse,
} from "./PlaceRecommendationHistory.data";
import PlaceRecommendationHistoryContent from "./PlaceRecommendationHistoryForm";

export const PlaceRecommendationHistoryProvider = ({
  children,
}: {
  readonly children: ReactNode;
}) => {
  const navigate = useAppNavigate();
  const queryClient = useQueryClient();
  const {
    data: historyData,
    isError: isHistoryListError,
    isPending,
    refetch,
  } = useQuery({
    queryKey: placeRecommendationHistoriesQueryKey,
    queryFn: async () =>
      unwrapPlaceRecommendationHistoryApiResponse(await getPlaceRecommendationHistories()),
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
        placeRecommendationHistoriesQueryKey,
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
        placeRecommendationHistoriesQueryKey,
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
    () => historyData?.items.map(toPlaceRecommendationHistoryItem) ?? [],
    [historyData?.items],
  );

  const retry = useCallback(() => void refetch(), [refetch]);

  const contextValue = useMemo<PlaceRecommendationHistoryContextType>(
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
    <PlaceRecommendationHistoryContext.Provider value={contextValue}>
      {children}
    </PlaceRecommendationHistoryContext.Provider>
  );
};

export default function PlaceRecommendationHistoryPage() {
  return (
    <PlaceRecommendationHistoryProvider>
      <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
        <PlaceRecommendationHistoryContent />
      </PageRoot>
    </PlaceRecommendationHistoryProvider>
  );
}

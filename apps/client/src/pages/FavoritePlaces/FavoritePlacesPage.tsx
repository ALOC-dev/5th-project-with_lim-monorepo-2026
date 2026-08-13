import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  deleteSavedPlace,
  getSavedPlaces,
  type SavedRecommendationPlace,
} from "../../apis/server/savedPlaces";
import {
  removeSavedPlaceFromCache,
  savedPlacesQueryKey,
} from "../../features/SavedPlaces/savedPlaces.data";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import {
  type FavoritePlaceItem,
  FavoritePlacesContext,
  type FavoritePlacesContextType,
} from "./FavoritePlaces.context";
import FavoritePlacesContent from "./FavoritePlacesForm";

const seoulDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

class SavedPlacesRequestError extends Error {
  readonly operation: "delete" | "list";

  constructor(operation: "delete" | "list", message: string) {
    super(message);
    this.name = "SavedPlacesRequestError";
    this.operation = operation;
  }
}

const formatSeoulDate = (createdAt: string): string => {
  const dateParts = new Map(
    seoulDateFormatter
      .formatToParts(new Date(createdAt))
      .map(({ type, value }) => [type, value] as const),
  );

  return `${dateParts.get("year") ?? ""}.${dateParts.get("month") ?? ""}.${dateParts.get("day") ?? ""}`;
};

const toFavoritePlaceItem = ({
  id,
  createdAt,
  placeData,
}: SavedRecommendationPlace): FavoritePlaceItem => ({
  id,
  date: formatSeoulDate(createdAt),
  title: placeData.name,
  category: `${placeData.mainCategory} · ${placeData.subCategory}`,
  score: placeData.score,
  tags: placeData.tags,
});

const requestSavedPlaces = async (): Promise<SavedRecommendationPlace[]> => {
  const response = await getSavedPlaces();
  if (!response.success) {
    throw new SavedPlacesRequestError("list", response.error);
  }

  return response.data.savedPlaces;
};

const requestSavedPlaceDeletion = async (savedPlaceId: string): Promise<string> => {
  const response = await deleteSavedPlace(savedPlaceId);
  if (!response.success) {
    throw new SavedPlacesRequestError("delete", response.error);
  }

  return savedPlaceId;
};

const FavoritePlacesProvider = ({ children }: { readonly children: ReactNode }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const {
    data: savedPlaces = [],
    isError: isListError,
    isPending: isLoading,
    refetch,
  } = useQuery({
    queryKey: savedPlacesQueryKey,
    queryFn: requestSavedPlaces,
    retry: false,
  });
  const { isPending: isDeleting, mutate: deleteFavoritePlace } = useMutation({
    mutationFn: requestSavedPlaceDeletion,
    onMutate: () => {
      setDeleteErrorMessage(null);
    },
    onSuccess: (deletedSavedPlaceId) => {
      queryClient.setQueryData<SavedRecommendationPlace[]>(
        savedPlacesQueryKey,
        (currentSavedPlaces) => removeSavedPlaceFromCache(currentSavedPlaces, deletedSavedPlaceId),
      );
    },
    onError: () => {
      setDeleteErrorMessage("찜한 장소를 삭제하지 못했습니다. 다시 시도해 주세요.");
    },
  });

  const favoriteList = useMemo(() => savedPlaces.map(toFavoritePlaceItem), [savedPlaces]);

  const handleToggleFavorite = useCallback(
    (savedPlaceId: string) => {
      if (isDeleting) {
        return;
      }

      deleteFavoritePlace(savedPlaceId);
    },
    [deleteFavoritePlace, isDeleting],
  );

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleGoToPlaceRecommendationHistory = useCallback(() => {
    void navigate("/place/recommendation/history");
  }, [navigate]);

  const contextValue = useMemo<FavoritePlacesContextType>(
    () => ({
      favoriteList,
      isLoading,
      isListError,
      isDeleting,
      deleteErrorMessage,
      handleToggleFavorite,
      handleRetry,
      handleGoToPlaceRecommendationHistory,
    }),
    [
      favoriteList,
      isLoading,
      isListError,
      isDeleting,
      deleteErrorMessage,
      handleToggleFavorite,
      handleRetry,
      handleGoToPlaceRecommendationHistory,
    ],
  );

  return (
    <FavoritePlacesContext.Provider value={contextValue}>{children}</FavoritePlacesContext.Provider>
  );
};

export default function FavoritePlacesPage() {
  return (
    <FavoritePlacesProvider>
      <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
        <FavoritePlacesContent />
      </PageRoot>
    </FavoritePlacesProvider>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import {
  deleteSavedPlace,
  getSavedPlaces,
  type SavedRecommendationPlace,
  saveSavedPlace,
} from "../../apis/server/savedPlaces";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import {
  savedPlacesQueryKey,
  type SavedRecommendationPlaceCacheItem,
  updateSavedPlaceBookmarkInCache,
} from "../../features/SavedPlaces/savedPlaces.data";
import { useAppNavigate } from "../../routes/useAppNavigate";
import {
  type BookmarkedPlaceItem,
  BookmarkedPlacesContext,
  type BookmarkedPlacesContextType,
} from "./FavoritePlaces.context";
import BookmarkedPlacesContent from "./FavoritePlacesForm";

const seoulDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

class SavedPlacesRequestError extends Error {
  readonly operation: "bookmark" | "list";

  constructor(operation: "bookmark" | "list", message: string) {
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

const toBookmarkedPlaceItem = (
  { id, historyId, createdAt, placeData }: SavedRecommendationPlace,
  isBookmarked: boolean,
): BookmarkedPlaceItem => ({
  id,
  historyId,
  placeId: placeData.id,
  date: formatSeoulDate(createdAt),
  title: placeData.name,
  category: `${placeData.mainCategory} · ${placeData.subCategory}`,
  score: placeData.score,
  tags: placeData.tags,
  isBookmarked,
});

const requestSavedPlaces = async (): Promise<SavedRecommendationPlace[]> => {
  const response = await getSavedPlaces();
  if (!response.success) {
    throw new SavedPlacesRequestError("list", response.error);
  }

  return response.data.savedPlaces;
};

type PlaceBookmarkMutationVariables = {
  readonly savedPlace: SavedRecommendationPlace;
  readonly isBookmarked: boolean;
};

type PlaceBookmarkMutationResult = {
  readonly isBookmarked: boolean;
  readonly savedPlace?: SavedRecommendationPlace;
};

const requestPlaceBookmark = async ({
  isBookmarked,
  savedPlace,
}: PlaceBookmarkMutationVariables): Promise<PlaceBookmarkMutationResult> => {
  if (!isBookmarked) {
    const response = await deleteSavedPlace(savedPlace.id);
    if (!response.success) {
      throw new SavedPlacesRequestError("bookmark", response.error);
    }

    return { isBookmarked: false };
  }

  const response = await saveSavedPlace({
    ...(savedPlace.historyId ? { historyId: savedPlace.historyId } : {}),
    placeData: savedPlace.placeData,
  });
  if (!response.success) {
    throw new SavedPlacesRequestError("bookmark", response.error);
  }

  return { isBookmarked: true, savedPlace: response.data.savedPlace };
};

const BookmarkedPlacesProvider = ({ children }: { readonly children: ReactNode }) => {
  const navigate = useAppNavigate();
  const [bookmarkErrorMessage, setBookmarkErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const {
    data: savedPlaces = [],
    isError: isListError,
    isPending: isLoading,
    refetch,
  } = useQuery<SavedRecommendationPlaceCacheItem[]>({
    queryKey: savedPlacesQueryKey,
    queryFn: requestSavedPlaces,
    retry: false,
  });
  const bookmarkMutation = useMutation({
    mutationFn: requestPlaceBookmark,
    onMutate: async ({ savedPlace, isBookmarked }: PlaceBookmarkMutationVariables) => {
      const recommendationId = savedPlace.placeData.id;
      await queryClient.cancelQueries({ queryKey: savedPlacesQueryKey });
      const previousSavedPlaces =
        queryClient.getQueryData<SavedRecommendationPlaceCacheItem[]>(savedPlacesQueryKey);

      setBookmarkErrorMessage(null);
      queryClient.setQueryData<SavedRecommendationPlaceCacheItem[] | undefined>(
        savedPlacesQueryKey,
        (current) => updateSavedPlaceBookmarkInCache(current, recommendationId, isBookmarked),
      );

      return { previousSavedPlaces };
    },
    onSuccess: (result, { savedPlace }) => {
      const recommendationId = savedPlace.placeData.id;
      if (result.savedPlace) {
        queryClient.setQueryData<SavedRecommendationPlaceCacheItem[] | undefined>(
          savedPlacesQueryKey,
          (current) =>
            updateSavedPlaceBookmarkInCache(current, recommendationId, true, result.savedPlace),
        );
      }
    },
    onError: (_error, _variables, context) => {
      setBookmarkErrorMessage("찜한 장소의 북마크 상태를 변경하지 못했습니다.");
      queryClient.setQueryData(savedPlacesQueryKey, context?.previousSavedPlaces);
    },
  });

  const bookmarkList = useMemo(
    () =>
      savedPlaces.map((savedPlace) =>
        toBookmarkedPlaceItem(savedPlace, savedPlace.isBookmarked !== false),
      ),
    [savedPlaces],
  );

  const handleToggleBookmark = useCallback(
    (savedPlaceId: string) => {
      if (bookmarkMutation.isPending) {
        return;
      }

      const savedPlace = savedPlaces.find((candidate) => candidate.id === savedPlaceId);
      if (!savedPlace) return;

      const isBookmarked = savedPlace.isBookmarked !== false;
      bookmarkMutation.mutate({ savedPlace, isBookmarked: !isBookmarked });
    },
    [bookmarkMutation, savedPlaces],
  );

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleGoToPlaceRecommendationHistory = useCallback(() => {
    void navigate("/place/recommendation/history");
  }, [navigate]);

  const contextValue = useMemo<BookmarkedPlacesContextType>(
    () => ({
      bookmarkList,
      isLoading,
      isListError,
      isBookmarking: bookmarkMutation.isPending,
      bookmarkErrorMessage,
      handleToggleBookmark,
      handleRetry,
      handleGoToPlaceRecommendationHistory,
    }),
    [
      bookmarkList,
      isLoading,
      isListError,
      bookmarkMutation.isPending,
      bookmarkErrorMessage,
      handleToggleBookmark,
      handleRetry,
      handleGoToPlaceRecommendationHistory,
    ],
  );

  return (
    <BookmarkedPlacesContext.Provider value={contextValue}>
      {children}
    </BookmarkedPlacesContext.Provider>
  );
};

export default function BookmarkedPlacesPage() {
  return (
    <BookmarkedPlacesProvider>
      <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
        <BookmarkedPlacesContent />
      </PageRoot>
    </BookmarkedPlacesProvider>
  );
}

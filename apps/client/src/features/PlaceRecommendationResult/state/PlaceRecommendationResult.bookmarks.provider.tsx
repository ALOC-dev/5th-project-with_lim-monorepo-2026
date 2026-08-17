import type { PlaceRecommendationItem } from "@monorepo/recommendation-engine/v1/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import {
  deleteSavedPlace,
  getSavedPlaces,
  type SavedRecommendationPlace,
  saveSavedPlace,
} from "../../../apis/server/savedPlaces";
import {
  findSavedPlaceByRecommendationId,
  isSavedPlaceBookmarked,
  removeSavedPlaceFromCache,
  savedPlacesQueryKey,
  type SavedRecommendationPlaceCacheItem,
  upsertSavedPlaceInCache,
} from "../../SavedPlaces/savedPlaces.data";
import {
  PlaceRecommendationResultBookmarksContext,
  type PlaceRecommendationResultBookmarksContextType,
} from "./PlaceRecommendationResult.bookmarks.context";

type BookmarkMutationResult =
  | { readonly kind: "saved"; readonly savedPlace: SavedRecommendationPlace }
  | { readonly kind: "removed"; readonly savedPlaceId: string };

type BookmarkMutationVariables = {
  readonly place: PlaceRecommendationItem;
  readonly savedPlace: SavedRecommendationPlace | undefined;
};

type BookmarkMutationContext = {
  readonly previousSavedPlaces: SavedRecommendationPlaceCacheItem[] | undefined;
  readonly optimisticSavedPlaceId: string;
};

class SavedPlacesRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SavedPlacesRequestError";
  }
}

const requestSavedPlaces = async (): Promise<SavedRecommendationPlace[]> => {
  const response = await getSavedPlaces();
  if (!response.success) {
    throw new SavedPlacesRequestError(response.error);
  }

  return response.data.savedPlaces;
};

export const PlaceRecommendationResultBookmarksProvider = ({
  children,
  historyId,
}: {
  readonly children: ReactNode;
  readonly historyId: string | undefined;
}) => {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const savedPlacesQuery = useQuery<SavedRecommendationPlaceCacheItem[]>({
    queryKey: savedPlacesQueryKey,
    queryFn: requestSavedPlaces,
    retry: false,
  });
  const savedPlaces = useMemo(() => savedPlacesQuery.data ?? [], [savedPlacesQuery.data]);
  const savedPlaceByRecommendationId = useMemo(
    () =>
      new Map(
        savedPlaces
          .filter(isSavedPlaceBookmarked)
          .map((savedPlace) => [savedPlace.placeData.id, savedPlace] as const),
      ),
    [savedPlaces],
  );
  const bookmarkMutation = useMutation<
    BookmarkMutationResult,
    Error,
    BookmarkMutationVariables,
    BookmarkMutationContext
  >({
    mutationFn: async ({ place, savedPlace }): Promise<BookmarkMutationResult> => {
      if (savedPlace) {
        const response = await deleteSavedPlace(savedPlace.id);
        if (!response.success) {
          throw new SavedPlacesRequestError(response.error);
        }

        return { kind: "removed", savedPlaceId: savedPlace.id };
      }

      if (!historyId) {
        throw new SavedPlacesRequestError("추천 기록을 찾을 수 없습니다.");
      }

      const response = await saveSavedPlace({ historyId, placeData: place });
      if (!response.success) {
        throw new SavedPlacesRequestError(response.error);
      }

      return { kind: "saved", savedPlace: response.data.savedPlace };
    },
    onMutate: async ({ place, savedPlace }) => {
      await queryClient.cancelQueries({ queryKey: savedPlacesQueryKey });

      const previousSavedPlaces =
        queryClient.getQueryData<SavedRecommendationPlaceCacheItem[]>(savedPlacesQueryKey);
      const optimisticSavedPlaceId = savedPlace?.id ?? crypto.randomUUID();

      if (savedPlace) {
        queryClient.setQueryData<SavedRecommendationPlaceCacheItem[] | undefined>(
          savedPlacesQueryKey,
          (currentSavedPlaces) => removeSavedPlaceFromCache(currentSavedPlaces, savedPlace.id),
        );
      } else {
        const optimisticSavedPlace = {
          createdAt: new Date().toISOString(),
          historyId: historyId ?? null,
          id: optimisticSavedPlaceId,
          isBookmarked: true,
          placeData: place,
        } satisfies SavedRecommendationPlaceCacheItem;
        queryClient.setQueryData<SavedRecommendationPlaceCacheItem[]>(
          savedPlacesQueryKey,
          (currentSavedPlaces) => upsertSavedPlaceInCache(currentSavedPlaces, optimisticSavedPlace),
        );
      }

      setErrorMessage(null);
      return { optimisticSavedPlaceId, previousSavedPlaces };
    },
    onSuccess: (result, _variables, context) => {
      queryClient.setQueryData<SavedRecommendationPlaceCacheItem[]>(
        savedPlacesQueryKey,
        (currentSavedPlaces) => {
          const withoutOptimistic = removeSavedPlaceFromCache(
            currentSavedPlaces,
            context.optimisticSavedPlaceId,
          );
          return result.kind === "saved"
            ? upsertSavedPlaceInCache(withoutOptimistic, result.savedPlace)
            : removeSavedPlaceFromCache(withoutOptimistic, result.savedPlaceId);
        },
      );
    },
    onError: (_error, _variables, context) => {
      if (context !== undefined) {
        queryClient.setQueryData(savedPlacesQueryKey, context.previousSavedPlaces);
      }
      setErrorMessage("찜 상태를 변경하지 못했습니다. 다시 시도해 주세요.");
    },
  });

  const toggleBookmark = useCallback(
    (place: PlaceRecommendationItem) => {
      if (savedPlacesQuery.isPending || savedPlacesQuery.isError || bookmarkMutation.isPending) {
        return;
      }

      bookmarkMutation.mutate({
        place,
        savedPlace: savedPlaceByRecommendationId.get(place.id),
      });
    },
    [
      bookmarkMutation,
      savedPlaceByRecommendationId,
      savedPlacesQuery.isError,
      savedPlacesQuery.isPending,
    ],
  );

  const retry = useCallback(() => {
    setErrorMessage(null);
    void savedPlacesQuery.refetch();
  }, [savedPlacesQuery]);

  const contextValue = useMemo<PlaceRecommendationResultBookmarksContextType>(
    () => ({
      errorMessage:
        savedPlacesQuery.isError && errorMessage === null
          ? "찜 상태를 불러오지 못했습니다. 다시 시도해 주세요."
          : errorMessage,
      isBookmarkActionDisabled:
        savedPlacesQuery.isPending || savedPlacesQuery.isError || bookmarkMutation.isPending,
      isSaved: (recommendationId) =>
        findSavedPlaceByRecommendationId(savedPlaces, recommendationId) !== undefined,
      retry,
      toggleBookmark,
    }),
    [
      bookmarkMutation.isPending,
      errorMessage,
      retry,
      savedPlaces,
      savedPlacesQuery.isError,
      savedPlacesQuery.isPending,
      toggleBookmark,
    ],
  );

  return (
    <PlaceRecommendationResultBookmarksContext.Provider value={contextValue}>
      {children}
    </PlaceRecommendationResultBookmarksContext.Provider>
  );
};

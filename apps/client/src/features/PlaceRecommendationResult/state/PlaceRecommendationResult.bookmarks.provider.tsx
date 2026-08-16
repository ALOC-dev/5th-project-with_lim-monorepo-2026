import type { PlaceRecommendationItem } from "@monorepo/recommendation-engine/v1/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import {
  deleteSavedPlace,
  getSavedPlaces,
  saveSavedPlace,
  type SavedRecommendationPlace,
} from "../../../apis/server/savedPlaces";
import {
  findSavedPlaceByRecommendationId,
  removeSavedPlaceFromCache,
  savedPlacesQueryKey,
  upsertSavedPlaceInCache,
} from "../../SavedPlaces/savedPlaces.data";
import {
  PlaceRecommendationResultBookmarksContext,
  type PlaceRecommendationResultBookmarksContextType,
} from "./PlaceRecommendationResult.bookmarks.context";

type BookmarkMutationResult =
  | { readonly kind: "saved"; readonly savedPlace: SavedRecommendationPlace }
  | { readonly kind: "removed"; readonly savedPlaceId: string };

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
  const savedPlacesQuery = useQuery({
    queryKey: savedPlacesQueryKey,
    queryFn: requestSavedPlaces,
    retry: false,
  });
  const savedPlaces = savedPlacesQuery.data ?? [];
  const savedPlaceByRecommendationId = useMemo(
    () =>
      new Map(
        savedPlaces.map((savedPlace) => [savedPlace.placeData.id, savedPlace] as const),
      ),
    [savedPlaces],
  );
  const bookmarkMutation = useMutation({
    mutationFn: async ({
      place,
      savedPlace,
    }: {
      readonly place: PlaceRecommendationItem;
      readonly savedPlace: SavedRecommendationPlace | undefined;
    }): Promise<BookmarkMutationResult> => {
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
    onMutate: () => {
      setErrorMessage(null);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<SavedRecommendationPlace[]>(
        savedPlacesQueryKey,
        (currentSavedPlaces) =>
          result.kind === "saved"
            ? upsertSavedPlaceInCache(currentSavedPlaces, result.savedPlace)
            : removeSavedPlaceFromCache(currentSavedPlaces, result.savedPlaceId),
      );
    },
    onError: () => {
      setErrorMessage("찜 상태를 변경하지 못했습니다. 다시 시도해 주세요.");
      void queryClient.invalidateQueries({ queryKey: savedPlacesQueryKey });
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
    [bookmarkMutation, savedPlaceByRecommendationId, savedPlacesQuery.isError, savedPlacesQuery.isPending],
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
      savedPlaceByRecommendationId,
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

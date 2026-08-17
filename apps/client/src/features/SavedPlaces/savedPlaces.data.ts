import type { SavedRecommendationPlace } from "../../apis/server/savedPlaces";

export type SavedRecommendationPlaceCacheItem = SavedRecommendationPlace & {
  readonly isBookmarked?: boolean;
};

export const savedPlacesQueryKey = ["savedPlaces"] as const;

export const isSavedPlaceBookmarked = (savedPlace: SavedRecommendationPlaceCacheItem): boolean =>
  savedPlace.isBookmarked !== false;

export const findSavedPlaceByRecommendationId = (
  savedPlaces: readonly SavedRecommendationPlaceCacheItem[],
  recommendationId: string,
): SavedRecommendationPlaceCacheItem | undefined =>
  savedPlaces.find(
    (savedPlace) =>
      savedPlace.placeData.id === recommendationId && isSavedPlaceBookmarked(savedPlace),
  );

export const upsertSavedPlaceInCache = (
  savedPlaces: readonly SavedRecommendationPlaceCacheItem[] | undefined,
  nextSavedPlace: SavedRecommendationPlace,
): SavedRecommendationPlaceCacheItem[] => {
  if (savedPlaces === undefined) {
    return [nextSavedPlace];
  }

  const existingIndex = savedPlaces.findIndex(
    ({ id, placeData }) => id === nextSavedPlace.id || placeData.id === nextSavedPlace.placeData.id,
  );
  if (existingIndex === -1) {
    return [nextSavedPlace, ...savedPlaces];
  }

  return savedPlaces.map((savedPlace, index) =>
    index === existingIndex ? nextSavedPlace : savedPlace,
  );
};

export const removeSavedPlaceFromCache = (
  savedPlaces: readonly SavedRecommendationPlaceCacheItem[] | undefined,
  savedPlaceId: string,
): SavedRecommendationPlaceCacheItem[] | undefined =>
  savedPlaces?.filter(({ id }) => id !== savedPlaceId);

export const updateSavedPlaceBookmarkInCache = (
  savedPlaces: readonly SavedRecommendationPlaceCacheItem[] | undefined,
  recommendationId: string,
  isBookmarked: boolean,
  savedPlace?: SavedRecommendationPlace,
): SavedRecommendationPlaceCacheItem[] | undefined =>
  savedPlaces?.map((currentSavedPlace) => {
    if (currentSavedPlace.placeData.id !== recommendationId) return currentSavedPlace;

    if (savedPlace === undefined) {
      return { ...currentSavedPlace, isBookmarked };
    }

    return {
      ...currentSavedPlace,
      id: savedPlace.id,
      historyId: savedPlace.historyId,
      isBookmarked,
    };
  });

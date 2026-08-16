import type { SavedRecommendationPlace } from "../../apis/server/savedPlaces";

export const savedPlacesQueryKey = ["savedPlaces"] as const;

export const findSavedPlaceByRecommendationId = (
  savedPlaces: readonly SavedRecommendationPlace[],
  recommendationId: string,
): SavedRecommendationPlace | undefined =>
  savedPlaces.find((savedPlace) => savedPlace.placeData.id === recommendationId);

export const upsertSavedPlaceInCache = (
  savedPlaces: readonly SavedRecommendationPlace[] | undefined,
  nextSavedPlace: SavedRecommendationPlace,
): SavedRecommendationPlace[] => {
  if (savedPlaces === undefined) {
    return [nextSavedPlace];
  }

  const existingIndex = savedPlaces.findIndex(({ id }) => id === nextSavedPlace.id);
  if (existingIndex === -1) {
    return [nextSavedPlace, ...savedPlaces];
  }

  return savedPlaces.map((savedPlace) =>
    savedPlace.id === nextSavedPlace.id ? nextSavedPlace : savedPlace,
  );
};

export const removeSavedPlaceFromCache = (
  savedPlaces: readonly SavedRecommendationPlace[] | undefined,
  savedPlaceId: string,
): SavedRecommendationPlace[] | undefined =>
  savedPlaces?.filter(({ id }) => id !== savedPlaceId);

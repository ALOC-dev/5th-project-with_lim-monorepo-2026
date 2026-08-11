import { toNonEmptyText } from "./locationText";

export type PlaceCandidate = {
  readonly placeName: string;
  readonly roadNameAddress: string;
  readonly distanceMeters: number;
};

type PlaceCandidateSource = {
  readonly place_name?: string | null;
  readonly road_address_name?: string | null;
  readonly distance?: string | number | null;
};

/**
 * Chooses the nearest valid place returned from parallel category searches.
 * Null entries mean a category had no usable match, so they are filtered before comparing distance.
 */
export const selectNearestPlaceCandidate = (
  candidates: readonly (PlaceCandidate | null)[],
): PlaceCandidate | null => {
  return candidates.filter(isPlaceCandidate).reduce<PlaceCandidate | null>((nearest, candidate) => {
    if (!nearest || candidate.distanceMeters < nearest.distanceMeters) {
      return candidate;
    }

    return nearest;
  }, null);
};

/**
 * Normalizes one Kakao category-search result into a place candidate.
 * A selected coordinate should become a named place only when Kakao provides a name, road address,
 * and finite distance inside the same radius used for the category query.
 */
export const toPlaceCandidate = (
  place: PlaceCandidateSource | undefined,
  maximumDistanceMeters: number,
): PlaceCandidate | null => {
  const placeName = toNonEmptyText(place?.place_name);
  const roadNameAddress = toNonEmptyText(place?.road_address_name);
  const distanceMeters = Number(place?.distance);

  if (
    !placeName ||
    !roadNameAddress ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters > maximumDistanceMeters
  ) {
    return null;
  }

  return {
    placeName,
    roadNameAddress,
    distanceMeters,
  };
};

/**
 * Narrows nullable category-search results to concrete place candidates.
 * The nearest-place reducer relies on this predicate after failed categories have been filtered out.
 */
const isPlaceCandidate = (candidate: PlaceCandidate | null): candidate is PlaceCandidate => {
  return candidate !== null;
};

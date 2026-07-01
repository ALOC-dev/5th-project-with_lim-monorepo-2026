import {
  isLocationSearchPlace,
  toLocationSearchPlace,
} from "../utils/locationSearchPlace";
import type { LocationSearchPlace } from "../utils/locationSearchPlace";
import { toSearchLocationsFailure } from "../utils/locationSearchResult";
import type {
  LocationSearchFailureReason,
  SearchLocationsResult,
} from "../utils/locationSearchResult";
export { toLocationFromSearchPlace } from "../utils/locationSearchPlace";
export type { LocationSearchPlace } from "../utils/locationSearchPlace";
export type {
  LocationSearchFailureReason,
  SearchLocationsResult,
} from "../utils/locationSearchResult";

export type LocationSearchCoordinates = {
  readonly lat: number;
  readonly lng: number;
};

export type SearchLocationsByKeywordParams = {
  readonly query: string;
  readonly currentLocation: LocationSearchCoordinates;
  readonly size?: number;
  readonly radiusMeters?: number;
};

type PlacesKeywordSearchOptions = NonNullable<
  Parameters<kakao.maps.services.Places["keywordSearch"]>[2]
>;

const DEFAULT_SEARCH_SIZE = 10;

/**
 * Searches Kakao Places around the current map center and returns a typed UI-facing result.
 * This is the API boundary for keyword search: it trims user input, checks that the Kakao SDK
 * is loaded, translates Kakao status values into explicit failure reasons, and drops malformed
 * place rows before they can reach the rest of the recommendation form.
 */
export const searchLocationsByKeyword = ({
  query,
  currentLocation,
  size = DEFAULT_SEARCH_SIZE,
  radiusMeters,
}: SearchLocationsByKeywordParams): Promise<SearchLocationsResult> => {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return Promise.resolve(toSearchLocationsFailure("empty-query"));
  }

  if (!isKakaoPlacesReady()) {
    return Promise.resolve(toSearchLocationsFailure("sdk-unavailable"));
  }

  const places = new kakao.maps.services.Places();
  const options = toKeywordSearchOptions({
    currentLocation,
    radiusMeters,
    size,
  });

  return new Promise((resolve) => {
    places.keywordSearch(
      normalizedQuery,
      (results, status) => {
        switch (status) {
          case kakao.maps.services.Status.OK:
            resolve({
              kind: "success",
              places: results.map(toLocationSearchPlace).filter(isLocationSearchPlace),
            });
            return;
          case kakao.maps.services.Status.ZERO_RESULT:
            resolve(toSearchLocationsFailure("zero-result"));
            return;
          case kakao.maps.services.Status.ERROR:
            resolve(toSearchLocationsFailure("request-error"));
            return;
          default:
            resolve(toSearchLocationsFailure("request-error"));
        }
      },
      options,
    );
  });
};

type KeywordSearchOptionsParams = {
  readonly currentLocation: LocationSearchCoordinates;
  readonly radiusMeters?: number;
  readonly size: number;
};

/**
 * Builds Kakao's keyword-search options from our small domain object.
 * The API expects a Kakao LatLng instance and an optional radius; keeping that construction here
 * prevents UI components from depending on SDK-specific option names.
 */
const toKeywordSearchOptions = ({
  currentLocation,
  radiusMeters,
  size,
}: KeywordSearchOptionsParams): PlacesKeywordSearchOptions => {
  const location = new kakao.maps.LatLng(currentLocation.lat, currentLocation.lng);
  const baseOptions = {
    location,
    size,
    sort: kakao.maps.services.SortBy.DISTANCE,
  };

  if (radiusMeters === undefined) {
    return baseOptions;
  }

  return {
    ...baseOptions,
    radius: radiusMeters,
  };
};

/**
 * Verifies the specific Kakao Places APIs used by this adapter are present before calling them.
 * Kakao is provided as a browser global, so this guard turns a missing script or partially loaded
 * SDK into a typed failure instead of a runtime exception.
 */
const isKakaoPlacesReady = (): boolean => {
  return (
    typeof kakao !== "undefined" &&
    typeof kakao.maps.LatLng === "function" &&
    typeof kakao.maps.services !== "undefined" &&
    typeof kakao.maps.services.Places === "function" &&
    typeof kakao.maps.services.SortBy !== "undefined"
  );
};

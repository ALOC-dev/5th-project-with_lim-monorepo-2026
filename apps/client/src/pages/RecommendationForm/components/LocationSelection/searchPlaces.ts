import type { Location } from "./LocationSelectionBottomSheet";

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

export type LocationSearchPlace = {
  readonly id: string;
  readonly placeName: string;
  readonly roadNameAddress: string;
  readonly lat: number;
  readonly lng: number;
  readonly distanceMeters?: number;
};

export type LocationSearchFailureReason =
  | "empty-query"
  | "sdk-unavailable"
  | "zero-result"
  | "request-error";

export type SearchLocationsResult =
  | {
      readonly kind: "success";
      readonly places: readonly LocationSearchPlace[];
    }
  | {
      readonly kind: "failure";
      readonly reason: LocationSearchFailureReason;
    };

type PlacesKeywordSearchCallback = Parameters<kakao.maps.services.Places["keywordSearch"]>[1];
type PlacesKeywordSearchResults = Parameters<PlacesKeywordSearchCallback>[0];
type PlacesKeywordSearchResultItem = PlacesKeywordSearchResults[number];
type PlacesKeywordSearchOptions = NonNullable<
  Parameters<kakao.maps.services.Places["keywordSearch"]>[2]
>;

const DEFAULT_SEARCH_SIZE = 10;

export const searchLocationsByKeyword = ({
  query,
  currentLocation,
  size = DEFAULT_SEARCH_SIZE,
  radiusMeters,
}: SearchLocationsByKeywordParams): Promise<SearchLocationsResult> => {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return Promise.resolve(toFailure("empty-query"));
  }

  if (!isKakaoPlacesReady()) {
    return Promise.resolve(toFailure("sdk-unavailable"));
  }

  const places = new kakao.maps.services.Places();
  const options = toKeywordSearchOptions({
    currentLocation,
    radiusMeters,
    size,
  });

  return new Promise((resolve) => {
    places.keywordSearch(normalizedQuery, (results, status) => {
      switch (status) {
        case kakao.maps.services.Status.OK:
          resolve({
            kind: "success",
            places: results.map(toLocationSearchPlace).filter(isLocationSearchPlace),
          });
          return;
        case kakao.maps.services.Status.ZERO_RESULT:
          resolve(toFailure("zero-result"));
          return;
        case kakao.maps.services.Status.ERROR:
          resolve(toFailure("request-error"));
          return;
        default:
          resolve(toFailure("request-error"));
      }
    }, options);
  });
};

export const toLocationFromSearchPlace = ({
  lat,
  lng,
  placeName,
  roadNameAddress,
}: LocationSearchPlace): Location => ({
  lat,
  lng,
  placeName,
  roadNameAddress,
});

type KeywordSearchOptionsParams = {
  readonly currentLocation: LocationSearchCoordinates;
  readonly radiusMeters?: number;
  readonly size: number;
};

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

const isKakaoPlacesReady = (): boolean => {
  return (
    typeof kakao !== "undefined" &&
    typeof kakao.maps.LatLng === "function" &&
    typeof kakao.maps.services !== "undefined" &&
    typeof kakao.maps.services.Places === "function" &&
    typeof kakao.maps.services.SortBy !== "undefined"
  );
};

const toLocationSearchPlace = (
  place: PlacesKeywordSearchResultItem,
): LocationSearchPlace | null => {
  const id = toNonEmptyText(place.id);
  const placeName = toNonEmptyText(place.place_name);
  const roadNameAddress =
    toNonEmptyText(place.road_address_name) ?? toNonEmptyText(place.address_name);
  const lat = toFiniteNumber(place.y);
  const lng = toFiniteNumber(place.x);

  if (!id || !placeName || !roadNameAddress || lat === null || lng === null) {
    return null;
  }

  const distanceMeters = toFiniteNumber(place.distance);

  if (distanceMeters === null) {
    return {
      id,
      placeName,
      roadNameAddress,
      lat,
      lng,
    };
  }

  return {
    id,
    placeName,
    roadNameAddress,
    lat,
    lng,
    distanceMeters,
  };
};

const isLocationSearchPlace = (
  place: LocationSearchPlace | null,
): place is LocationSearchPlace => {
  return place !== null;
};

const toFailure = (reason: LocationSearchFailureReason): SearchLocationsResult => ({
  kind: "failure",
  reason,
});

const toFiniteNumber = (value: string | number | null | undefined): number | null => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return numericValue;
};

const toNonEmptyText = (value: string | null | undefined): string | null => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue;
};

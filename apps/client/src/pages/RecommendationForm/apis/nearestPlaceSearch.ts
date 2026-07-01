import {
  selectNearestPlaceCandidate,
  toPlaceCandidate,
} from "../utils/placeCandidate";
import type { PlaceCandidate } from "../utils/placeCandidate";

type PlaceCategoryCode = Parameters<kakao.maps.services.Places["categorySearch"]>[0];

export type { PlaceCandidate } from "../utils/placeCandidate";

export type NearestPlaceCoordinates = {
  readonly lat: number;
  readonly lng: number;
};

const PLACE_SEARCH_RADIUS_METERS = 50;
const PLACE_CATEGORY_CODES = [
  "MT1",
  "CS2",
  "PS3",
  "SC4",
  "AC5",
  "PK6",
  "OL7",
  "SW8",
  "BK9",
  "CT1",
  "AG2",
  "PO3",
  "AT4",
  "AD5",
  "FD6",
  "CE7",
  "HP8",
  "PM9",
] as const satisfies readonly PlaceCategoryCode[];

/**
 * Searches all configured Kakao place categories near the map center and picks the closest match.
 * A missing Places SDK is treated as "no candidate" because address fallback can still resolve a
 * usable location label.
 */
export const searchNearestPlace = (
  params: NearestPlaceCoordinates,
): Promise<PlaceCandidate | null> => {
  if (!isKakaoPlacesReady()) {
    return Promise.resolve(null);
  }

  const places = new kakao.maps.services.Places();

  return Promise.all(
    PLACE_CATEGORY_CODES.map((categoryCode) =>
      searchNearestPlaceByCategory({
        categoryCode,
        params,
        places,
      }),
    ),
  ).then(selectNearestPlaceCandidate);
};

/**
 * Checks the Kakao Places API required for the named-place lookup.
 * Place lookup is an enhancement over reverse geocoding, so callers can safely fall back when this
 * returns false.
 */
const isKakaoPlacesReady = (): boolean => {
  return (
    typeof kakao !== "undefined" &&
    typeof kakao.maps.services !== "undefined" &&
    typeof kakao.maps.services.Places === "function"
  );
};

type SearchNearestPlaceByCategoryParams = {
  readonly categoryCode: PlaceCategoryCode;
  readonly params: NearestPlaceCoordinates;
  readonly places: kakao.maps.services.Places;
};

/**
 * Performs one category-scoped Kakao nearby-place query.
 * The query is intentionally narrow: one nearest result within the small radius is enough to decide
 * whether the selected coordinate should display a place name.
 */
const searchNearestPlaceByCategory = ({
  categoryCode,
  params,
  places,
}: SearchNearestPlaceByCategoryParams): Promise<PlaceCandidate | null> => {
  return new Promise((resolve) => {
    places.categorySearch(
      categoryCode,
      (results, status) => {
        switch (status) {
          case kakao.maps.services.Status.OK:
            resolve(toPlaceCandidate(results[0], PLACE_SEARCH_RADIUS_METERS));
            return;
          case kakao.maps.services.Status.ZERO_RESULT:
          case kakao.maps.services.Status.ERROR:
            resolve(null);
            return;
          default:
            resolve(null);
        }
      },
      {
        radius: PLACE_SEARCH_RADIUS_METERS,
        size: 1,
        sort: kakao.maps.services.SortBy.DISTANCE,
        x: params.lng,
        y: params.lat,
      },
    );
  });
};

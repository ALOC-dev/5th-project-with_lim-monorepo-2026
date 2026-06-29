export type ReverseGeocodeCoordinates = {
  readonly lat: number;
  readonly lng: number;
};

export type ResolveSelectedLocationParams = ReverseGeocodeCoordinates;

export type ResolveSelectedLocationFailureReason =
  | "sdk-unavailable"
  | "zero-result"
  | "request-error"
  | "address-unavailable";

export type ResolveSelectedLocationResult =
  | {
      readonly kind: "place";
      readonly placeName: string;
      readonly roadNameAddress: string;
    }
  | {
      readonly kind: "address";
      readonly roadNameAddress: string;
    }
  | {
      readonly kind: "failure";
      readonly reason: ResolveSelectedLocationFailureReason;
    };

type Coord2AddressCallback = Parameters<kakao.maps.services.Geocoder["coord2Address"]>[2];
type Coord2AddressDocuments = Parameters<Coord2AddressCallback>[0];
type PlacesCategorySearchCallback = Parameters<kakao.maps.services.Places["categorySearch"]>[1];
type PlacesSearchResult = Parameters<PlacesCategorySearchCallback>[0];
type PlacesSearchResultItem = PlacesSearchResult[number];
type PlaceCategoryCode = Parameters<kakao.maps.services.Places["categorySearch"]>[0];

type PlaceCandidate = {
  readonly placeName: string;
  readonly roadNameAddress: string;
  readonly distanceMeters: number;
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

export const resolveSelectedLocation = async (
  params: ResolveSelectedLocationParams,
): Promise<ResolveSelectedLocationResult> => {
  const placeCandidate = await searchNearestPlace(params);

  if (placeCandidate) {
    return {
      kind: "place",
      placeName: placeCandidate.placeName,
      roadNameAddress: placeCandidate.roadNameAddress,
    };
  }

  return reverseGeocode(params);
};

const reverseGeocode = (
  coordinates: ReverseGeocodeCoordinates,
): Promise<ResolveSelectedLocationResult> => {
  if (!isKakaoGeocoderReady()) {
    return Promise.resolve(toFailure("sdk-unavailable"));
  }

  const geocoder = new kakao.maps.services.Geocoder();

  return new Promise((resolve) => {
    geocoder.coord2Address(
      coordinates.lng,
      coordinates.lat,
      (documents, status) => {
        switch (status) {
          case kakao.maps.services.Status.OK:
            resolve(selectAddressName(documents));
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
      },
      {
        input_coord: kakao.maps.services.Coords.WGS84,
      },
    );
  });
};

const isKakaoGeocoderReady = (): boolean => {
  return (
    typeof kakao !== "undefined" &&
    typeof kakao.maps.services !== "undefined" &&
    typeof kakao.maps.services.Geocoder === "function"
  );
};

const isKakaoPlacesReady = (): boolean => {
  return (
    typeof kakao !== "undefined" &&
    typeof kakao.maps.services !== "undefined" &&
    typeof kakao.maps.services.Places === "function"
  );
};

const searchNearestPlace = (
  params: ResolveSelectedLocationParams,
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

type SearchNearestPlaceByCategoryParams = {
  readonly categoryCode: PlaceCategoryCode;
  readonly params: ResolveSelectedLocationParams;
  readonly places: kakao.maps.services.Places;
};

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
            resolve(toPlaceCandidate(results[0]));
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

const selectNearestPlaceCandidate = (
  candidates: readonly (PlaceCandidate | null)[],
): PlaceCandidate | null => {
  return candidates.filter(isPlaceCandidate).reduce<PlaceCandidate | null>((nearest, candidate) => {
    if (!nearest || candidate.distanceMeters < nearest.distanceMeters) {
      return candidate;
    }

    return nearest;
  }, null);
};

const isPlaceCandidate = (candidate: PlaceCandidate | null): candidate is PlaceCandidate => {
  return candidate !== null;
};

const toPlaceCandidate = (place: PlacesSearchResultItem | undefined): PlaceCandidate | null => {
  const placeName = toNonEmptyText(place?.place_name);
  const roadNameAddress = toNonEmptyText(place?.road_address_name);
  const distanceMeters = Number(place?.distance);

  if (
    !placeName ||
    !roadNameAddress ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters > PLACE_SEARCH_RADIUS_METERS
  ) {
    return null;
  }

  return {
    placeName,
    roadNameAddress,
    distanceMeters,
  };
};

const selectAddressName = (documents: Coord2AddressDocuments): ResolveSelectedLocationResult => {
  const firstDocument = documents[0];
  const roadNameAddress = toNonEmptyText(firstDocument?.road_address?.address_name);

  if (!roadNameAddress) {
    return toFailure("address-unavailable");
  }

  return {
    kind: "address",
    roadNameAddress,
  };
};

const toFailure = (
  reason: ResolveSelectedLocationFailureReason,
): ResolveSelectedLocationResult => ({
  kind: "failure",
  reason,
});

const toNonEmptyText = (value: string | null | undefined): string | null => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue;
};

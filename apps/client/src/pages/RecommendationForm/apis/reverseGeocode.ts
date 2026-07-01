import type {
  ResolveSelectedLocationParams,
  ResolveSelectedLocationResult,
  ReverseGeocodeCoordinates,
} from "../utils/selectedLocationResult";
import {
  selectAddressName,
  toResolveSelectedLocationFailure,
} from "../utils/selectedLocationResult";
import { searchNearestPlace } from "./nearestPlaceSearch";

export type {
  ResolveSelectedLocationFailureReason,
  ResolveSelectedLocationParams,
  ResolveSelectedLocationResult,
  ReverseGeocodeCoordinates,
} from "../utils/selectedLocationResult";

/**
 * Resolves the selected map center into displayable location text.
 * The form prefers a nearby named place when Kakao Places can find one within the configured
 * radius, then falls back to reverse geocoding so the UI can still show an address-only result.
 */
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

/**
 * Calls Kakao reverse geocoding for raw coordinates.
 * This adapter owns the SDK status mapping and returns a typed failure instead of throwing when
 * Kakao reports no address, a request error, or an unavailable browser global.
 */
const reverseGeocode = (
  coordinates: ReverseGeocodeCoordinates,
): Promise<ResolveSelectedLocationResult> => {
  if (!isKakaoGeocoderReady()) {
    return Promise.resolve(toResolveSelectedLocationFailure("sdk-unavailable"));
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
            resolve(toResolveSelectedLocationFailure("zero-result"));
            return;
          case kakao.maps.services.Status.ERROR:
            resolve(toResolveSelectedLocationFailure("request-error"));
            return;
          default:
            resolve(toResolveSelectedLocationFailure("request-error"));
        }
      },
      {
        input_coord: kakao.maps.services.Coords.WGS84,
      },
    );
  });
};

/**
 * Checks only the Kakao Geocoder API required by reverse geocoding.
 * Kakao loads through a global script, so this guard keeps missing or partially loaded SDK state
 * from escaping as an uncaught runtime error.
 */
const isKakaoGeocoderReady = (): boolean => {
  return (
    typeof kakao !== "undefined" &&
    typeof kakao.maps.services !== "undefined" &&
    typeof kakao.maps.services.Geocoder === "function"
  );
};

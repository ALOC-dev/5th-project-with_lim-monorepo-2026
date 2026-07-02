import type {
  ResolveSelectedLocationParams,
  ResolveSelectedLocationResult,
  ReverseGeocodeCoordinates,
} from "../../pages/RecommendationForm/utils/selectedLocationResult";
import {
  selectAddressName,
  toResolveSelectedLocationFailure,
} from "../../pages/RecommendationForm/utils/selectedLocationResult";
import { searchNearestPlace } from "./nearestPlaceSearch";

export type {
  ResolveSelectedLocationFailureReason,
  ResolveSelectedLocationParams,
  ResolveSelectedLocationResult,
  ReverseGeocodeCoordinates,
} from "../../pages/RecommendationForm/utils/selectedLocationResult";

/**
 * 지도 중심 좌표를 지도 아래에 표시할 위치 라벨로 변환한다.
 *
 * 흐름:
 * 1. 먼저 좁은 반경의 주변 POI를 찾는다. Kakao가 도로명주소를 가진 유효한 장소를 찾으면
 *    UI는 `도로명주소 · POI명` 형태로 표시할 수 있다.
 * 2. 적절한 POI가 없으면 Kakao Geocoder로 해당 좌표의 도로명주소를 조회한다.
 * 3. Kakao가 앱에서 쓸 수 없는 주소 데이터만 반환하면 typed failure를 반환하고,
 *    UI는 선택 완료를 막는다.
 *
 * 이 순서가 중요하다. 마커가 역/건물 위에 있을 때는 POI명이 유용하지만,
 * 기본 표시는 도로명주소가 안정적이다. 지번주소는 이 adapter 밖으로 노출하지 않는다.
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
 * Kakao reverse geocoding 결과를 추천 폼의 selected-location result union으로 변환한다.
 *
 * Kakao SDK 문맥:
 * - `kakao.maps.services.Geocoder`는 Maps SDK가 `libraries=services`로 로드된 경우에만 존재한다.
 * - `coord2Address(lng, lat, callback, options)`는 경도를 먼저, 위도를 나중에 받는다.
 * - callback은 주소 document 목록과 `Status.OK`, `ZERO_RESULT`, `ERROR` 중 하나를 함께 받는다.
 * - `input_coord: Coords.WGS84`는 입력 좌표가 일반 GPS 위도/경도 체계라는 뜻이다.
 *
 * Adapter 정책:
 * - `selectAddressName`은 `road_address.address_name`만 유효한 주소로 인정한다.
 * - 지번주소 fallback은 의도적으로 사용하지 않는다.
 * - SDK 미로드나 Kakao status 실패는 exception이 아니라 typed result로 반환한다.
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
      // Kakao Geocoder는 `new kakao.maps.LatLng(lat, lng)`와 달리 `(lng, lat)` 순서를 쓴다.
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
        // WGS84는 브라우저 지도에서 흔히 쓰는 일반 위도/경도 좌표계다.
        input_coord: kakao.maps.services.Coords.WGS84,
      },
    );
  });
};

/**
 * reverse geocoding에 필요한 SDK surface만 확인하는 runtime guard.
 * 전역 타입은 compile time에 있어도, script 로딩 실패 시 runtime에는 없을 수 있다.
 */
const isKakaoGeocoderReady = (): boolean => {
  return (
    typeof kakao !== "undefined" &&
    typeof kakao.maps.services !== "undefined" &&
    typeof kakao.maps.services.Geocoder === "function"
  );
};

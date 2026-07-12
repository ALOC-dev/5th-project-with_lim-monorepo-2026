import {
  isLocationSearchPlace,
  toLocationSearchPlace,
} from "../../pages/RecommendationForm/utils/locationSearchPlace";
import type { SearchLocationsResult } from "../../pages/RecommendationForm/utils/locationSearchResult";
import { toSearchLocationsFailure } from "../../pages/RecommendationForm/utils/locationSearchResult";

export type { LocationSearchPlace } from "../../pages/RecommendationForm/utils/locationSearchPlace";
export { toLocationFromSearchPlace } from "../../pages/RecommendationForm/utils/locationSearchPlace";
export type {
  LocationSearchFailureReason,
  SearchLocationsResult,
} from "../../pages/RecommendationForm/utils/locationSearchResult";

export type LocationSearchCoordinates = {
  readonly lat: number;
  readonly lng: number;
};

export type SearchLocationsByKeywordParams = {
  /** 사용자가 입력한 검색어. 빈 검색어는 Kakao SDK를 호출하기 전에 실패로 처리한다. */
  readonly query: string;
  /** Kakao가 주변 검색 결과의 거리를 계산할 기준 좌표. */
  readonly currentLocation: LocationSearchCoordinates;
  /** Kakao Places에 넘길 검색 결과 개수. 생략하면 이 adapter의 기본값을 쓴다. */
  readonly size?: number;
  /** Kakao 검색 반경. 단위는 미터이고, 생략하면 Kakao가 자체 검색 범위를 적용한다. */
  readonly radiusMeters?: number;
};

/**
 * `keywordSearch`의 option 객체 타입은 Kakao 타입 패키지에 이미 정의되어 있다.
 * 로컬에서 비슷한 타입을 다시 만들면 벤더 정의와 어긋날 수 있으므로,
 * SDK 메서드 시그니처에서 세 번째 파라미터 타입을 직접 뽑아 쓴다.
 */
type PlacesKeywordSearchOptions = NonNullable<
  Parameters<kakao.maps.services.Places["keywordSearch"]>[2]
>;

const DEFAULT_SEARCH_SIZE = 10;

/**
 * Kakao Places 키워드 검색을 수행하고 추천 폼에서 쓰는 안정적인 result union으로 변환한다.
 *
 * Kakao SDK 문맥:
 * - `kakao.maps.services.Places`는 Maps SDK가 `libraries=services`로 로드된 경우에만 존재한다.
 * - `keywordSearch(keyword, callback, options)`는 Promise가 아니라 callback 기반 API다.
 * - callback은 Kakao 원본 장소 row와 `kakao.maps.services.Status` 값을 함께 받는다.
 * - `Status.OK`는 사용 가능한 결과가 있다는 뜻이다.
 * - `Status.ZERO_RESULT`는 요청은 성공했지만 검색 결과가 없다는 뜻이다.
 * - `Status.ERROR`는 Kakao가 검색 요청을 실패로 처리했다는 뜻이다.
 *
 * Adapter 정책:
 * - UI에는 Kakao 원본 row를 그대로 넘기지 않는다.
 * - 빈 검색어와 SDK 미로드 상태는 명시적인 typed failure로 반환한다.
 * - 필수 필드가 부족한 row는 `toLocationSearchPlace`에서 걸러낸다.
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

  // Kakao는 `(results, status, pagination)` 형태로 callback을 호출한다.
  // 현재 UI는 pagination을 쓰지 않으므로 이 adapter에서는 results/status만 매핑한다.
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
 * 앱 좌표를 Kakao keywordSearch option 객체로 변환한다.
 *
 * 좌표 이름이 가장 헷갈리기 쉽다.
 * - 우리 앱은 `{ lat, lng }`로 저장한다.
 * - Kakao `LatLng` 생성자는 `(lat, lng)` 순서로 받는다.
 * - 반대로 Kakao 장소 검색 결과 row는 `{ y, x }`로 돌아오며, `y`가 위도이고 `x`가 경도다.
 *   이 row 정규화는 `toLocationSearchPlace`에서 처리한다.
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
 * 이 파일이 실제로 사용하는 Kakao SDK 심볼만 확인하는 런타임 guard.
 *
 * Kakao SDK는 `<script>` 태그로 주입되는 브라우저 전역 객체다.
 * 그래서 TypeScript 타입은 알아도 런타임에는 아직 `kakao` 객체가 없을 수 있다.
 * 컴포넌트 렌더/업데이트 중 `ReferenceError`를 던지는 대신 typed failure를 반환하기 위해 둔다.
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

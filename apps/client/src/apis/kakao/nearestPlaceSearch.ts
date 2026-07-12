import type { PlaceCandidate } from "../../pages/RecommendationForm/utils/placeCandidate";
import {
  selectNearestPlaceCandidate,
  toPlaceCandidate,
} from "../../pages/RecommendationForm/utils/placeCandidate";

/**
 * category code는 Kakao가 장소를 대분류하는 코드다.
 * 예를 들면 지하철역, 편의점, 공공기관, 음식점, 카페, 병원 같은 분류가 여기에 해당한다.
 *
 * 이 타입은 `Places["categorySearch"]` 메서드의 첫 번째 인자에서 직접 뽑아 쓴다.
 * 이렇게 하면 category code 목록이 임의의 `string[]`이 아니라 벤더 메서드가 받는 타입으로 검증된다.
 */
type PlaceCategoryCode = Parameters<kakao.maps.services.Places["categorySearch"]>[0];

export type { PlaceCandidate } from "../../pages/RecommendationForm/utils/placeCandidate";

export type NearestPlaceCoordinates = {
  readonly lat: number;
  readonly lng: number;
};

const PLACE_SEARCH_RADIUS_METERS = 50;

/**
 * 사용자가 지도 중심점을 선택했을 때 주변 POI 탐색에 사용할 Kakao category 목록.
 *
 * Kakao는 “이 좌표에서 가장 의미 있는 POI 하나”를 바로 주는 단일 API를 제공하지 않는다.
 * 그래서 실제로 쓸 만한 category들을 좁은 반경으로 각각 조회한 뒤,
 * 유효한 row 중 가장 가까운 항목만 남긴다.
 * 반경을 작게 둔 이유는 멀리 있는 POI가 단순 도로명주소 표시를 대체하지 않게 하기 위해서다.
 */
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
 * 선택된 좌표 주변에서 가장 가까운 이름 있는 장소를 찾는다.
 *
 * Kakao SDK 문맥:
 * - `categorySearch(categoryCode, callback, options)`는 callback 기반 API다.
 * - 영역 기반 검색에는 `location`, `bounds`, 지도 기반 옵션, 또는 명시적인 `x`/`y` 좌표가 필요하다.
 * - 여기서는 Kakao option 좌표명이 x/y이므로 `x: lng`, `y: lat`로 넘긴다.
 * - `Status.OK`여도 앱에서 쓸 수 없는 row가 섞일 수 있다.
 *   이름, 도로명주소, 유한한 거리값이 있는지는 row 정규화 단계에서 다시 판단한다.
 *
 * Adapter 정책:
 * - 이 조회는 reverse geocoding 위에 얹는 보조 기능이다.
 * - SDK가 없거나 적절한 POI가 없으면 `null`을 반환하고, 호출자는 도로명주소 조회로 fallback한다.
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
 * category search에 필요한 Kakao `Places` 생성자만 확인한다.
 * SDK 로딩 실패나 도메인 키 설정 문제를 uncaught runtime error로 터뜨리지 않기 위한 guard다.
 */
const isKakaoPlacesReady = (): boolean => {
  return (
    typeof kakao !== "undefined" &&
    typeof kakao.maps.services !== "undefined" &&
    typeof kakao.maps.services.Places === "function"
  );
};

type SearchNearestPlaceByCategoryParams = {
  /** `SW8`은 지하철, `FD6`은 음식점처럼 Kakao가 정의한 category code 하나. */
  readonly categoryCode: PlaceCategoryCode;
  /** 앱에서 쓰는 WGS84 좌표. Kakao 요청 경계에서 `x`/`y`로 변환한다. */
  readonly params: NearestPlaceCoordinates;
  /** 여러 category 검색에서 재사용할 Kakao Places 인스턴스. category마다 새로 만들 필요가 없다. */
  readonly places: kakao.maps.services.Places;
};

/**
 * 하나의 category에 대해 주변 검색을 한 번 수행한다.
 *
 * `size: 1`은 해당 category에서 가장 가까운 row 하나만 요청한다는 뜻이다.
 * 모든 category 검색이 끝나면 `selectNearestPlaceCandidate`가 category 간 거리값을 비교해
 * 최종 후보 하나를 고른다.
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
        // Kakao radius 단위는 미터다. 후보 검증 기준과 같은 값을 유지한다.
        radius: PLACE_SEARCH_RADIUS_METERS,
        size: 1,
        sort: kakao.maps.services.SortBy.DISTANCE,
        // Kakao option 좌표는 x/y 이름을 쓴다. x는 경도, y는 위도다.
        x: params.lng,
        y: params.lat,
      },
    );
  });
};

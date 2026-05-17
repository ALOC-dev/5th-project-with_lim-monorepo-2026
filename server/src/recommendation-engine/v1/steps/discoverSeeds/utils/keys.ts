import type { LocalSeed } from "../vendors/types.js";
import type { SearchQuery } from "../types.js";

// discoverSeeds에서 사용하는 두 종류의 key를 생성하는 모듈.
//
// - seedKey: 동일 장소를 가리키는 LocalSeed들을 한 식별자로 묶기 위한 key.
//            dedupeAndExclude와 visitedSearchKeys 추적의 기준이 된다.
// - searchKey: 같은 provider 호출이 중복되는 것을 막기 위한 key.
//              query/page/location 조합으로 만들어 visited 처리에 쓴다.

// LocalSeed 내부 문자열(이름/주소)을 비교 가능한 형태로 정규화한다.
// provider별 표기 차이(공백, 대소문자)를 흡수해 같은 장소를 같은 key로 만든다.
const normalizeSeedText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/gu, " ");

// 검색어를 정규화한다. searchKey 생성과 alternative query 중복 판정에 함께 쓰이도록 export.
export const normalizeSearchText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/gu, " ");

// 위치 옵션을 searchKey 내 식별 가능한 짧은 문자열로 변환한다.
// 좌표를 소수 5자리(~1m 단위)로 잘라 인접 좌표 변동에 따른 무의미한 변동을 줄인다.
const getLocationBucket = (location: SearchQuery["location"]): string => {
  if (!location) return "none";

  return [
    location.longitude.toFixed(5),
    location.latitude.toFixed(5),
    `r=${location.radiusKm}`,
  ].join(",");
};

// provider 응답의 LocalSeed 1건을 안정적인 식별자로 환원한다.
// provider ID가 있으면 가장 신뢰도 높은 key로 쓰고,
// 없으면 이름/주소/좌표 조합으로 fallback해 dedupe 정확도를 유지한다.
export const getSeedKey = (seed: LocalSeed): string => {
  if (seed.providerPlaceId) {
    return `${seed.provider}:${seed.providerPlaceId}`;
  }

  return [
    seed.provider,
    normalizeSeedText(seed.name),
    normalizeSeedText(seed.roadAddress || seed.address),
    seed.longitude.toFixed(5),
    seed.latitude.toFixed(5),
  ].join("|");
};

// SearchQuery 1건을 provider 호출 단위로 식별하기 위한 key를 만든다.
// "이 검색은 같은 검색면을 또 가져온다"를 판정하는 기준으로 사용한다.
export const getSearchKey = ({
  query,
  page,
  location,
}: Pick<SearchQuery, "query" | "page" | "location">): string =>
  [
    "tmap",
    normalizeSearchText(query),
    `page=${page}`,
    `loc=${getLocationBucket(location)}`,
  ].join(":");

import type { UserInput } from "../interfaces/input.contracts.js";

export type Coordinate = { lat: number; lng: number };

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const toDistanceMeters = (from: Coordinate, to: Coordinate): number => {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

  return Math.round(EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/**
 * 검색과 거리 판정의 기준점.
 *
 * 예전에는 `userInput.location[0]`(첫 참여자)만 썼다. 그래서 여러 명이 모이는
 * 요청에서도 **첫 사람 주변만** 탐색했고, 중간 지점은 출력 컨텍스트를 만들 때만
 * 계산하고 정작 탐색에는 쓰지 않았다. 모두의 중간에서 찾도록 무게중심을 쓴다.
 */
export const toSearchCenter = (userInput: UserInput): Coordinate | undefined => {
  const origins = userInput.location;
  if (origins.length === 0) return undefined;

  return {
    lat: origins.reduce((sum, origin) => sum + origin.lat, 0) / origins.length,
    lng: origins.reduce((sum, origin) => sum + origin.lng, 0) / origins.length,
  };
};

/** 참여자들이 얼마나 흩어져 있는지. 중심에서 가장 먼 참여자까지의 거리(m). */
export const toOriginSpreadMeters = (userInput: UserInput): number => {
  const center = toSearchCenter(userInput);
  if (!center) return 0;

  return userInput.location.reduce(
    (max, origin) => Math.max(max, toDistanceMeters(center, origin)),
    0,
  );
};

/**
 * 한 명일 때의 기본 반경. 서울 주요 지역 실좌표로 보정한 값이다.
 *
 * 같은 생활권으로 묶여야 하는 쌍의 최대 거리와, 사용자가 다른 동네로 인식하는
 * 쌍의 최소 거리 사이에 허용 거리를 둬야 한다.
 *
 *   같은 생활권 최대   1,345m  (성수-건대입구, 홍대입구-합정 1,273m)
 *   다른 동네 최소     2,021m  (강남-선릉, 혜화-종각 2,127m)
 *
 * 반경 1,500m → 허용 1,800m가 그 사이에 들어간다. 넓히면 혜화 요청에 종각이
 * 다시 섞이고, 좁히면 홍대 요청에서 합정이 잘린다. 실제 검증은 테스트에 있다.
 */
export const BASE_SEARCH_RADIUS_METERS = 1_500;
/** 반경 상한. 이보다 넓히면 "혜화 요청에 종각 결과" 문제가 다시 생긴다. */
export const MAX_SEARCH_RADIUS_METERS = 6_000;
/**
 * 후보 허용 거리는 검색 반경보다 약간 넓게 둔다.
 * 검색 API의 반경은 근사치라 경계 근처 결과가 조금 넘어오는데, 그것까지
 * 전부 버리면 경계에 있는 좋은 장소를 놓친다.
 */
const DISTANCE_GATE_SLACK = 1.2;

/**
 * 참여자 분포에 맞춰 검색 반경을 정한다.
 *
 * 고정 5km는 한 명이 혜화에서 요청해도 종각까지 훑는다. 실제로 "혜화에서 요청했는데
 * 종각이 나온다"는 문제가 이 상수 하나에서 나왔다. 혼자면 좁게 잡고, 여러 명이
 * 멀리 흩어져 있을 때만 그 분포에 비례해 넓힌다.
 */
export const toSearchRadiusMeters = (userInput: UserInput, widenStep = 0): number => {
  const spread = toOriginSpreadMeters(userInput);
  const base = Math.max(BASE_SEARCH_RADIUS_METERS, spread + BASE_SEARCH_RADIUS_METERS);
  // 재시도로 넓힐 때마다 1.6배. 후보가 부족할 때만 발동한다.
  return Math.min(MAX_SEARCH_RADIUS_METERS, Math.round(base * 1.6 ** widenStep));
};

export const toMaxCandidateDistanceMeters = (radiusMeters: number): number =>
  Math.round(radiusMeters * DISTANCE_GATE_SLACK);

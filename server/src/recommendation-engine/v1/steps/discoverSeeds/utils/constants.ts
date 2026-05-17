// discoverSeeds 내부에서만 공유되는 상수/매직넘버를 한 곳에서 관리한다.
// 외부 모듈에서 참조할 필요가 없는 값들이므로 discoverSeeds/utils 안에 둔다.

// 사용자 입력에 별도 반경이 없을 때 provider 검색에 사용하는 기본 반경(km).
export const DEFAULT_RADIUS_KM = 5;

// approach 1개당 provider에 최소 몇 개의 seed를 요청할지 정한 하한선.
// weight 분배 결과가 너무 적게 떨어져도 이 값은 보장한다.
export const MIN_SEEDS_PER_APPROACH = 5;

// 동일 검색어/page/location 조합이 이미 사용되었을 때
// page 또는 alternative query로 몇 번까지 우회를 시도할지 정한 상한.
// DiscoveryPlanBuilder가 한 plan을 만들 때 query마다 적용하는 횟수다.
export const MAX_ALTERNATIVE_SEARCH_ATTEMPTS = 5;

// 한 번의 discoverSeeds 호출 안에서 "plan 재빌드 + provider 재호출" 사이클을 몇 번까지 돌릴지 정한 상한.
// 첫 plan 실행 후 누적 seed가 targetSeedCount에 못 미치면 visited 키를 늘려가며 이만큼 더 시도한다.
// 도달하면 미달이어도 현재까지 모인 seed로 반환한다.
// 최악의 경우 provider 호출 횟수는 (1 + MAX_INTERNAL_SEARCH_RETRIES) × planQueries 개수.
export const MAX_INTERNAL_SEARCH_RETRIES = 3;

// buildDiscoveryPlan 단계에서 모든 query 조합이 이미 사용된 경우 throw하는 메시지.
// toDiscoverSeedsFailure에서 이 문자열을 보고 DISCOVER_SEEDS_PLAN_ERROR로 좁힌다.
// 내부 재시도 루프에서는 이 메시지를 보고 "대안 소진"으로 판단해 graceful break한다.
export const NO_UNVISITED_SEARCH_QUERIES_MESSAGE =
  "no unvisited search queries available";

import type { UserInput } from "../../../interfaces/input.js";
import type {
  DiscoveryContext,
  SearchApproach,
  SearchQuery,
  EvaluateSeedsRetryReason,
} from "../types.js";
import { DEFAULT_RADIUS_KM, MIN_SEEDS_PER_APPROACH } from "./constants.js";
import { getSearchKey } from "./keys.js";

// SearchApproach를 실제 provider 호출 단위(SearchQuery)로 변환하는 책임을 맡는다.
// "어디서(location), 몇 페이지(page), 어떤 검색어(query), 몇 개씩(count)" 4가지를 결정한다.
//
// 총 count 계산에 쓰이는 overfetchMultiplier는 별도 모듈(overfetch.ts)에서 LLM으로 산정해
// 인자로 받아온다.

// 사용자 입력의 location 배열에서 검색 중심점을 결정한다.
// v1에서는 첫 위치만 사용하고, 반경은 DEFAULT_RADIUS_KM으로 고정한다.
const toSearchLocation = (
  userInput: UserInput,
): SearchQuery["location"] | undefined => {
  const [firstLocation] = userInput.location;
  if (!firstLocation) return undefined;

  return {
    longitude: firstLocation.lng,
    latitude: firstLocation.lat,
    radiusKm: DEFAULT_RADIUS_KM,
  };
};

// 재시도 사유에 따라 시작 page를 다르게 잡는다.
// seed가 부족했거나 중복이 심했다면, 같은 query의 다음 page부터 탐색해 새로운 검색면을 확보한다.
const getSearchPage = (context: DiscoveryContext): number => {
  if (
    context.previousFailureReason === "TOO_FEW_OPEN_NOW" ||
    context.previousFailureReason === "DUPLICATE_HEAVY"
  ) {
    return context.attemptNo;
  }

  return 1;
};

// approach name을 실제 검색어로 변환한다.
// approach 자체가 약했던 재시도(LOW_APPROACH_MATCH/LOW_QUALITY)에는 키워드를 살짝 덧붙여
// 동일 접근이지만 다른 검색면을 형성하도록 유도한다.
const buildSearchQuery = (
  name: string,
  retryReason?: EvaluateSeedsRetryReason,
): string => {
  if (retryReason === "LOW_APPROACH_MATCH" && !name.includes("맛집")) {
    return `${name} 맛집`;
  }

  if (retryReason === "LOW_QUALITY" && !name.includes("추천")) {
    return `${name} 추천`;
  }

  return name;
};

// approach 배열을 받아 provider에 보낼 SearchQuery 배열을 만든다.
// 총 목표 seed 수 = targetSeedCount × overfetchMultiplier 이며,
// 이를 approach.weight 비율로 분배한다. weight가 작아도 MIN_SEEDS_PER_APPROACH는 보장한다.
export const allocateSeedBudget = (
  approaches: SearchApproach[],
  userInput: UserInput,
  context: DiscoveryContext,
  overfetchMultiplier: number,
): SearchQuery[] => {
  const totalCount = Math.ceil(context.targetSeedCount * overfetchMultiplier);
  const location = toSearchLocation(userInput);
  const page = getSearchPage(context);

  return approaches.map((approach) => {
    const weightedCount = Math.ceil(totalCount * approach.weight);
    const query = buildSearchQuery(approach.name, context.previousFailureReason);

    return {
      approachName: approach.name,
      query,
      searchKey: getSearchKey({ query, page, location }),
      page,
      count: Math.max(MIN_SEEDS_PER_APPROACH, weightedCount),
      location,
    };
  });
};

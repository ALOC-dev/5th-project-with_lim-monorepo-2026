import type { SearchQuery } from "../contracts.js";
import type { DiscoverSeedsOptions } from "../types.js";
import type { LocalSeed, LocalSeedSearchResponse } from "../vendors/contracts.js";
import { searchKakaoLocal } from "../vendors/kakao-local.js";
import { searchNaverLocal } from "../vendors/naver-local.js";
import { searchTmapLocal } from "../vendors/tmap-local.js";

/** 검색어 하나에 대한 모든 provider의 결과를 묶은 것. */
export type QuerySeedResult = {
  query: SearchQuery;
  /** provider별 원본 응답. 페이지 소진 판정에 쓴다. */
  responses: LocalSeedSearchResponse[];
  /** provider별 성패. 하나가 통째로 죽어도 보이게 하려고 남긴다. */
  outcomes: ProviderOutcome[];
  /** provider를 가로질러 하나로 합친 seed 목록. */
  seeds: LocalSeed[];
};

export type ProviderOutcome = {
  provider: LocalSeedSearchResponse["provider"];
  query: string;
  page: number;
  count: number;
  seedCount: number;
  error?: string;
};

/** 카카오 로컬 API가 허용하는 마지막 페이지. */
const KAKAO_MAX_PAGE = 45;

/**
 * 검색어별 결과를 모은다.
 *
 * TMap 하나만 쓰면, TMap에는 있고 카카오에는 없는 장소가 후보로 들어온다. 그런
 * 후보는 참조 URL을 끝내 확인하지 못해 결국 버려진다. 실측에서 참조 확인 실패
 * 16건 중 4건을 직접 조회해 보니 상호명 질의도 주소 역질의도 카카오에서 0건이었다
 * — 점수 임계값 문제가 아니라 애초에 카카오에 없는 장소였다.
 *
 * 그래서 탐색 단계에서 카카오도 같이 조회한다. 카카오에서 나온 seed는 `place_url`을
 * 이미 들고 있어 참조 확인이 REST 호출조차 필요 없는 공짜가 되고, 가장 비싼
 * 네이버 지도 스크랩 경로로 넘어갈 일도 없어진다.
 *
 * 한 검색어의 한 provider가 실패해도 나머지는 살린다. 예전에는 `Promise.all`이라
 * 검색어 하나가 실패하면 discovery 전체가 실패했고, 그게 곧 엔진 전체 실패였다.
 */
export const fetchProviderSeeds = async (
  queries: SearchQuery[],
  options: DiscoverSeedsOptions = {},
): Promise<QuerySeedResult[]> =>
  Promise.all(queries.map((query) => fetchQuerySeeds(query, options)));

const fetchQuerySeeds = async (
  query: SearchQuery,
  options: DiscoverSeedsOptions,
): Promise<QuerySeedResult> => {
  const [naver, kakao, tmap] = await Promise.all([
    runProvider("naver", query, () => searchNaver(query, options)),
    runProvider("kakao", query, () => searchKakao(query, options)),
    runProvider("tmap", query, () => searchTmap(query, options)),
  ]);

  return {
    query,
    responses: [naver.response, kakao.response, tmap.response],
    outcomes: [naver.outcome, kakao.outcome, tmap.outcome],
    // 네이버를 맨 앞에 둔다. 검색어당 5건뿐이지만 그 5건은 이미 의미로 걸러진
    // 결과다. 그다음이 카카오(참조 URL을 들고 온다), 마지막이 TMap이다.
    //
    // 순서로만 우대하고 점수 가점은 주지 않는다. 뒤 단계의 우선순위 정렬은 점수가
    // 같을 때 이 순서를 그대로 따르므로, 근거 없는 가중치를 얹지 않아도 된다.
    seeds: [...naver.response.seeds, ...kakao.response.seeds, ...tmap.response.seeds],
  };
};

/**
 * 네이버 지역검색.
 *
 * 카카오·TMap은 상호와 업종 분류를 문자열로 맞춰 찾아서, 업종 분류에 없는 말은
 * 뜻이 분명해도 0건이 나온다("파인다이닝 코스요리", "미쉐린 레스토랑" 모두 0건).
 * 네이버는 같은 질의에 실제 파인다이닝을 준다. 대신 검색어당 5건이 전부이고
 * 페이지를 넘길 수 없어서, 물량이 아니라 정밀도로 기여하는 provider다.
 */
const searchNaver = async (
  query: SearchQuery,
  options: DiscoverSeedsOptions,
): Promise<LocalSeedSearchResponse> => {
  const { naverSearchClientId, naverSearchClientSecret } = options.secrets ?? {};
  if (!naverSearchClientId || !naverSearchClientSecret) {
    return toExhaustedResponse("naver", query);
  }
  // 페이지네이션이 없으므로 두 번째 페이지부터는 부를 이유가 없다.
  if (query.page > 1) return toExhaustedResponse("naver", query);

  return searchNaverLocal(
    {
      query: query.query,
      pagination: { page: 1, count: query.count },
    },
    { clientId: naverSearchClientId, clientSecret: naverSearchClientSecret },
  );
};

/**
 * provider 하나의 실패를 나머지로부터 격리하되, **조용히 삼키지는 않는다**.
 *
 * 예전에는 실패를 그냥 빈 결과로 바꿔치기했다. 그래서 TMap이 모든 검색어에서
 * 죽어도 로그에는 "seed를 좀 적게 찾았다"로만 보였고, 한쪽 provider만으로
 * 돌아가고 있다는 사실을 아무도 알 수 없었다. 실패 사유를 결과에 실어 보낸다.
 */
const runProvider = async (
  provider: LocalSeedSearchResponse["provider"],
  query: SearchQuery,
  search: () => Promise<LocalSeedSearchResponse>,
): Promise<{ response: LocalSeedSearchResponse; outcome: ProviderOutcome }> => {
  const base = { provider, query: query.query, page: query.page, count: query.count };
  try {
    const response = await search();
    return { response, outcome: { ...base, seedCount: response.seeds.length } };
  } catch (error) {
    return {
      response: toExhaustedResponse(provider, query),
      outcome: {
        ...base,
        seedCount: 0,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
    };
  }
};

const searchTmap = (
  query: SearchQuery,
  options: DiscoverSeedsOptions,
): Promise<LocalSeedSearchResponse> =>
  searchTmapLocal(
    {
      query: query.query,
      pagination: {
        page: query.page,
        count: query.count,
      },
      location: query.location,
    },
    { appKey: options.secrets?.tmapAppKey },
  );

const searchKakao = async (
  query: SearchQuery,
  options: DiscoverSeedsOptions,
): Promise<LocalSeedSearchResponse> => {
  // 키가 없으면 조회 자체를 하지 않는다. 매 검색어마다 던지고 잡는 것보다 낫다.
  if (!options.secrets?.kakaoRestApiKey) return toExhaustedResponse("kakao", query);
  if (query.page > KAKAO_MAX_PAGE) return toExhaustedResponse("kakao", query);

  return searchKakaoLocal(
    {
      query: query.query,
      pagination: {
        page: query.page,
        count: query.count,
      },
      location: query.location,
    },
    { restApiKey: options.secrets.kakaoRestApiKey },
  );
};

/** 더 넘길 페이지가 없다고 표시한 빈 응답. */
const toExhaustedResponse = (
  provider: LocalSeedSearchResponse["provider"],
  query: SearchQuery,
): LocalSeedSearchResponse => ({
  provider,
  query: query.query,
  page: query.page,
  count: query.count,
  totalCount: 0,
  isEnd: true,
  seeds: [],
});

/** 모든 provider가 소진됐을 때만 그 검색어를 접는다. */
export const isPaginationExhausted = (result: QuerySeedResult): boolean =>
  result.responses.every((response) => response.isEnd || response.seeds.length === 0);

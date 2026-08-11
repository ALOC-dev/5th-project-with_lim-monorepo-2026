import type { SearchQuery } from "../contracts.js";
import type { DiscoverSeedsOptions } from "../types.js";
import type { LocalSeedSearchResponse } from "../vendors/contracts.js";
import { searchTmapLocal } from "../vendors/tmap-local.js";

/**
 * 검색어별 결과를 모은다.
 *
 * 예전에는 `Promise.all`이라 검색어 하나가 실패하면 discovery 전체가 실패했고,
 * 그게 곧 엔진 전체 실패였다. 지금은 실패한 검색어만 빈 결과로 처리하고 나머지는
 * 살린다. 전부 실패하면 호출자가 seed 0개를 보고 판단한다.
 */
export const fetchProviderSeeds = async (
  queries: SearchQuery[],
  options: DiscoverSeedsOptions = {},
): Promise<LocalSeedSearchResponse[]> => {
  const settled = await Promise.allSettled(queries.map((query) => searchTmap(query, options)));

  return settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;

    const query = queries[index];
    return {
      provider: "tmap",
      query: query?.query ?? "",
      page: query?.page ?? 1,
      count: query?.count ?? 0,
      totalCount: 0,
      // 실패한 검색어는 더 페이지를 넘겨도 의미가 없으므로 소진으로 표시한다.
      isEnd: true,
      seeds: [],
    };
  });
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

export const isPaginationExhausted = (response: LocalSeedSearchResponse): boolean =>
  response.isEnd || response.seeds.length === 0;

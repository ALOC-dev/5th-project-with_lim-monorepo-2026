import type { Logger } from "../../../observability/logger.js";
import type { SearchQuery } from "../contracts.js";
import type { DiscoverSeedsOptions } from "../types.js";
import type { LocalSeedSearchResponse } from "../vendors/contracts.js";
import { searchTmapLocal } from "../vendors/tmap-local.js";

/**
 * 검색어별 결과를 모은다.
 *
 * 예전에는 `Promise.all`이라 검색어 하나가 실패하면 discovery 전체가 실패했고,
 * 그게 곧 엔진 전체 실패였다. 지금은 실패한 검색어만 빈 결과로 처리하고 나머지는
 * 살린다. 전부 실패하면 provider 장애로 분류할 수 있게 예외를 전파한다.
 */
export const fetchProviderSeeds = async (
  queries: SearchQuery[],
  options: DiscoverSeedsOptions = {},
  logger?: Logger,
): Promise<LocalSeedSearchResponse[]> => {
  const settled = await Promise.allSettled(queries.map((query) => searchTmap(query, options)));

  return settleProviderSeeds(queries, settled, logger);
};

/**
 * TMAP 검색 결과를 쿼리 순서대로 정규화한다.
 *
 * 일부 쿼리만 실패하면 나머지 결과는 살리되, 전부 실패한 경우는 provider
 * 장애를 빈 결과로 위장하지 않는다. 순수 함수로 분리해 실제 API 호출 없이 검증한다.
 */
export const settleProviderSeeds = (
  queries: SearchQuery[],
  settled: PromiseSettledResult<LocalSeedSearchResponse>[],
  logger?: Logger,
): LocalSeedSearchResponse[] => {
  const rejected = settled.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (rejected.length > 0) {
    const phase =
      rejected.length === settled.length
        ? "discoverSeeds.provider.total_failure"
        : "discoverSeeds.provider.partial_failure";
    logger?.warn(phase, {
      provider: "TMAP",
      queryCount: settled.length,
      rejectedQueryCount: rejected.length,
      recoverable: rejected.length < settled.length,
      errors: rejected.map((result) => toProviderErrorSummary(result.reason)),
    });
  }

  if (settled.length > 0 && rejected.length === settled.length) {
    const reasons = rejected.map((result): unknown => result.reason);
    throw new AggregateError(
      reasons,
      "Request failed: TMAP provider rejected every discovery query",
    );
  }

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

const toProviderErrorSummary = (error: unknown): { name: string; message: string } => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "UnknownError", message: String(error) };
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

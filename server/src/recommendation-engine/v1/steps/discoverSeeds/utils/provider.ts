import type { LocalSeed, LocalSeedSearchResponse } from "../vendors/types.js";
import { searchTmapLocal } from "../vendors/tmap-local.js";
import type { SearchQuery } from "../types.js";
import type { SeedDiscoveryPlan } from "../types.js";

// SeedDiscoveryPlan을 받아 실제 provider(TMAP) 호출을 수행하는 어댑터 레이어.
// SearchQuery는 이미 provider-agnostic 형태이므로 TMAP에 맞는 인자 변환만 여기서 담당한다.
// 향후 카카오/네이버 등으로 확장한다면 이 함수가 분기점이 된다.
export const fetchProviderSeeds = async (
  plan: SeedDiscoveryPlan,
): Promise<LocalSeed[]> => {
  const responses = await Promise.all(
    plan.queries.map((query) => searchTmapWithFallback(query)),
  );

  return responses.flatMap((response) => response.seeds);
};

const searchTmapWithFallback = async (
  query: SearchQuery,
): Promise<LocalSeedSearchResponse> => {
  const primary = await searchTmap(query);
  if (primary.seeds.length > 0) return primary;

  const fallbackQuery = simplifyLocalSearchQuery(query.query);
  if (fallbackQuery === query.query) return primary;

  return searchTmap({ ...query, query: fallbackQuery });
};

const searchTmap = (query: SearchQuery): Promise<LocalSeedSearchResponse> =>
  searchTmapLocal({
    query: query.query,
    pagination: {
      page: query.page,
      count: query.count,
    },
    location: query.location,
  });

const simplifyLocalSearchQuery = (query: string): string => {
  const simplified = query
    .replace(/\b맛집\b/gu, "")
    .replace(
      /조용한|대화하기\s*좋은|분위기|평일|오후|가기\s*좋은|데이트|추천/gu,
      "",
    )
    .replace(/\s+/gu, " ")
    .trim();
  return simplified.length >= 2 ? simplified : query;
};

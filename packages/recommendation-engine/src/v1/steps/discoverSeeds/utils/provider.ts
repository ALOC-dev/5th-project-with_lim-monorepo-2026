import type { SearchQuery } from "../contracts.js";
import type { DiscoverSeedsOptions } from "../types.js";
import type { LocalSeedSearchResponse } from "../vendors/contracts.js";
import { searchTmapLocal } from "../vendors/tmap-local.js";

export const fetchProviderSeeds = async (
  queries: SearchQuery[],
  options: DiscoverSeedsOptions = {},
): Promise<LocalSeedSearchResponse[]> =>
  Promise.all(queries.map((query) => searchTmap(query, options)));

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

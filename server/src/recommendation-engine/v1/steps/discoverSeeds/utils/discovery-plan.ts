import type { UserInput } from "../../../interfaces/input.js";
import {
  SeedDiscoveryPlanSchema,
  type DiscoveryContext,
  type EvaluateSeedsRetryReason,
  type SearchApproach,
  type SearchQuery,
  type SeedDiscoveryPlan,
} from "../types.js";
import {
  DEFAULT_RADIUS_KM,
  MAX_ALTERNATIVE_SEARCH_ATTEMPTS,
  MIN_SEEDS_PER_APPROACH,
  NO_UNVISITED_SEARCH_QUERIES_MESSAGE,
} from "./constants.js";
import { getSearchKey, normalizeSearchText } from "./keys.js";

type DiscoveryPlanBuilderInput = {
  userInput: UserInput;
  context: DiscoveryContext;
  approaches: SearchApproach[];
  overfetchMultiplier: number;
};

export const buildDiscoveryPlan = ({
  userInput,
  context,
  approaches,
  overfetchMultiplier,
}: DiscoveryPlanBuilderInput): SeedDiscoveryPlan =>
  new DiscoveryPlanBuilder({
    userInput,
    context,
    approaches,
    overfetchMultiplier,
  }).build();

// 이번 attempt의 provider 호출 계획을 만드는 실행 컨텍스트다.
// 같은 userInput/context/approaches/overfetchMultiplier를 하위 함수로 계속 넘기지 않도록
// budget 산정, visited 우회, schema 검증을 한 객체 안에 묶는다.
class DiscoveryPlanBuilder {
  constructor(private readonly input: DiscoveryPlanBuilderInput) {}

  build(): SeedDiscoveryPlan {
    const queries = this.filterVisitedSearchQueries(
      this.buildCandidateQueries(),
    );

    if (queries.length === 0) {
      throw new Error(NO_UNVISITED_SEARCH_QUERIES_MESSAGE);
    }

    return SeedDiscoveryPlanSchema.parse({
      attemptNo: this.input.context.attemptNo,
      approaches: this.input.approaches,
      queries,
      targetSeedCount: this.input.context.targetSeedCount,
      overfetchMultiplier: this.input.overfetchMultiplier,
    });
  }

  private buildCandidateQueries(): SearchQuery[] {
    const totalCount = Math.ceil(
      this.input.context.targetSeedCount * this.input.overfetchMultiplier,
    );
    const location = this.toSearchLocation();
    const page = this.getSearchPage();

    return this.input.approaches.map((approach) => {
      const weightedCount = Math.ceil(totalCount * approach.weight);
      const query = this.buildSearchQuery(approach.name);

      return {
        approachName: approach.name,
        query,
        searchKey: getSearchKey({ query, page, location }),
        page,
        count: Math.max(MIN_SEEDS_PER_APPROACH, weightedCount),
        location,
      };
    });
  }

  private toSearchLocation(): SearchQuery["location"] | undefined {
    const [firstLocation] = this.input.userInput.location;
    if (!firstLocation) return undefined;

    return {
      longitude: firstLocation.lng,
      latitude: firstLocation.lat,
      radiusKm: DEFAULT_RADIUS_KM,
    };
  }

  private getSearchPage(): number {
    const { previousFailureReason, attemptNo } = this.input.context;
    if (
      previousFailureReason === "TOO_FEW_OPEN_NOW" ||
      previousFailureReason === "DUPLICATE_HEAVY"
    ) {
      return attemptNo;
    }

    return 1;
  }

  private buildSearchQuery(name: string): string {
    const { previousFailureReason } = this.input.context;
    if (previousFailureReason === "LOW_APPROACH_MATCH" && !name.includes("맛집")) {
      return `${name} 맛집`;
    }

    if (previousFailureReason === "LOW_QUALITY" && !name.includes("추천")) {
      return `${name} 추천`;
    }

    return name;
  }

  private filterVisitedSearchQueries(queries: SearchQuery[]): SearchQuery[] {
    const blockedSearchKeys = new Set(this.input.context.visitedSearchKeys);
    const nextQueries: SearchQuery[] = [];

    for (const query of queries) {
      const unvisitedQuery = this.toUnvisitedSearchQuery(
        query,
        blockedSearchKeys,
      );
      if (!unvisitedQuery) continue;

      blockedSearchKeys.add(unvisitedQuery.searchKey);
      nextQueries.push(unvisitedQuery);
    }

    return nextQueries;
  }

  private toUnvisitedSearchQuery(
    query: SearchQuery,
    blockedSearchKeys: Set<string>,
  ): SearchQuery | undefined {
    for (
      let page = query.page;
      page < query.page + MAX_ALTERNATIVE_SEARCH_ATTEMPTS;
      page += 1
    ) {
      const candidate = this.withSearchKey({ ...query, page });
      if (!blockedSearchKeys.has(candidate.searchKey)) return candidate;
    }

    for (const alternativeQuery of this.getAlternativeQueryTexts(query.query)) {
      for (let page = 1; page <= MAX_ALTERNATIVE_SEARCH_ATTEMPTS; page += 1) {
        const candidate = this.withSearchKey({
          ...query,
          query: alternativeQuery,
          page,
        });
        if (!blockedSearchKeys.has(candidate.searchKey)) return candidate;
      }
    }

    return undefined;
  }

  private withSearchKey(query: SearchQuery): SearchQuery {
    return {
      ...query,
      searchKey: getSearchKey(query),
    };
  }

  private getAlternativeQueryTexts(query: string): string[] {
    const suffixesByReason: Record<EvaluateSeedsRetryReason, string[]> = {
      LOW_QUALITY: ["추천", "평점", "후기"],
      TOO_FEW_OPEN_NOW: ["영업중", "근처", "주변"],
      LOW_APPROACH_MATCH: ["맛집", "전문점", "인기"],
      DUPLICATE_HEAVY: ["근처", "주변", "추천"],
    };
    const retryReason = this.input.context.previousFailureReason;
    const suffixes = retryReason
      ? suffixesByReason[retryReason]
      : ["추천", "근처", "맛집"];

    return suffixes
      .map((suffix) => (query.includes(suffix) ? query : `${query} ${suffix}`))
      .map(normalizeSearchText)
      .filter(
        (alternativeQuery) => alternativeQuery !== normalizeSearchText(query),
      )
      .filter(
        (alternativeQuery, index, self) =>
          self.indexOf(alternativeQuery) === index,
      );
  }
}

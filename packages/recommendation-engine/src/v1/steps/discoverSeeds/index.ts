import type { Logger } from "../../observability/logger.js";
import { DiscoverSeedsOutputSchema, type DiscoveryContext } from "./contracts.js";
import type { DiscoverSeedsOptions, DiscoverSeedsProcessResult } from "./types.js";
import { dedupeAndExclude } from "./utils/dedupe.js";
import { toDiscoverSeedsFailure } from "./utils/failure.js";
import {
  fetchProviderSeeds,
  isPaginationExhausted,
  type ProviderOutcome,
} from "./utils/provider.js";
import type { LocalSeed } from "./vendors/contracts.js";

export const discoverSeeds = async (
  context: DiscoveryContext,
  logger: Logger,
  options: DiscoverSeedsOptions = {},
): Promise<DiscoverSeedsProcessResult> => {
  const stepLogger = logger.withContext({
    attemptNo: context.attemptNo,
  });
  const finishStepTimer = stepLogger.startTimer("discoverSeeds.discover.success");

  try {
    const { queries } = context;
    stepLogger.info("discoverSeeds.discover.start", {
      targetSeedCount: context.targetSeedCount,
      queryCount: queries.length,
      excludedSeedKeyCount: context.alreadyCheckedIds.length,
      previousFailureReason: context.previousFailureReason,
    });

    const accumulatedSeeds: LocalSeed[] = [];
    const results = await fetchProviderSeeds(queries, options);
    const nextQueries: typeof context.queries = [];

    for (const result of results) {
      accumulatedSeeds.push(...result.seeds);
      if (!isPaginationExhausted(result)) {
        nextQueries.push({
          ...result.query,
          page: result.query.page + 1,
        });
      }
    }

    const { seeds, seedKeys, excludedSeedKeysApplied } = dedupeAndExclude(
      accumulatedSeeds,
      context.alreadyCheckedIds,
    );
    // provider 하나가 모든 검색어에서 죽으면 반쪽짜리로 도는 것이므로 경고한다.
    const outcomes = results.flatMap((result) => result.outcomes);
    for (const [provider, providerOutcomes] of groupByProvider(outcomes)) {
      const failed = providerOutcomes.filter((outcome) => outcome.error !== undefined);
      if (failed.length < providerOutcomes.length) continue;
      stepLogger.warn("discoverSeeds.provider.unavailable", {
        provider,
        queryCount: providerOutcomes.length,
        // 사유는 검색어마다 같을 때가 대부분이라 서로 다른 것만 남긴다.
        errors: [...new Set(failed.map((outcome) => outcome.error))],
      });
    }

    stepLogger.info("discoverSeeds.discover.result", {
      accumulatedSeedCount: accumulatedSeeds.length,
      // provider별 수확량. 카카오 몫이 0에 가까우면 참조 확인이 다시 비싸진다.
      seedCountByProvider: countSeedsByProvider(accumulatedSeeds),
      providerOutcomes: outcomes,
      dedupedSeedCount: seeds.length,
      nextQueryCount: nextQueries.length,
      targetSeedCount: context.targetSeedCount,
    });

    const output = DiscoverSeedsOutputSchema.parse({
      seeds,
      seedKeys,
      excludedSeedKeysApplied,
      nextQueries,
      attemptNo: context.attemptNo,
    });

    stepLogger.info("discoverSeeds.discover.result", {
      seedCount: output.seeds.length,
      seedKeyCount: output.seedKeys.length,
      excludedSeedKeysAppliedCount: output.excludedSeedKeysApplied.length,
      nextQueryCount: output.nextQueries.length,
      output: {
        seeds: output.seeds.map((seed, index) => ({
          seedKey: output.seedKeys[index],
          provider: seed.provider,
          name: seed.name,
          category: seed.category,
          roadAddress: seed.roadAddress,
          address: seed.address,
        })),
        seedKeys: output.seedKeys,
      },
    });

    finishStepTimer({
      seedCount: output.seeds.length,
      seedKeyCount: output.seedKeys.length,
      excludedSeedKeysAppliedCount: output.excludedSeedKeysApplied.length,
      nextQueryCount: output.nextQueries.length,
    });

    return { ok: true, data: output };
  } catch (error) {
    const failure = toDiscoverSeedsFailure(error);
    stepLogger.error("discoverSeeds.discover.failure", error, {
      errorCode: failure.ok ? "UNKNOWN_DISCOVER_SEEDS_ERROR" : failure.errorCode,
    });
    return failure;
  }
};

const groupByProvider = (outcomes: ProviderOutcome[]): Map<string, ProviderOutcome[]> => {
  const grouped = new Map<string, ProviderOutcome[]>();
  for (const outcome of outcomes) {
    const bucket = grouped.get(outcome.provider);
    if (bucket) bucket.push(outcome);
    else grouped.set(outcome.provider, [outcome]);
  }
  return grouped;
};

const countSeedsByProvider = (seeds: LocalSeed[]): Record<string, number> =>
  seeds.reduce<Record<string, number>>((counts, seed) => {
    counts[seed.provider] = (counts[seed.provider] ?? 0) + 1;
    return counts;
  }, {});

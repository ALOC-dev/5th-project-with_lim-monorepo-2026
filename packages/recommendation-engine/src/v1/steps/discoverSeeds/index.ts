import type { UserInput } from "../../interfaces/input.contracts.js";
import type { Logger } from "../../observability/logger.js";
import { DiscoverSeedsOutputSchema, type DiscoveryContext } from "./contracts.js";
import type { DiscoverSeedsOptions, DiscoverSeedsProcessResult } from "./types.js";
import { dedupeAndExclude } from "./utils/dedupe.js";
import { toDiscoverSeedsFailure } from "./utils/failure.js";
import { fetchProviderSeeds, isPaginationExhausted } from "./utils/provider.js";
import type { LocalSeed } from "./vendors/contracts.js";

export const discoverSeeds = async (
  _userInput: UserInput,
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
    const responses = await fetchProviderSeeds(queries, options);
    const nextQueries: typeof context.queries = [];

    const responsesByQuery = responses.flatMap((response, index) => {
      const query = queries[index];
      if (!query) return [];
      return [{ query, response }];
    });

    for (const { query, response } of responsesByQuery) {
      accumulatedSeeds.push(...response.seeds);
      if (!isPaginationExhausted(response)) {
        nextQueries.push({
          ...query,
          page: query.page + 1,
        });
      }
    }

    const { seeds, seedKeys, excludedSeedKeysApplied } = dedupeAndExclude(
      accumulatedSeeds,
      context.alreadyCheckedIds,
    );
    stepLogger.info("discoverSeeds.discover.result", {
      fetchedSeedCount: responses.flatMap((response) => response.seeds).length,
      accumulatedSeedCount: accumulatedSeeds.length,
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

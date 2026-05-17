import type { UserInput } from "../../interfaces/input.js";
import type { Logger } from "../../observability/logger.js";
import { extractApproachesFromLlm } from "./llm/approaches.js";
import { computeOverfetchMultiplierFromLlm } from "./llm/overfetch.js";
import type { LocalSeed } from "./vendors/types.js";
import {
  DiscoverSeedsOutputSchema,
  type DiscoveryContext,
  type SearchApproach,
  type SeedDiscoveryPlan,
  type DiscoverSeedsOutput,
  type DiscoverSeedsProcessResult,
} from "./types.js";
import {
  MAX_INTERNAL_SEARCH_RETRIES,
  NO_UNVISITED_SEARCH_QUERIES_MESSAGE,
} from "./utils/constants.js";
import {
  buildDiscoveryPlan,
  dedupeAndExclude,
  fetchProviderSeeds,
  toDiscoverSeedsFailure,
} from "./utils/index.js";

// 외부 호출자는 discoverSeeds 실행 함수와 retry context/output 타입만 알면 된다.
export type { DiscoveryContext, DiscoverSeedsOutput };

// Seed 탐색의 한 attempt를 수행한다.
// LLM은 이 orchestration 경계에서만 호출하고, utils는 plan 생성/후처리만 맡는다.
export const discoverSeeds = async (
  userInput: UserInput,
  context: DiscoveryContext,
  logger: Logger,
): Promise<DiscoverSeedsProcessResult> => {
  const discoveryContext = context;
  const stepLogger = logger.withContext({
    attemptNo: discoveryContext.attemptNo,
  });
  const finishStepTimer = stepLogger.startTimer(
    "discoverSeeds.discover.success",
  );

  try {
    stepLogger.info("discoverSeeds.discover.start", {
      targetSeedCount: discoveryContext.targetSeedCount,
      excludedSeedKeyCount: discoveryContext.excludedSeedKeys.length,
      visitedSearchKeyCount: discoveryContext.visitedSearchKeys.length,
      previousFailureReason: discoveryContext.previousFailureReason,
      hasPresetApproaches: Boolean(discoveryContext.presetApproaches?.length),
    });

    // evaluateSeeds가 넘긴 preset approach가 있으면 새 접근 추출은 생략한다.
    let approaches: SearchApproach[];
    if (discoveryContext.presetApproaches) {
      approaches = discoveryContext.presetApproaches;
      stepLogger.info("discoverSeeds.approaches.preset", {
        approachCount: approaches.length,
        names: approaches.map((approach) => approach.name),
      });
    } else {
      const finishApproaches = stepLogger.startTimer(
        "discoverSeeds.approaches.success",
      );
      stepLogger.info("discoverSeeds.approaches.start", {
        requestLength: userInput.userNaturalLanguageRequest.length,
      });
      approaches = await extractApproachesFromLlm(userInput);
      finishApproaches({
        approachCount: approaches.length,
        names: approaches.map((approach) => approach.name),
      });
    }

    const finishOverfetch = stepLogger.startTimer(
      "discoverSeeds.overfetch.success",
    );
    stepLogger.info("discoverSeeds.overfetch.start", {
      requestLength: userInput.userNaturalLanguageRequest.length,
      locationCount: userInput.location.length,
    });
    const overfetchMultiplier = discoveryContext.presetApproaches
      ? 1
      : await computeOverfetchMultiplierFromLlm(userInput);
    finishOverfetch({ overfetchMultiplier });

    // 첫 plan은 반환값에 남겨 실제 탐색 의도를 추적할 수 있게 한다.
    const initialPlan = buildDiscoveryPlan({
      userInput,
      context: discoveryContext,
      approaches,
      overfetchMultiplier,
    });
    stepLogger.info("discoverSeeds.plan.initial", {
      queryCount: initialPlan.queries.length,
      approachCount: initialPlan.approaches.length,
      searchKeys: initialPlan.queries.map((query) => query.searchKey),
      totalRequestedCount: initialPlan.queries.reduce(
        (sum, query) => sum + query.count,
        0,
      ),
    });

    // 내부 retry는 같은 attempt 안에서 seed가 부족할 때만 추가 provider 호출을 수행한다.
    const accumulatedSeeds: LocalSeed[] = [];
    const visitedKeysThisCall: string[] = [];

    const runIteration = async (
      plan: SeedDiscoveryPlan,
      retryNo: number,
    ): Promise<void> => {
      const retryLogger = stepLogger.withContext({ retryNo });
      const finishProvider = retryLogger.startTimer(
        "discoverSeeds.provider.success",
      );
      retryLogger.info("discoverSeeds.provider.start", {
        queryCount: plan.queries.length,
        queries: plan.queries.map((query) => ({
          approachName: query.approachName,
          query: query.query,
          searchKey: query.searchKey,
          page: query.page,
          count: query.count,
          hasLocation: Boolean(query.location),
        })),
      });
      const seeds = await fetchProviderSeeds(plan);
      accumulatedSeeds.push(...seeds);
      visitedKeysThisCall.push(...plan.queries.map((query) => query.searchKey));
      finishProvider({
        fetchedSeedCount: seeds.length,
        accumulatedSeedCount: accumulatedSeeds.length,
      });
    };

    await runIteration(initialPlan, 0);

    for (let retry = 1; retry <= MAX_INTERNAL_SEARCH_RETRIES; retry += 1) {
      const { seeds: dedupedSoFar } = dedupeAndExclude(
        accumulatedSeeds,
        discoveryContext.excludedSeedKeys,
      );
      stepLogger
        .withContext({ retryNo: retry })
        .info("discoverSeeds.retry.check", {
          dedupedSeedCount: dedupedSoFar.length,
          targetSeedCount: discoveryContext.targetSeedCount,
        });
      if (dedupedSoFar.length >= discoveryContext.targetSeedCount) break;

      // 이미 쓴 searchKey를 context에 반영해 다음 plan이 같은 검색 조합을 피하게 한다.
      const retryContext: DiscoveryContext = {
        ...discoveryContext,
        visitedSearchKeys: [
          ...discoveryContext.visitedSearchKeys,
          ...visitedKeysThisCall,
        ],
      };

      let nextPlan: SeedDiscoveryPlan;
      try {
        nextPlan = buildDiscoveryPlan({
          userInput,
          context: retryContext,
          approaches,
          overfetchMultiplier,
        });
        stepLogger
          .withContext({ retryNo: retry })
          .info("discoverSeeds.plan.retry", {
            queryCount: nextPlan.queries.length,
            searchKeys: nextPlan.queries.map((query) => query.searchKey),
            totalRequestedCount: nextPlan.queries.reduce(
              (sum, query) => sum + query.count,
              0,
            ),
          });
      } catch (error) {
        // 모든 우회 query를 소진한 경우는 실패가 아니라 "여기까지 확보"로 종료한다.
        if (isNoUnvisitedSearchError(error)) {
          stepLogger
            .withContext({ retryNo: retry })
            .info("discoverSeeds.retry.exhausted", {
              visitedSearchKeyCount: retryContext.visitedSearchKeys.length,
            });
          break;
        }
        throw error;
      }

      await runIteration(nextPlan, retry);
    }

    // 최종 반환 직전, 중복 제거와 이전 attempt 제외 목록을 한 번 더 적용한다.
    const { seeds, seedKeys, excludedSeedKeysApplied } = dedupeAndExclude(
      accumulatedSeeds,
      discoveryContext.excludedSeedKeys,
    );

    const output = DiscoverSeedsOutputSchema.parse({
      plan: initialPlan,
      seeds,
      seedKeys,
      excludedSeedKeysApplied,
      visitedSearchKeysAdded: visitedKeysThisCall,
      attemptNo: discoveryContext.attemptNo,
    });

    stepLogger.info("discoverSeeds.discover.result", {
      output,
    });

    finishStepTimer({
      seedCount: output.seeds.length,
      seedKeyCount: output.seedKeys.length,
      excludedSeedKeysAppliedCount: output.excludedSeedKeysApplied.length,
      visitedSearchKeysAddedCount: output.visitedSearchKeysAdded.length,
    });

    return { ok: true, data: output };
  } catch (error) {
    const failure = toDiscoverSeedsFailure(error);
    stepLogger.error("discoverSeeds.discover.failure", error, {
      errorCode: failure.ok
        ? "UNKNOWN_DISCOVER_SEEDS_ERROR"
        : failure.errorCode,
    });
    return failure;
  }
};

// buildDiscoveryPlan의 "검색 조합 소진" 신호만 정상 종료 케이스로 좁힌다.
const isNoUnvisitedSearchError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.includes(NO_UNVISITED_SEARCH_QUERIES_MESSAGE);

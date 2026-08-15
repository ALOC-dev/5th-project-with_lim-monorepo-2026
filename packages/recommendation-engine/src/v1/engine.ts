import {
  DEFAULT_CANDIDATE_POOL_MULTIPLIER,
  DEFAULT_TARGET_COUNT,
  DEFAULT_WEIGHTS,
} from "./configs/constants.js";
import type { EngineConfig } from "./configs/types.js";
import type { RecommendationEngineSecrets } from "./credentials.js";
import type { UserInput } from "./interfaces/input.contracts.js";
import type { EngineOutput, RecommendationOriginContext } from "./interfaces/output.contracts.js";
import { consoleLogger, type Logger, noopLogger } from "./observability/logger.js";
import {
  type DiscoverSeedsOutput,
  DiscoverSeedsOutputSchema,
  type DiscoveryContext,
  DiscoveryContextSchema,
  type EvaluateSeedsRetryReason,
  type SearchQuery,
} from "./steps/discoverSeeds/contracts.js";
import { discoverSeeds } from "./steps/discoverSeeds/index.js";
import {
  createDiscoveryContextWithLlm,
  createInitialDiscoveryPlanWithLlm,
} from "./steps/discoverSeeds/llm/approaches.js";
import { evaluateSeeds } from "./steps/evaluateSeeds/index.js";
import { getLocationCentroid } from "./utils/geography.js";

const MAX_DISCOVERY_ATTEMPTS = 5;

export type RecommendationProgressStep = 'input_validated' | 'discovering' | 'evaluating' | 'enriching' | 'scoring';

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  targetCount: DEFAULT_TARGET_COUNT,
  candidatePoolMultiplier: DEFAULT_CANDIDATE_POOL_MULTIPLIER,
  weights: DEFAULT_WEIGHTS,
};

type EngineDiscoveryState = {
  alreadyCheckedIds: string[];
  queries: SearchQuery[];
  previousFailureReason?: EvaluateSeedsRetryReason;
};

type DiscoverySeedPool = Pick<DiscoverSeedsOutput, "seeds" | "seedKeys">;

const EMPTY_DISCOVERY_SEED_POOL: DiscoverySeedPool = {
  seeds: [],
  seedKeys: [],
};

const buildDiscoveryContext = (
  config: EngineConfig,
  state: EngineDiscoveryState & {
    attemptNo: number;
  },
): DiscoveryContext =>
  DiscoveryContextSchema.parse({
    attemptNo: state.attemptNo,
    targetSeedCount: config.targetCount * config.candidatePoolMultiplier,
    queries: state.queries,
    alreadyCheckedIds: state.alreadyCheckedIds,
    previousFailureReason: state.previousFailureReason,
  });

const DEFAULT_SEARCH_RADIUS_KM = 5;

const getDefaultSearchLocation = (
  userInput: UserInput,
): DiscoveryContext["queries"][number]["location"] | undefined => {
  const center = getLocationCentroid(userInput.location);
  if (!center) return undefined;

  return {
    longitude: center.lng,
    latitude: center.lat,
    radiusKm: DEFAULT_SEARCH_RADIUS_KM,
  };
};

const hydrateQueriesWithLocation = (
  queries: SearchQuery[],
  userInput: UserInput,
): SearchQuery[] => {
  const defaultLocation = getDefaultSearchLocation(userInput);
  return queries.map((query) => ({
    ...query,
    location: query.location ?? defaultLocation,
  }));
};

const appendDiscoverSeedsOutputToPool = (
  pool: DiscoverySeedPool,
  output: DiscoverSeedsOutput,
): DiscoverySeedPool => {
  const seenSeedKeys = new Set(pool.seedKeys);
  const seeds = [...pool.seeds];
  const seedKeys = [...pool.seedKeys];

  output.seeds.forEach((seed, index) => {
    const seedKey = output.seedKeys[index];
    if (!seedKey || seenSeedKeys.has(seedKey)) return;

    seenSeedKeys.add(seedKey);
    seeds.push(seed);
    seedKeys.push(seedKey);
  });

  return { seeds, seedKeys };
};

const removeSeedKeysFromPool = (
  pool: DiscoverySeedPool,
  seedKeysToRemove: string[],
): DiscoverySeedPool => {
  if (seedKeysToRemove.length === 0) return pool;

  const removableSeedKeys = new Set(seedKeysToRemove);
  const seeds: DiscoverySeedPool["seeds"] = [];
  const seedKeys: DiscoverySeedPool["seedKeys"] = [];

  pool.seeds.forEach((seed, index) => {
    const seedKey = pool.seedKeys[index];
    if (!seedKey || removableSeedKeys.has(seedKey)) return;

    seeds.push(seed);
    seedKeys.push(seedKey);
  });

  return { seeds, seedKeys };
};

const toEvaluateSeedsInput = (
  pool: DiscoverySeedPool,
  latestOutput: DiscoverSeedsOutput,
): DiscoverSeedsOutput =>
  DiscoverSeedsOutputSchema.parse({
    seeds: pool.seeds,
    seedKeys: pool.seedKeys,
    excludedSeedKeysApplied: latestOutput.excludedSeedKeysApplied,
    nextQueries: latestOutput.nextQueries,
    attemptNo: latestOutput.attemptNo,
  });

const buildRecommendationOriginContext = (userInput: UserInput): RecommendationOriginContext => {
  const origins = userInput.location.map((location, index) => ({
    id: toOriginId(index),
    role: index === 0 ? ("HOST" as const) : ("MEMBER" as const),
    label: index === 0 ? "나" : `참여자 ${index + 1}`,
    location,
  }));
  const center = getLocationCentroid(origins.map((origin) => origin.location));

  return {
    mode: origins.length > 1 ? "GROUP" : "SINGLE",
    origins,
    ...(center ? { center } : {}),
  };
};

const toOriginId = (index: number): string => (index === 0 ? "host" : `member-${index}`);

type RecommendationEngineSteps = {
  createInitialDiscoveryPlanWithLlm: typeof createInitialDiscoveryPlanWithLlm;
  createDiscoveryContextWithLlm: typeof createDiscoveryContextWithLlm;
  discoverSeeds: typeof discoverSeeds;
  evaluateSeeds: typeof evaluateSeeds;
};

/**
 * Deterministic test seams for the engine's side-effecting steps.
 * These are not used by the public server API; production uses the default implementations.
 */
export type RecommendationEngineTestDependencies = Partial<RecommendationEngineSteps>;

export type RecommendationEngineOptions = {
  onProcessStart?: () => void;
  onProgress?: (step: RecommendationProgressStep) => void;
  loggingActivated?: boolean;
  logger?: Logger;
  secrets?: RecommendationEngineSecrets;
  testDependencies?: RecommendationEngineTestDependencies;
};


export class RecommendationEngine {
  private readonly onProcessStart: RecommendationEngineOptions["onProcessStart"];
  private readonly onProgress : RecommendationEngineOptions['onProgress'];
  private readonly config: EngineConfig;
  private readonly logger: Logger;
  private readonly secrets: RecommendationEngineSecrets;
  private readonly userInput: UserInput;
  private readonly steps: RecommendationEngineSteps;

  constructor(input: UserInput, config: EngineConfig, options: RecommendationEngineOptions = {}) {
    this.onProcessStart = options.onProcessStart;
    this.onProgress = options.onProgress;
    this.config = config;
    this.logger = options.logger ?? (options.loggingActivated ? consoleLogger : noopLogger);
    this.secrets = options.secrets ?? {};
    this.userInput = input;
    this.steps = {
      createInitialDiscoveryPlanWithLlm:
        options.testDependencies?.createInitialDiscoveryPlanWithLlm ??
        createInitialDiscoveryPlanWithLlm,
      createDiscoveryContextWithLlm:
        options.testDependencies?.createDiscoveryContextWithLlm ?? createDiscoveryContextWithLlm,
      discoverSeeds: options.testDependencies?.discoverSeeds ?? discoverSeeds,
      evaluateSeeds: options.testDependencies?.evaluateSeeds ?? evaluateSeeds,
    };
  }

  /**
   * 검색어를 소진했을 때 실패 사유를 근거로 새 검색어를 만든다.
   * 실패해도 재시도 자체를 막지는 않도록 빈 배열을 돌려준다.
   */
  private async regenerateQueries(
    previousQueries: SearchQuery[],
    previousFailureReason: string,
    logger: Logger,
  ): Promise<SearchQuery[]> {
    try {
      const regenerated = await this.steps.createDiscoveryContextWithLlm(this.userInput, {
        openAiApiKey: this.secrets.openAiApiKey,
        targetSeedCount: this.config.targetCount * this.config.candidatePoolMultiplier,
        retry: {
          previousQueries: previousQueries.map((query) => query.query),
          previousFailureReason,
        },
      });
      const hydrated = hydrateQueriesWithLocation(regenerated, this.userInput);
      logger.info("engine.discovery_context.regenerated", {
        previousFailureReason,
        queries: hydrated.map((query) => query.query),
      });
      return hydrated;
    } catch (error) {
      logger.warn("engine.discovery_context.regenerate_failed", {
        previousFailureReason,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return [];
    }
  }

  async process(): Promise<EngineOutput> {
    this.onProcessStart?.();
    // 요청 단위 retry 상태만 지역 변수로 유지한다.
    // 엔진 인스턴스에 실행 결과를 저장하지 않아 같은 인스턴스 재호출도 독립적으로 동작한다.
    let discoveryState: EngineDiscoveryState = {
      alreadyCheckedIds: [],
      queries: [],
    };
    let discoverySeedPool: DiscoverySeedPool = EMPTY_DISCOVERY_SEED_POOL;
    const finish = this.logger.startTimer("engine.process.success");
    this.logger.info("engine.process.start", {
      maxDiscoveryAttempts: MAX_DISCOVERY_ATTEMPTS,
      targetCount: this.config.targetCount,
    });

    try {
      const finishDiscoveryContext = this.logger.startTimer("engine.discovery_context.success");
      this.onProgress?.('input_validated');
      const initialPlan = await this.steps.createInitialDiscoveryPlanWithLlm(this.userInput, {
        openAiApiKey: this.secrets.openAiApiKey,
        targetSeedCount: this.config.targetCount * this.config.candidatePoolMultiplier,
      });
      this.logger.info("engine.intent_classified", {
        intent: initialPlan.intent,
        ...(initialPlan.intent === "UNSUPPORTED"
          ? { reason: initialPlan.reason }
          : { queryCount: initialPlan.queries.length }),
      });

      if (initialPlan.intent === "UNSUPPORTED") {
        this.logger.warn("engine.unsupported_request", { reason: initialPlan.reason });
        this.logger.warn("engine.process.failure", {
          failedStep: "intentClassification",
          errorCode: "UNSUPPORTED_RECOMMENDATION_REQUEST",
        });
        return {
          status: "ERROR",
          userInput: this.userInput,
          error: {
            code: "UNSUPPORTED_RECOMMENDATION_REQUEST",
            message: "This request cannot be handled as a place recommendation request.",
          },
        };
      }

      discoveryState = {
        ...discoveryState,
        queries: hydrateQueriesWithLocation(initialPlan.queries, this.userInput),
      };
      finishDiscoveryContext({
        queryCount: discoveryState.queries.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn("engine.process.failure", {
        failedStep: "discoverSeeds",
        errorCode: "DISCOVER_SEEDS_PLAN_ERROR",
      });
      return {
        status: "ERROR",
        userInput: this.userInput,
        error: {
          code: "DISCOVER_SEEDS_PLAN_ERROR",
          message,
        },
      };
    }

    for (let currAttemptNo = 1; currAttemptNo <= MAX_DISCOVERY_ATTEMPTS; currAttemptNo += 1) {
      const attemptLogger = this.logger.withContext({
        attemptNo: currAttemptNo,
      });
      attemptLogger.info("engine.attempt.start", {
        alreadyCheckedIdCount: discoveryState.alreadyCheckedIds.length,
        queryCount: discoveryState.queries.length,
        previousFailureReason: discoveryState.previousFailureReason,
      });

      if(currAttemptNo === 1) {
        this.onProgress?.('discovering');
      }

      const discoveryContext = buildDiscoveryContext(this.config, {
        ...discoveryState,
        attemptNo: currAttemptNo,
      });
      const discoverSeedsResult = await this.steps.discoverSeeds(discoveryContext, attemptLogger, {
        secrets: { tmapAppKey: this.secrets.tmapAppKey },
      });
      if (!discoverSeedsResult.ok) {
        // seed 확보 실패는 recoverable context가 없으므로 즉시 종료한다.
        attemptLogger.warn("engine.attempt.failure", {
          failedStep: discoverSeedsResult.failedStep,
          errorCode: discoverSeedsResult.errorCode,
        });
        this.logger.warn("engine.process.failure", {
          failedStep: discoverSeedsResult.failedStep,
          errorCode: discoverSeedsResult.errorCode,
        });
        return {
          status: "ERROR",
          userInput: this.userInput,
          error: {
            code: discoverSeedsResult.errorCode,
            message: discoverSeedsResult.message,
          },
        };
      }
      const discoverSeedsOutput = discoverSeedsResult.data;
      discoverySeedPool = appendDiscoverSeedsOutputToPool(discoverySeedPool, discoverSeedsOutput);
      attemptLogger.info("engine.seed_pool.updated", {
        newSeedCount: discoverSeedsOutput.seeds.length,
        seedPoolCount: discoverySeedPool.seedKeys.length,
        nextQueryCount: discoverSeedsOutput.nextQueries.length,
      });

      if (
        discoverySeedPool.seedKeys.length < this.config.targetCount &&
        discoverSeedsOutput.nextQueries.length > 0
      ) {
        discoveryState = {
          ...discoveryState,
          alreadyCheckedIds: Array.from(
            new Set([...discoveryState.alreadyCheckedIds, ...discoverSeedsOutput.seedKeys]),
          ),
          queries: discoverSeedsOutput.nextQueries,
          previousFailureReason:
            discoverySeedPool.seedKeys.length === 0 ? "ZERO_SEEDS" : "LOW_QUALITY",
        };
        attemptLogger.warn("engine.attempt.defer_evaluation", {
          seedPoolCount: discoverySeedPool.seedKeys.length,
          targetCount: this.config.targetCount,
          nextAlreadyCheckedIdCount: discoveryState.alreadyCheckedIds.length,
          nextQueryCount: discoveryState.queries.length,
        });
        continue;
      }

      const evaluateSeedsInput = toEvaluateSeedsInput(discoverySeedPool, discoverSeedsOutput);
      this.onProgress?.('evaluating');

      const evaluateSeedsResult = await this.steps.evaluateSeeds(
        this.userInput,
        evaluateSeedsInput,
        this.config,
        attemptLogger,
        {
          secrets: {
            kakaoRestApiKey: this.secrets.kakaoRestApiKey,
            naverSearchClientId: this.secrets.naverSearchClientId,
            naverSearchClientSecret: this.secrets.naverSearchClientSecret,
            openAiApiKey: this.secrets.openAiApiKey,
          },
          onProgress: this.onProgress,
        },
      );
      if (!evaluateSeedsResult.ok) {
        // 평가 자체가 실패한 경우와 "후보가 더 필요함"은 다른 결과로 취급한다.
        attemptLogger.warn("engine.attempt.failure", {
          failedStep: evaluateSeedsResult.failedStep,
          errorCode: evaluateSeedsResult.errorCode,
        });
        this.logger.warn("engine.process.failure", {
          failedStep: evaluateSeedsResult.failedStep,
          errorCode: evaluateSeedsResult.errorCode,
        });
        return {
          status: "ERROR",
          userInput: this.userInput,
          error: {
            code: evaluateSeedsResult.errorCode,
            message: evaluateSeedsResult.message,
          },
        };
      }

      if ("needsMoreSeeds" in evaluateSeedsResult) {
        const { excludeSeedKeys, reason } = evaluateSeedsResult.needsMoreSeeds;

        // 페이지를 더 넘길 수 없으면 예전에는 여기서 바로 실패했다. 하지만 "이 검색어의
        // 결과를 다 봤다"는 건 "다른 검색어도 소용없다"는 뜻이 아니다. 실패 사유를
        // 알려주고 새 검색어를 만들어 한 번 더 시도한다.
        const nextQueries =
          discoverSeedsOutput.nextQueries.length > 0
            ? discoverSeedsOutput.nextQueries
            : await this.regenerateQueries(discoveryState.queries, reason, attemptLogger);

        if (nextQueries.length === 0) {
          attemptLogger.warn("engine.attempt.failure", {
            failedStep: "discoverSeeds",
            errorCode: "DISCOVER_SEEDS_EXHAUSTED",
            reason,
          });
          this.logger.warn("engine.process.failure", {
            failedStep: "discoverSeeds",
            errorCode: "DISCOVER_SEEDS_EXHAUSTED",
          });
          return {
            status: "ERROR",
            userInput: this.userInput,
            error: {
              code: "DISCOVER_SEEDS_EXHAUSTED",
              message: "No discovery queries remain after evaluateSeeds requested more seeds",
            },
          };
        }

        // 다음 discoverSeeds 호출이 같은 후보/검색 조합을 반복하지 않도록 누적한다.
        discoverySeedPool = removeSeedKeysFromPool(discoverySeedPool, excludeSeedKeys);
        discoveryState = {
          ...discoveryState,
          alreadyCheckedIds: Array.from(
            new Set([
              ...discoveryState.alreadyCheckedIds,
              ...discoverSeedsOutput.seedKeys,
              ...excludeSeedKeys,
            ]),
          ),
          queries: nextQueries,
          previousFailureReason: reason,
        };
        attemptLogger.warn("engine.attempt.needs_more_seeds", {
          reason,
          excludeSeedKeyCount: excludeSeedKeys.length,
          retainedSeedPoolCount: discoverySeedPool.seedKeys.length,
          nextAlreadyCheckedIdCount: discoveryState.alreadyCheckedIds.length,
          nextQueryCount: discoveryState.queries.length,
        });
        continue;
      }

      // evaluateSeeds가 최종 추천을 만든 유일한 성공 경로다.
      attemptLogger.info("engine.attempt.success", {
        recommendationCount: evaluateSeedsResult.data.items.length,
      });
      finish({
        attemptNo: currAttemptNo,
        recommendationCount: evaluateSeedsResult.data.items.length,
      });

      return {
        status: "SUCCESS",
        userInput: this.userInput,
        userOutput: {
          originContext: buildRecommendationOriginContext(this.userInput),
          recommendations: evaluateSeedsResult.data.items,
        },
      };
    }

    this.logger.warn("engine.process.failure", {
      errorCode: "EVALUATE_SEEDS_NO_RECOMMENDABLE_CANDIDATES",
      maxDiscoveryAttempts: MAX_DISCOVERY_ATTEMPTS,
    });

    return {
      status: "ERROR",
      userInput: this.userInput,
      error: {
        code: "EVALUATE_SEEDS_NO_RECOMMENDABLE_CANDIDATES",
        message: `Exhausted ${MAX_DISCOVERY_ATTEMPTS} discovery attempts`,
      },
    };
  }
}

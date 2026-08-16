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
  UninterpretableRequestError,
} from "./steps/discoverSeeds/llm/approaches.js";
import { evaluateSeeds } from "./steps/evaluateSeeds/index.js";
import type {
  EvaluateSeedsFunnel,
  EvaluateSeedsOutput,
} from "./steps/evaluateSeeds/types.js";
import { toSearchCenter, toSearchRadiusMeters } from "./utils/geo.js";
import { validateNaturalLanguageRequest } from "./utils/request-validation.js";

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


/**
 * 검색 중심은 참여자 전체의 무게중심이다.
 *
 * 예전에는 `location[0]`(첫 참여자)만 썼다. 여러 명이 모이는 요청에서도 첫 사람
 * 주변만 탐색했고, 중간 지점은 출력 컨텍스트를 만들 때만 계산하고 정작 탐색에는
 * 쓰지 않았다. 반경도 5km 고정이라 혼자 혜화에서 요청해도 종각까지 훑었다.
 */
const getDefaultSearchLocation = (
  userInput: UserInput,
  widenStep: number,
): DiscoveryContext["queries"][number]["location"] | undefined => {
  const center = toSearchCenter(userInput);
  if (!center) return undefined;

  return {
    longitude: center.lng,
    latitude: center.lat,
    radiusKm: toSearchRadiusMeters(userInput, widenStep) / 1_000,
  };
};

const hydrateQueriesWithLocation = (
  queries: SearchQuery[],
  userInput: UserInput,
  widenStep = 0,
): SearchQuery[] => {
  const defaultLocation = getDefaultSearchLocation(userInput, widenStep);
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

  return {
    mode: origins.length > 1 ? "GROUP" : "SINGLE",
    origins,
    ...(origins.length > 0
      ? { center: toCenterLocation(origins.map((origin) => origin.location)) }
      : {}),
  };
};

const toOriginId = (index: number): string => (index === 0 ? "host" : `member-${index}`);

const toCenterLocation = (
  locations: UserInput["location"][number][],
): UserInput["location"][number] => ({
  lat: locations.reduce((sum, location) => sum + location.lat, 0) / locations.length,
  lng: locations.reduce((sum, location) => sum + location.lng, 0) / locations.length,
});

export type RecommendationEngineOptions = {
  onProgress?: (step: RecommendationProgressStep) => void;
  loggingActivated?: boolean;
  logger?: Logger;
  secrets?: RecommendationEngineSecrets;
};


export class RecommendationEngine {
  private readonly onProgress : RecommendationEngineOptions['onProgress'];
  private readonly config: EngineConfig;
  private readonly logger: Logger;
  private readonly secrets: RecommendationEngineSecrets;
  private readonly userInput: UserInput;

  constructor(input: UserInput, config: EngineConfig, options: RecommendationEngineOptions = {}) {
    this.onProgress = options.onProgress;
    this.config = config;
    this.logger = options.logger ?? (options.loggingActivated ? consoleLogger : noopLogger);
    this.secrets = options.secrets ?? {};
    this.userInput = input;
  }

  /**
   * 검색어를 소진했을 때 실패 사유를 근거로 새 검색어를 만든다.
   * 실패해도 재시도 자체를 막지는 않도록 빈 배열을 돌려준다.
   */
  private async regenerateQueries(
    previousQueries: SearchQuery[],
    previousFailureReason: string,
    logger: Logger,
    widenStep: number,
  ): Promise<SearchQuery[]> {
    try {
      const regenerated = await createDiscoveryContextWithLlm(this.userInput, {
        openAiApiKey: this.secrets.openAiApiKey,
        targetSeedCount: this.config.targetCount * this.config.candidatePoolMultiplier,
        retry: {
          previousQueries: previousQueries.map((query) => query.query),
          previousFailureReason,
        },
      });
      // 검색어를 새로 만들 때마다 반경도 한 단계 넓힌다. 기본 반경을 좁게 잡았기
      // 때문에, 상권이 얕은 동네에서 후보가 안 나오면 여기서 만회해야 한다.
      const hydrated = hydrateQueriesWithLocation(regenerated, this.userInput, widenStep);
      logger.info("engine.discovery_context.regenerated", {
        previousFailureReason,
        widenStep,
        searchRadiusMeters: toSearchRadiusMeters(this.userInput, widenStep),
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
    // 요청 단위 retry 상태만 지역 변수로 유지한다.
    // 엔진 인스턴스에 실행 결과를 저장하지 않아 같은 인스턴스 재호출도 독립적으로 동작한다.
    let discoveryState: EngineDiscoveryState = {
      alreadyCheckedIds: [],
      queries: [],
    };
    let discoverySeedPool: DiscoverySeedPool = EMPTY_DISCOVERY_SEED_POOL;
    /**
     * 목표 개수를 못 채운 시도 중 가장 결과가 많았던 것.
     *
     * 재시도를 다 쓰면 예전에는 통째로 실패했다. 쓸 만한 곳을 이미 찾아 놓고도
     * "10곳을 못 채웠다"는 이유로 사용자에게 아무것도 주지 않는 셈이었다.
     */
    let bestPartial: { data: EvaluateSeedsOutput; funnel: EvaluateSeedsFunnel } | undefined;
    const startedAt = Date.now();
    const finish = this.logger.startTimer("engine.process.success");
    this.logger.info("engine.process.start", {
      maxDiscoveryAttempts: MAX_DISCOVERY_ATTEMPTS,
      targetCount: this.config.targetCount,
    });

    // 의미 없는 입력은 여기서 끊는다. 계약이 `min(1)`뿐이라 "ㅁㄴㅇㄹ" 같은 문자열도
    // 그대로 통과했고, 그러면 LLM이 억지 검색어를 만든 뒤 결과가 안 나올 때까지
    // 재시도를 5번 돌린다. 입력 하나에 3분과 API 쿼터를 통째로 쓰는 셈이었다.
    const requestValidation = validateNaturalLanguageRequest(
      this.userInput.userNaturalLanguageRequest,
    );
    if (!requestValidation.usable) {
      this.logger.warn("engine.process.failure", {
        failedStep: "input",
        errorCode: requestValidation.code,
      });
      return {
        status: "ERROR",
        userInput: this.userInput,
        error: { code: requestValidation.code, message: requestValidation.reason },
      };
    }

    try {
      const finishDiscoveryContext = this.logger.startTimer("engine.discovery_context.success");
      this.onProgress?.('input_validated');
      const initialQueries = await createDiscoveryContextWithLlm(this.userInput, {
        openAiApiKey: this.secrets.openAiApiKey,
        targetSeedCount: this.config.targetCount * this.config.candidatePoolMultiplier,
      });
      discoveryState = {
        ...discoveryState,
        queries: hydrateQueriesWithLocation(initialQueries, this.userInput),
      };
      finishDiscoveryContext({
        queryCount: discoveryState.queries.length,
      });
    } catch (error) {
      // 규칙으로는 거를 수 없던 입력을 LLM이 "장소 요청이 아니다"로 판정한 경우.
      // 검색어 생성 실패와 구분해서, 사용자에게 다시 입력하라고 안내할 수 있게 한다.
      if (error instanceof UninterpretableRequestError) {
        this.logger.warn("engine.process.failure", {
          failedStep: "input",
          errorCode: "REQUEST_NOT_MEANINGFUL",
        });
        return {
          status: "ERROR",
          userInput: this.userInput,
          error: { code: "REQUEST_NOT_MEANINGFUL", message: error.message },
        };
      }

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
      const discoverSeedsResult = await discoverSeeds(discoveryContext, attemptLogger, {
        secrets: {
          tmapAppKey: this.secrets.tmapAppKey,
          kakaoRestApiKey: this.secrets.kakaoRestApiKey,
          naverSearchClientId: this.secrets.naverSearchClientId,
          naverSearchClientSecret: this.secrets.naverSearchClientSecret,
        },
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

      if (discoverySeedPool.seedKeys.length < this.config.targetCount) {
        const deferReason =
          discoverySeedPool.seedKeys.length === 0 ? "ZERO_SEEDS" : ("LOW_QUALITY" as const);

        // 페이지를 더 넘길 수 있으면 그게 가장 싸다.
        // 아니면 검색어를 새로 만들면서 반경을 한 단계 넓힌다. 기본 반경을 좁게
        // 잡았기 때문에 상권이 얕은 동네에서는 이 경로가 필요하다. 여기서 넓히지
        // 않으면 적은 후보로 비싼 평가 단계를 한 바퀴 돌고 나서야 알게 된다.
        const nextQueries =
          discoverSeedsOutput.nextQueries.length > 0
            ? discoverSeedsOutput.nextQueries
            : await this.regenerateQueries(
                discoveryState.queries,
                deferReason,
                attemptLogger,
                currAttemptNo,
              );

        if (nextQueries.length > 0) {
          discoveryState = {
            ...discoveryState,
            alreadyCheckedIds: Array.from(
              new Set([...discoveryState.alreadyCheckedIds, ...discoverSeedsOutput.seedKeys]),
            ),
            queries: nextQueries,
            previousFailureReason: deferReason,
          };
          attemptLogger.warn("engine.attempt.defer_evaluation", {
            seedPoolCount: discoverySeedPool.seedKeys.length,
            targetCount: this.config.targetCount,
            widened: discoverSeedsOutput.nextQueries.length === 0,
            nextAlreadyCheckedIdCount: discoveryState.alreadyCheckedIds.length,
            nextQueryCount: discoveryState.queries.length,
          });
          continue;
        }
        // 더 넓힐 수도 없으면 지금 모인 후보로라도 평가한다. 빈손보다 낫다.
      }

      const evaluateSeedsInput = toEvaluateSeedsInput(discoverySeedPool, discoverSeedsOutput);
      this.onProgress?.('evaluating');

      const evaluateSeedsResult = await evaluateSeeds(
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
        const partial = evaluateSeedsResult.partial;
        if (partial && partial.data.items.length > (bestPartial?.data.items.length ?? 0)) {
          bestPartial = partial;
        }

        // 페이지를 더 넘길 수 없으면 예전에는 여기서 바로 실패했다. 하지만 "이 검색어의
        // 결과를 다 봤다"는 건 "다른 검색어도 소용없다"는 뜻이 아니다. 실패 사유를
        // 알려주고 새 검색어를 만들어 한 번 더 시도한다.
        const nextQueries =
          discoverSeedsOutput.nextQueries.length > 0
            ? discoverSeedsOutput.nextQueries
            : await this.regenerateQueries(
                discoveryState.queries,
                reason,
                attemptLogger,
                currAttemptNo,
              );

        if (nextQueries.length === 0 && bestPartial) {
          // 더 찾을 방법은 없지만 이미 찾아 둔 곳은 있다. 적게라도 돌려준다.
          this.logger.warn("engine.process.partial_success", {
            reason,
            recommendationCount: bestPartial.data.items.length,
            targetCount: this.config.targetCount,
          });
          finish({
            attemptNo: currAttemptNo,
            recommendationCount: bestPartial.data.items.length,
          });
          return {
            status: "SUCCESS",
            userInput: this.userInput,
            userOutput: {
              originContext: buildRecommendationOriginContext(this.userInput),
              recommendations: bestPartial.data.items,
            },
            meta: {
              attemptCount: currAttemptNo,
              discoveredSeedCount: discoverySeedPool.seedKeys.length,
              durationMs: Date.now() - startedAt,
              ...bestPartial.funnel,
            },
          };
        }

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
        meta: {
          attemptCount: currAttemptNo,
          discoveredSeedCount: discoverySeedPool.seedKeys.length,
          durationMs: Date.now() - startedAt,
          ...evaluateSeedsResult.funnel,
        },
      };
    }

    if (bestPartial) {
      // 재시도를 다 썼지만 찾아 둔 곳은 있다.
      this.logger.warn("engine.process.partial_success", {
        recommendationCount: bestPartial.data.items.length,
        targetCount: this.config.targetCount,
        maxDiscoveryAttempts: MAX_DISCOVERY_ATTEMPTS,
      });
      return {
        status: "SUCCESS",
        userInput: this.userInput,
        userOutput: {
          originContext: buildRecommendationOriginContext(this.userInput),
          recommendations: bestPartial.data.items,
        },
        meta: {
          attemptCount: MAX_DISCOVERY_ATTEMPTS,
          discoveredSeedCount: discoverySeedPool.seedKeys.length,
          durationMs: Date.now() - startedAt,
          ...bestPartial.funnel,
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

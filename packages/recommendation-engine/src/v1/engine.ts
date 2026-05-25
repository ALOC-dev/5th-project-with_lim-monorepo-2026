import type { UserInput } from "./interfaces/input.contracts.js";
import {
  DEFAULT_CANDIDATE_POOL_MULTIPLIER,
  DEFAULT_TARGET_COUNT,
  DEFAULT_WEIGHTS,
} from "./configs/constants.js";
import type { EngineConfig } from "./configs/types.js";
import type { RecommendationEngineSecrets } from "./credentials.js";
import type { EngineOutput } from "./interfaces/output.contracts.js";
import { createDiscoveryContextWithLlm } from "./steps/discoverSeeds/llm/approaches.js";
import { discoverSeeds } from "./steps/discoverSeeds/index.js";
import { evaluateSeeds } from "./steps/evaluateSeeds/index.js";
import {
  DiscoveryContextSchema,
  type DiscoveryContext,
  type SearchQuery,
  type EvaluateSeedsRetryReason,
} from "./steps/discoverSeeds/contracts.js";
import {
  consoleLogger,
  noopLogger,
  type Logger,
} from "./observability/logger.js";

const MAX_DISCOVERY_ATTEMPTS = 5;

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
  const [firstLocation] = userInput.location;
  if (!firstLocation) return undefined;

  return {
    longitude: firstLocation.lng,
    latitude: firstLocation.lat,
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

export type RecommendationEngineOptions = {
  loggingActivated?: boolean;
  secrets?: RecommendationEngineSecrets;
};

export class RecommendationEngine {
  private readonly config: EngineConfig;
  private readonly logger: Logger;
  private readonly secrets: RecommendationEngineSecrets;
  private readonly userInput: UserInput;

  constructor(
    input: UserInput,
    config: EngineConfig,
    options: RecommendationEngineOptions = {},
  ) {
    this.config = config;
    this.logger = options.loggingActivated ? consoleLogger : noopLogger;
    this.secrets = options.secrets ?? {};
    this.userInput = input;
  }

  async process(): Promise<EngineOutput> {
    // 요청 단위 retry 상태만 지역 변수로 유지한다.
    // 엔진 인스턴스에 실행 결과를 저장하지 않아 같은 인스턴스 재호출도 독립적으로 동작한다.
    let discoveryState: EngineDiscoveryState = {
      alreadyCheckedIds: [],
      queries: [],
    };
    const finish = this.logger.startTimer("engine.process.success");
    this.logger.info("engine.process.start", {
      maxDiscoveryAttempts: MAX_DISCOVERY_ATTEMPTS,
      targetCount: this.config.targetCount,
    });

    try {
      const finishDiscoveryContext = this.logger.startTimer(
        "engine.discovery_context.success",
      );
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

    for (
      let currAttemptNo = 1;
      currAttemptNo <= MAX_DISCOVERY_ATTEMPTS;
      currAttemptNo += 1
    ) {
      const attemptLogger = this.logger.withContext({
        attemptNo: currAttemptNo,
      });
      attemptLogger.info("engine.attempt.start", {
        alreadyCheckedIdCount: discoveryState.alreadyCheckedIds.length,
        queryCount: discoveryState.queries.length,
        previousFailureReason: discoveryState.previousFailureReason,
      });

      const discoveryContext = buildDiscoveryContext(this.config, {
        ...discoveryState,
        attemptNo: currAttemptNo,
      });
      const discoverSeedsResult = await discoverSeeds(
        this.userInput,
        discoveryContext,
        attemptLogger,
        { secrets: { tmapAppKey: this.secrets.tmapAppKey } },
      );
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

      const evaluateSeedsResult = await evaluateSeeds(
        this.userInput,
        discoverSeedsOutput,
        this.config,
        attemptLogger,
        {
          secrets: {
            kakaoRestApiKey: this.secrets.kakaoRestApiKey,
            naverSearchClientId: this.secrets.naverSearchClientId,
            naverSearchClientSecret: this.secrets.naverSearchClientSecret,
            openAiApiKey: this.secrets.openAiApiKey,
          },
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
        if (discoverSeedsOutput.nextQueries.length === 0) {
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
              message:
                "No discovery queries remain after evaluateSeeds requested more seeds",
            },
          };
        }

        // 다음 discoverSeeds 호출이 같은 후보/검색 조합을 반복하지 않도록 누적한다.
        discoveryState = {
          ...discoveryState,
          alreadyCheckedIds: Array.from(
            new Set([
              ...discoveryState.alreadyCheckedIds,
              ...discoverSeedsOutput.seedKeys,
              ...excludeSeedKeys,
            ]),
          ),
          queries: discoverSeedsOutput.nextQueries,
          previousFailureReason: reason,
        };
        attemptLogger.warn("engine.attempt.needs_more_seeds", {
          reason,
          excludeSeedKeyCount: excludeSeedKeys.length,
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
        userOutput: { recommendations: evaluateSeedsResult.data.items },
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

import { UserInputSchema, type UserInput } from "./interfaces/input.js";
import {
  DEFAULT_CANDIDATE_POOL_MULTIPLIER,
  DEFAULT_TARGET_COUNT,
  DEFAULT_WEIGHTS,
} from "./configs/constants.js";
import type { EngineConfig } from "./configs/types.js";
import type { EngineOutput } from "./interfaces/output.js";
import { discoverSeeds } from "./steps/discoverSeeds/index.js";
import { evaluateSeeds } from "./steps/evaluateSeeds/index.js";
import { buildDiscoveryContext } from "./steps/discoverSeeds/utils/index.js";
import type {
  EvaluateSeedsRetryReason,
  SearchApproach,
} from "./steps/discoverSeeds/types.js";
import { noopLogger, type Logger } from "./observability/logger.js";

const MAX_DISCOVERY_ATTEMPTS = 3;

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  targetCount: DEFAULT_TARGET_COUNT,
  candidatePoolMultiplier: DEFAULT_CANDIDATE_POOL_MULTIPLIER,
  weights: DEFAULT_WEIGHTS,
};

type EngineDiscoveryState = {
  excludedSeedKeys: string[];
  visitedSearchKeys: string[];
  previousFailureReason?: EvaluateSeedsRetryReason;
  presetApproaches?: SearchApproach[];
};

export type RecommendationEngineOptions = {
  logger?: Logger;
};

export class RecommendationEngine {
  private readonly config: EngineConfig;
  private readonly logger: Logger;
  private readonly userInput: UserInput;

  constructor(
    input: unknown,
    config: EngineConfig,
    options: RecommendationEngineOptions = {},
  ) {
    this.config = config;
    this.logger = options.logger ?? noopLogger;
    this.userInput = this.validateUserInput(input);
  }

  async process(): Promise<EngineOutput> {
    // 요청 단위 retry 상태만 지역 변수로 유지한다.
    // 엔진 인스턴스에 실행 결과를 저장하지 않아 같은 인스턴스 재호출도 독립적으로 동작한다.
    let discoveryState: EngineDiscoveryState = {
      excludedSeedKeys: [],
      visitedSearchKeys: [],
    };
    const finish = this.logger.startTimer("engine.process.success");
    this.logger.info("engine.process.start", {
      maxDiscoveryAttempts: MAX_DISCOVERY_ATTEMPTS,
      targetCount: this.config.targetCount,
    });

    for (
      let currAttemptNo = 1;
      currAttemptNo <= MAX_DISCOVERY_ATTEMPTS;
      currAttemptNo += 1
    ) {
      const attemptLogger = this.logger.withContext({
        attemptNo: currAttemptNo,
      });
      attemptLogger.info("engine.attempt.start", {
        excludedSeedKeyCount: discoveryState.excludedSeedKeys.length,
        visitedSearchKeyCount: discoveryState.visitedSearchKeys.length,
        previousFailureReason: discoveryState.previousFailureReason,
        presetApproachCount: discoveryState.presetApproaches?.length ?? 0,
      });

      const discoveryContext = buildDiscoveryContext(this.config, {
        ...discoveryState,
        attemptNo: currAttemptNo,
      });
      const discoverSeedsResult = await discoverSeeds(
        this.userInput,
        discoveryContext,
        attemptLogger,
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
        const { excludeSeedKeys, presetApproaches, reason } =
          evaluateSeedsResult.needsMoreSeeds;
        // 다음 discoverSeeds 호출이 같은 후보/검색 조합을 반복하지 않도록 누적한다.
        discoveryState = {
          excludedSeedKeys: Array.from(
            new Set([
              ...discoveryState.excludedSeedKeys,
              ...discoverSeedsOutput.seedKeys,
              ...excludeSeedKeys,
            ]),
          ),
          visitedSearchKeys: [
            ...discoveryState.visitedSearchKeys,
            ...discoverSeedsOutput.visitedSearchKeysAdded,
          ],
          previousFailureReason: reason,
        };
        if (presetApproaches)
          discoveryState.presetApproaches = presetApproaches;
        attemptLogger.warn("engine.attempt.needs_more_seeds", {
          reason,
          excludeSeedKeyCount: excludeSeedKeys.length,
          nextExcludedSeedKeyCount: discoveryState.excludedSeedKeys.length,
          nextVisitedSearchKeyCount: discoveryState.visitedSearchKeys.length,
          presetApproachCount: presetApproaches?.length ?? 0,
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

  private validateUserInput(input: unknown): UserInput {
    // 이후 단계는 UserInput만 받도록 입구에서 unknown을 한 번만 좁힌다.
    this.logger.info("engine.input_validation.start", {
      inputType: typeof input,
    });

    const validationResult = UserInputSchema.safeParse(input);
    if (!validationResult.success) {
      this.logger.warn("engine.input_validation.failure", {
        errorCode: "INVALID_USER_INPUT",
        issueCount: validationResult.error.issues.length,
      });
      throw new Error(
        `Input validation failed: ${validationResult.error.message}`,
      );
    }

    return validationResult.data;
  }
}

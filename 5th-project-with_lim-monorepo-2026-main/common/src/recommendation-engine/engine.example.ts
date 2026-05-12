import {
  EngineInputSchema,
  EngineOutputSchema,
  type EngineInput,
  type EngineOutput,
  type UserInput,
} from "./contracts/index.js";
import { dedupeCandidates, getFilteringReason } from "./util/filtering.js";
import { formatZodIssues } from "./util/format.js";
import {
  DEFAULT_WEIGHTS,
  scoreCandidates,
  sumWeights,
  toRecommendationItem,
} from "./util/scoring.js";
import type {
  CandidateCollection,
  EngineConfig,
  EngineProcessFailure,
  EngineProcessResult,
  RecommendationCandidate,
  RequiredEngineConfig,
  ScoredCandidate,
  ScoringWeights,
} from "./util/types.js";

export type {
  EngineConfig,
  EngineProcessResult,
  RecommendationCandidate,
  ScoringWeights,
};

class RecommendationEngine {
  private readonly config: RequiredEngineConfig;

  constructor(
    private readonly engineInput: EngineInput,
    config: EngineConfig = {},
  ) {
    this.config = {
      targetCount: config.targetCount ?? 5,
      candidatePoolMultiplier: config.candidatePoolMultiplier ?? 10,
      maxDistanceKm: config.maxDistanceKm ?? 10,
      weights: config.weights ?? DEFAULT_WEIGHTS,
      now: config.now ?? (() => new Date()),
    };
    this.collectCandidates = config.collectCandidates;
    this.seedCandidates = config.candidates ?? [];
  }

  private readonly collectCandidates?: EngineConfig["collectCandidates"];
  private readonly seedCandidates: RecommendationCandidate[];

  /**
   * 추천 엔진의 전체 실행 흐름입니다.
   *
   * Step 1에서 입력과 설정을 검증하고, Step 2에서 후보를 수집/필터링한 뒤,
   * Step 3에서 점수를 계산하고, Step 4에서 최종 출력 스키마를 검증합니다.
   * 각 단계가 실패하면 이후 단계는 실행하지 않고 실패 결과를 즉시 반환합니다.
   */
  async process(): Promise<EngineProcessResult> {
    const inputResult = this.step1();
    if (!inputResult.ok) return inputResult;

    const candidateResult = await this.step2(inputResult.data);
    if (!candidateResult.ok) return candidateResult;

    const scoringResult = this.step3(
      inputResult.data.userInput,
      candidateResult.data,
    );
    if (!scoringResult.ok) return scoringResult;

    return this.step4(
      inputResult.data,
      scoringResult.data,
      candidateResult.data,
    );
  }

  /**
   * Step 1: 입력 검증.
   *
   * 프론트엔드 또는 호출자가 넘긴 `EngineInput`이 계약 스키마에 맞는지 확인하고,
   * Scoring 가중치 합계가 100인지 함께 검증합니다.
   *
   * 실패 조건:
   * - `EngineInputSchema` 검증 실패
   * - `inputMatch + trust + accessibility + diversity !== 100`
   */
  step1(): EngineProcessFailure | { ok: true; data: EngineInput } {
    const parsedInput = EngineInputSchema.safeParse(this.engineInput);
    if (!parsedInput.success) {
      return {
        ok: false,
        step: "INPUT_VALIDATION",
        errorCode: "INVALID_INPUT",
        message: formatZodIssues(parsedInput.error.issues),
      };
    }

    const weightSum = sumWeights(this.config.weights);
    if (weightSum !== 100) {
      return {
        ok: false,
        step: "INPUT_VALIDATION",
        errorCode: "INVALID_SCORING_WEIGHTS",
        message: `scoring weights must sum to 100, received ${weightSum}`,
      };
    }

    return { ok: true, data: parsedInput.data };
  }

  /**
   * Step 2: 후보 수집 및 하드 필터링.
   *
   * `config.collectCandidates`가 있으면 외부 후보 수집 로직을 실행하고,
   * 없으면 테스트/목업용으로 주입된 `config.candidates`를 사용합니다.
   * 이후 중복 후보를 제거하고, 예산/거리/영업시간/스키마 품질 기준으로
   * 확실히 제외해야 하는 후보를 걸러냅니다.
   *
   * 실패 조건:
   * - 후보 수집 함수에서 예외 발생
   */
  async step2(
    input: EngineInput,
  ): Promise<EngineProcessFailure | { ok: true; data: CandidateCollection }> {
    try {
      const collected = this.collectCandidates
        ? await this.collectCandidates(input, this.config)
        : this.seedCandidates;

      const filteredOut: CandidateCollection["filteredOut"] = [];
      const candidates = dedupeCandidates(collected).filter((candidate) => {
        const filterReason = getFilteringReason(
          candidate,
          input.userInput,
          this.config,
        );
        if (filterReason) {
          filteredOut.push({
            id: candidate.id || candidate.name || "UNKNOWN",
            reason: filterReason,
          });
          return false;
        }
        return true;
      });

      const targetPoolSize =
        this.config.targetCount * this.config.candidatePoolMultiplier;

      return {
        ok: true,
        data: {
          candidates: candidates.slice(0, targetPoolSize),
          filteredOut,
        },
      };
    } catch (error) {
      return {
        ok: false,
        step: "CANDIDATE_COLLECTION",
        errorCode: "CANDIDATE_COLLECTION_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "failed to collect candidates",
      };
    }
  }

  /**
   * Step 3: 후보 점수화.
   *
   * Step 2를 통과한 후보를 대상으로 100점 기준의 최종 추천 점수를 계산합니다.
   * 기본 가중치는 입력 일치도 35, 신뢰도/인지도 30, 접근성/편의성 20,
   * 다양성 보정 15입니다.
   *
   * 실패 조건:
   * - 필터링 이후 점수화할 후보가 하나도 없음
   */
  step3(
    userInput: UserInput,
    collection: CandidateCollection,
  ): EngineProcessFailure | { ok: true; data: ScoredCandidate[] } {
    if (collection.candidates.length === 0) {
      return {
        ok: false,
        step: "SCORING",
        errorCode: "NO_CANDIDATES",
        message: "no candidates remained after filtering",
      };
    }

    return {
      ok: true,
      data: scoreCandidates(collection.candidates, userInput, this.config),
    };
  }

  /**
   * Step 4: 출력 검증.
   *
   * 점수화된 후보를 `EngineOutput` 형태로 변환하고,
   * 최종 응답이 `EngineOutputSchema`를 만족하는지 검증합니다.
   * 이 단계까지 통과한 데이터만 호출자에게 성공 결과로 반환됩니다.
   *
   * 실패 조건:
   * - 추천 결과가 출력 계약 스키마를 만족하지 않음
   */
  step4(
    input: EngineInput,
    scoredCandidates: ScoredCandidate[],
    collection: CandidateCollection,
  ): EngineProcessResult {
    const output: EngineOutput = {
      status: "SUCCESS",
      userInput: input.userInput,
      meta: {
        generatedAt: this.config.now().toISOString(),
        candidateCount: collection.candidates.length,
        filteredOutCount: collection.filteredOut.length,
        scoringWeights: this.config.weights,
        inputMeta: input.meta,
      },
      userOutput: {
        recommendations: scoredCandidates.map((scoredCandidate) =>
          toRecommendationItem(scoredCandidate),
        ),
      },
    };

    const parsedOutput = EngineOutputSchema.safeParse(output);
    if (!parsedOutput.success) {
      return {
        ok: false,
        step: "OUTPUT_VALIDATION",
        errorCode: "INVALID_OUTPUT",
        message: formatZodIssues(parsedOutput.error.issues),
      };
    }

    return { ok: true, data: parsedOutput.data };
  }
}

export default RecommendationEngine;

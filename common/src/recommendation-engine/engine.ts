import {
  EngineInputSchema,
  EngineOutputSchema,
  type EngineInput,
  type EngineOutput,
  type UserInput,
} from "./contracts/index.js"; // 입력과 출력 데이터의 규격을 정의한 체크리스트
import { dedupeCandidates, getFilteringReason } from "./util/filtering.js"; // 중복된 장소를 제거하거나 특정조건에 맞지 않은 후보를 걸러내는 필터 도구
import { formatZodIssues } from "./util/format.js";
import {
  DEFAULT_WEIGHTS,
  scoreCandidates,
  sumWeights,
  toRecommendationItem,
} from "./util/scoring.js"; // 부적절한 후보를 걸러내고 점수를 매기는 계산기
import type {
  CandidateCollection,
  EngineConfig,
  EngineProcessFailure,
  EngineProcessResult,
  RecommendationCandidate,
  RequiredEngineConfig,
  ScoredCandidate,
  ScoringWeights,
} from "./util/types.js"; // 이 코드 안에서 사용할 데이터들의 이름표를 정의

// 네이버 지도 실시간 데이터 수집 함수 임포트
import { getNaverRestaurantStats } from "./lib/naverMap.js";

export type {
  EngineConfig,
  EngineProcessResult,
  RecommendationCandidate,
};

class RecommendationEngine { // 추천 엔진의 본체
  private readonly config: RequiredEngineConfig; // 엔진 운영에 필요한 최종 설정값이 담김

  constructor(
    private readonly engineInput: EngineInput,
    config: EngineConfig = {},
  ) {
    this.config = {
      targetCount: config.targetCount ?? 5, // 최종적으로 보여줄 개수
      candidatePoolMultiplier: config.candidatePoolMultiplier ?? 10,
      maxDistanceKm: config.maxDistanceKm ?? 10, // 검색 반경
      weights: config.weights ?? DEFAULT_WEIGHTS, // 점수 매길 때의 가중치
      now: config.now ?? (() => new Date()), // 현재 시간 기준
    };
    this.collectCandidates = config.collectCandidates;
    this.seedCandidates = config.candidates ?? [];
  }

  private readonly collectCandidates?: EngineConfig["collectCandidates"]; // 외부 API나 DB에서 후보지 데이터를 가져오는 함수
  private readonly seedCandidates: RecommendationCandidate[]; // 외부 호출 대신 직접 넣어준 초기 후보지 목록

  /**
   * 추천 엔진의 전체 실행 흐름입니다.
   */
  async process(): Promise<EngineProcessResult> {
    // Step 1: 입력 데이터 검증
    const inputResult = this.step1();
    if (!inputResult.ok) return inputResult;

    // Step 2: 후보지 수집 (DB 또는 초기값)
    const candidateResult = await this.step2(inputResult.data);
    if (!candidateResult.ok) return candidateResult;

    // 점수 계산(Step 3)을 하기 직전에 데이터를 보강하는 것이 가장 효율적입니다.
    await this.enrichCandidatesWithNaver(candidateResult.data.candidates);

    // Step 3: 점수 계산 및 랭킹 산정
    const scoringResult = this.step3(
      inputResult.data.userInput,
      candidateResult.data,
    );
    if (!scoringResult.ok) return scoringResult;

    // Step 4: 최종 결과 출력 및 검증
    return this.step4(
      inputResult.data,
      scoringResult.data,
      candidateResult.data,
    );
  }

  /**
   *후보지들의 실제 평점 데이터를 실시간으로 가져와 보강합니다.
   */
  private async enrichCandidatesWithNaver(candidates: RecommendationCandidate[]) {
    console.log(` ${candidates.length}개의 후보지에 대해 네이버 데이터 조회를 시작합니다...`);
    
    // 비용과 속도를 고려하여 상위 후보군만 처리하는 것이 좋지만, 
    // 여기서는 수집된 모든 후보에 대해 순차적으로 정보를 업데이트합니다.
    for (const candidate of candidates) {
      if (!candidate.name) continue;

      // Apify 스크래퍼 실행 (우리가 찾은 Golden Key: visitorReviewsScore 사용)
      const realStats = await getNaverRestaurantStats(candidate.name);
      
      if (realStats) {
        // 기존 후보지의 rating과 리뷰 정보를 실시간 데이터로 교체합니다.
        // scoring.js 내부의 로직이 이 업데이트된 값을 바탕으로 최종 점수를 매기게 됩니다.
        candidate.rating = realStats.rating;
        (candidate as any).visitorReviews = realStats.reviews; // 필드명이 다를 수 있어 any 처리
        
        console.log(`✅ ${candidate.name}: ${realStats.rating}점 / 리뷰 ${realStats.reviews}개`);
      }
    }
  }

  /**
   * Step 1: 입력 검증.
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
          console.log(` [필터 탈락!] 식당: ${candidate.name}, 사유: ${filterReason}`);
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
        recommendations: scoredCandidates.map((scoredCandidate) => {
          // 1. 기존 변환 함수로 아이템 생성
          const item = toRecommendationItem(scoredCandidate);

          // 2. [핵심] Zod strict 모드를 통과하기 위해 임시 필드들을 제거합니다.
          // 네이버 데이터는 이미 score와 reasons에 반영되었으므로 껍데기는 버려도 됩니다.
          const { rating, visitorReviews, ...cleanItem } = item as any;

          return cleanItem;
        }),
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
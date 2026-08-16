import type { UserInput } from "../../../interfaces/input.contracts.js";
import { generateRecommendationObject, RECOMMENDATION_LLM_MODEL_ID } from "../../../llm/ai-sdk.js";
import type { Logger } from "../../../observability/logger.js";
import { mapWithConcurrency } from "../../../utils/concurrency.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import { LlmShortlistResponseSchema } from "./shortlist.contracts.js";

/**
 * 한 번에 판단할 후보 수.
 *
 * 후보 하나가 상호·업종·거리뿐이라 40개도 부담스럽지 않다. 너무 잘게 나누면
 * 호출 수만 늘고, 너무 크게 묶으면 뒤쪽 후보를 대충 보게 된다.
 */
const SHORTLIST_CHUNK_SIZE = 40;
const SHORTLIST_CONCURRENCY = 4;

const SHORTLIST_SYSTEM_PROMPT = `너는 지역 추천 엔진의 사전 선별기다.
사용자 요청과 후보 목록(상호·업종·거리)을 보고, 각 후보가 요청 조건에 얼마나 맞아
보이는지 0~100으로 매긴다. 이 점수는 "어떤 후보를 더 자세히 조사할지" 정하는 데만
쓰인다. 여기서 낮은 점수를 받으면 조사 자체를 못 받으니, 애매하면 중간 점수를 준다.

판단 기준:
- 요청이 특정 업종이나 음식을 지목했으면 그것과 맞는지를 가장 무겁게 본다.
  "곱창"을 찾는데 김밥집이면 낮다. 업종을 알 수 없으면 깎지 말고 중간을 준다.
- 요청에 분위기나 상황 조건이 있으면 그것도 본다.
  "조용한", "아늑한", "대화하기 좋은", "작업하기 좋은"을 찾으면 **전국에 지점이 많은
  체인은 낮게 준다**. 상호에 지점명이 붙어 있고 널리 알려진 브랜드면 체인으로 본다.
  스페셜티 커피를 내세우는 체인도 마찬가지다 — 커피 품질이 아니라 붐비는 정도가 기준이다.
  "데이트"에 시끌벅적한 체인은 낮다. "가족 모임"에 좌석이 적어 보이는 소형 매장은 낮다.
- 식이 제약(비건·채식·할랄 등)이 있으면 육류가 주력으로 보이는 곳을 낮게 준다.
- 요청이 격식이나 가격대를 말하면(파인다이닝·오마카세·코스요리·기념일·고급) 그 격에
  맞는지 본다. 업종 분류에는 격식이 안 담기므로 상호와 업종을 함께 보고 판단한다.
  피자집·분식집·프랜차이즈처럼 캐주얼한 곳은 낮게 준다.
  반대로 "가성비", "혼밥", "간단히"를 말하면 격식 있는 곳을 낮게 준다.
- 거리는 가까울수록 낫지만, 조건이 맞는 쪽이 훨씬 중요하다. 거리로 뒤집지 마라.
- 상호에 업종어가 들어갔다고 그 업종으로 단정하지 마라.
  "프린트카페"는 카페가 아니라 인쇄소다. 업종 분류를 우선한다.

규칙:
- 입력된 모든 candidateId에 정확히 하나씩 점수를 준다. candidateId는 그대로 쓴다.
- 점수는 **절대 기준**으로 매긴다. 이 묶음 안에서의 등수가 아니다.
  같은 후보라면 어떤 묶음에 들어가도 같은 점수가 나와야 한다.
- 출력은 JSON schema만 따른다. 설명 문장을 붙이지 않는다.`;

const buildShortlistPrompt = (
  userInput: UserInput,
  evidences: CandidateScoringEvidence[],
): string =>
  [
    "요청 조건:",
    "```json",
    JSON.stringify(
      {
        userNaturalLanguageRequest: userInput.userNaturalLanguageRequest,
        partyType: userInput.partyType,
        numberOfPeople: userInput.numberOfPeople,
        budgetPerPerson: userInput.budgetPerPerson,
        schedule: userInput.schedule,
      },
      null,
      2,
    ),
    "```",
    "",
    "후보:",
    "```json",
    JSON.stringify(
      evidences.map((evidence) => ({
        candidateId: evidence.candidateId,
        name: evidence.name,
        category: [
          evidence.category.mainCategory,
          evidence.category.subCategory,
          ...evidence.category.tags,
        ]
          .filter(Boolean)
          .join(" > "),
        distanceMeters: evidence.accessibilitySignals.distanceMeters,
      })),
      null,
      1,
    ),
    "```",
  ].join("\n");

/**
 * 조사(enrichment) 전에 후보의 우선순위를 LLM으로 정한다.
 *
 * 예전에는 정규식 휴리스틱(업종 키워드·음식 계열·의미 감점·거리)만으로 조사 순서를
 * 정했다. 조사 예산이 한정돼 있어 이 순서가 사실상 최종 후보군을 결정하는데,
 * 실측에서 최종 선택된 10개의 조사 순위가 매번 풀 끝까지 걸쳐 있었다 — 좋은 후보를
 * 앞으로 모으지 못하고 있다는 뜻이다.
 *
 * 게다가 "조용한", "데이트", "가족 모임", "비건" 같은 조건은 정규식으로 다룰 수
 * 없다. 상호·업종·거리만 넘기면 되니 호출이 싸고, 후보 전체를 한 번에 볼 수 있다.
 *
 * 실패하면 빈 결과를 돌려주고 호출자가 기존 휴리스틱 순서를 그대로 쓴다. 이 단계는
 * 순서를 개선하는 것이지 없으면 안 되는 것이 아니다.
 */
export const scoreShortlistRelevance = async (
  userInput: UserInput,
  evidences: CandidateScoringEvidence[],
  logger: Logger,
  options: { openAiApiKey?: string } = {},
): Promise<Map<string, number>> => {
  if (evidences.length === 0) return new Map();

  const chunks: CandidateScoringEvidence[][] = [];
  for (let offset = 0; offset < evidences.length; offset += SHORTLIST_CHUNK_SIZE) {
    chunks.push(evidences.slice(offset, offset + SHORTLIST_CHUNK_SIZE));
  }

  const finish = logger.startTimer("evaluateSeeds.shortlist.success");
  logger.info("evaluateSeeds.shortlist.start", {
    candidateCount: evidences.length,
    chunkCount: chunks.length,
  });

  const results = await mapWithConcurrency(chunks, SHORTLIST_CONCURRENCY, async (chunk) => {
    try {
      const { items } = await generateRecommendationObject({
        task: "evaluate.shortlist",
        modelId: RECOMMENDATION_LLM_MODEL_ID,
        openAiApiKey: options.openAiApiKey,
        schema: LlmShortlistResponseSchema,
        system: SHORTLIST_SYSTEM_PROMPT,
        prompt: buildShortlistPrompt(userInput, chunk),
      });
      return items;
    } catch (error) {
      // 묶음 하나가 실패해도 나머지 순서는 살린다. 점수를 못 받은 후보는
      // 호출자가 기존 휴리스틱 순서로 처리한다.
      logger.warn("evaluateSeeds.shortlist.chunk_failure", {
        chunkSize: chunk.length,
        message: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  const relevanceByCandidateId = new Map<string, number>();
  const knownIds = new Set(evidences.map((evidence) => evidence.candidateId));
  for (const item of results.flat()) {
    // 모델이 없는 candidateId를 지어내는 경우가 있어 입력에 있던 것만 받는다.
    if (knownIds.has(item.candidateId)) relevanceByCandidateId.set(item.candidateId, item.relevance);
  }

  finish({
    candidateCount: evidences.length,
    scoredCount: relevanceByCandidateId.size,
  });
  return relevanceByCandidateId;
};

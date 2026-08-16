import { type OperationInfo, OperationInfoSchema } from "../../../interfaces/output.contracts.js";
import { generateRecommendationObject, RECOMMENDATION_LLM_MODEL_ID } from "../../../llm/ai-sdk.js";
import { isBotCheckPage } from "../tools/shared/text.js";
import type { EnrichmentSourceName } from "../utils/enrichment-types.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import type { OperationVerifier } from "../utils/operation-hours.js";
import { parseOperationInfo, toOperationSchedulesRecord } from "../utils/operation-hours.js";
import {
  type LlmOperationInfo,
  type LlmOperationInfoResponse,
  LlmOperationInfoResponseSchema,
} from "./operation-info.contracts.js";
import type {
  OperationInfoParseResult,
  ParseOperationInfoOptions,
} from "./operation-info.types.js";

export type { OperationInfoParseResult } from "./operation-info.types.js";

const OPERATION_INFO_MODEL_ID = RECOMMENDATION_LLM_MODEL_ID;
const MAX_OPERATION_TEXT_CHARS = 7_000;

const OPERATION_INFO_SYSTEM_PROMPT = `너는 한국 매장 영업시간 텍스트 파서다.
주어진 raw page text에서 후보 장소의 실제 weekly operation schedule만 구조화한다.

규칙:
- 후보 장소와 무관한 텍스트면 UNPARSEABLE을 반환한다.
- 영업시간이 명시되어 있지 않으면 추측하지 말고 UNPARSEABLE을 반환한다.
- "영업 중", "곧 영업 종료" 같은 현재 상태만 있고 weekly schedule이 없으면 UNPARSEABLE이다.
- "연중무휴", "매일", "무휴"와 단일 시간 범위가 함께 있으면 MONDAY..SUNDAY 전체에 같은 OPEN schedule을 적용한다.
- 요일을 구분하는 표현이 전혀 없이 단일 시간 범위 하나만 있으면(예: "11:30 - 23:00",
  "영업 전 11:30 오픈") 한국 매장 표기 관행상 매일 같은 시간으로 보고 MONDAY..SUNDAY
  전체에 적용한다. 요일별 정보가 없다는 이유만으로 UNPARSEABLE을 반환하지 않는다.
- "휴무안내: 연중무휴(명절 일부 제외)"처럼 예외 휴무가 있더라도 기본 weekly schedule은 전 요일 OPEN으로 구조화한다.
- "평일"은 MONDAY..FRIDAY, "주말"은 SATURDAY/SUNDAY, "주중"은 MONDAY..FRIDAY로 해석한다.
- "월~금", "월-금", "월요일~금요일"은 MONDAY..FRIDAY로 해석한다.
- "토, 일", "토·일", "토~일", "주말"은 SATURDAY/SUNDAY로 해석한다.
- "일요일휴무", "일 휴무"처럼 특정 요일 휴무가 있으면 해당 요일은 CLOSED로 둔다.
- "낮 12시"는 12:00, "새벽 1시"는 01:00, "익일 1시"는 close="01:00"으로 변환한다.
- "월~금 낮12시~새벽 1시, 토·일 11시~새벽 1시"처럼 요일 묶음별 open/close가 있으면 각각 별도 OPEN schedule로 구조화한다.
- 종료 시간이 생략된 "토, 일요일 11시..." 같은 문장은 같은 문장/인접 문장에서 공통 종료 시간이 명확할 때만 사용한다. 종료 시간이 끝내 없으면 UNPARSEABLE이다.
- "24시간", "연중무휴 24시간"처럼 명시된 경우에만 00:00-00:00 schedule을 쓸 수 있다.
- 24:00은 output schema에 맞춰 close="00:00"으로 변환한다.
- OPEN schedule은 open/close를 반드시 채우고, CLOSED schedule은 open/close를 null로 둔다.
- breakTimes는 명시된 경우 배열로 넣고, 없으면 null을 넣는다.
- lastOrderTime은 명시된 경우만 시간으로 넣고, 없으면 null을 넣는다.
- UNPARSEABLE이면 operationInfo는 null로 둔다.
- 요일은 MONDAY..SUNDAY 중 하나로만 반환한다.
- 출력은 반드시 JSON schema만 따른다.`;

export const parseOperationInfoWithLlmFallback = async ({
  text,
  openAiApiKey,
  evidence,
  operationVerifier,
  sourceName,
  sourceTextKind,
}: ParseOperationInfoOptions): Promise<OperationInfoParseResult> => {
  if (!text?.trim()) {
    return {
      parser: "none",
      reason: `${sourceName} page text was empty`,
    };
  }

  // 봇 차단 페이지를 "영업시간 없음"으로 기록하면 원인을 영영 알 수 없다.
  // 가게에 정보가 없는 것과 우리가 못 본 것은 다른 문제다.
  if (isBotCheckPage(text)) {
    return {
      parser: "none",
      reason: `${sourceName} was blocked by a bot-check page, so hours could not be read`,
    };
  }

  const deterministic = parseOperationInfo(text, operationVerifier.requestedDayOfWeek);
  const deterministicVerification = deterministic
    ? operationVerifier.verify(deterministic, [])
    : undefined;
  if (deterministic && deterministicVerification?.status !== "UNKNOWN") {
    return {
      operationInfo: deterministic,
      parser: "deterministic",
      reason: "Deterministic parser extracted operationInfo",
    };
  }

  if (!shouldTryLlmFallback(text, evidence)) {
    return {
      parser: "none",
      reason: `${sourceName} ${sourceTextKind} text had no reliable operation-hour fallback signal`,
    };
  }

  try {
    const response = await generateRecommendationObject({
      task: "evaluate.operation_hours",
      modelId: OPERATION_INFO_MODEL_ID,
      openAiApiKey,
      schema: LlmOperationInfoResponseSchema,
      system: OPERATION_INFO_SYSTEM_PROMPT,
      prompt: buildOperationInfoPrompt(
        text,
        evidence,
        operationVerifier,
        sourceName,
        sourceTextKind,
      ),
    });
    return toParseResult(response, sourceName);
  } catch (error) {
    return {
      parser: "none",
      reason:
        error instanceof Error ? error.message : `${sourceName} LLM operation-hour fallback failed`,
    };
  }
};

const toParseResult = (
  response: LlmOperationInfoResponse,
  sourceName: EnrichmentSourceName,
): OperationInfoParseResult => {
  if (response.status === "PARSED") {
    if (!response.operationInfo) {
      return {
        parser: "none",
        reason: `${sourceName} LLM parser returned PARSED without operationInfo`,
      };
    }
    const operationInfo = toOperationInfo(response.operationInfo);
    return {
      operationInfo,
      parser: "llm",
      reason: response.reason,
    };
  }

  return {
    parser: "none",
    reason: `${sourceName} LLM parser returned UNPARSEABLE: ${response.reason}`,
  };
};

const toOperationInfo = (value: LlmOperationInfo): OperationInfo =>
  OperationInfoSchema.parse({
    timezone: value.timezone,
    schedules: toOperationSchedulesRecord(
      value.schedules.map((schedule) => {
        if (schedule.status === "CLOSED") {
          return {
            daysOfWeek: schedule.daysOfWeek,
            status: "CLOSED",
          };
        }

        if (!schedule.open || !schedule.close) {
          throw new Error("OPEN operation schedule requires open and close");
        }

        return {
          daysOfWeek: schedule.daysOfWeek,
          status: "OPEN",
          open: schedule.open,
          close: schedule.close,
          breakTimes: schedule.breakTimes ?? [],
          ...(schedule.lastOrderTime ? { lastOrderTime: schedule.lastOrderTime } : {}),
        };
      }),
    ),
  });

const shouldTryLlmFallback = (text: string, evidence: CandidateScoringEvidence): boolean => {
  if (!hasOperationSignal(text)) return false;
  return hasCandidateIdentitySignal(text, evidence);
};

const buildOperationInfoPrompt = (
  text: string,
  evidence: CandidateScoringEvidence,
  operationVerifier: OperationVerifier,
  sourceName: EnrichmentSourceName,
  sourceTextKind: ParseOperationInfoOptions["sourceTextKind"],
): string =>
  [
    "아래 page text에서 후보 장소의 영업시간을 추출해줘.",
    "```json",
    JSON.stringify(
      {
        sourceName,
        sourceTextKind,
        requestedDayOfWeek: operationVerifier.requestedDayOfWeek,
        candidate: {
          name: evidence.name,
          category: evidence.category,
          address: evidence.placeInfo.address,
          roadAddress: evidence.placeInfo.roadAddress,
        },
        rawText: text.slice(0, MAX_OPERATION_TEXT_CHARS),
      },
      null,
      2,
    ),
    "```",
  ].join("\n");

const normalizeForSignal = (value: string): string => value.replace(/\s+/gu, "").toLowerCase();

/**
 * LLM 파서를 시도할 가치가 있는 텍스트인지.
 *
 * 이 게이트가 false면 LLM을 호출하지 않고 UNKNOWN으로 끝난다. 실측에서 UNKNOWN
 * 118건 중 50건(42%)이 여기서 죽었다.
 *
 * 원인은 키워드가 좁았던 것이다. 카카오맵은 "영업 전 11:30 오픈", "영업 종료"처럼
 * 표기하는데 기존 패턴은 `영업 중`과 `영업 시간`만 알았다. 시간 표기는 멀쩡히
 * 있는데 키워드가 안 맞아 버려졌다.
 *
 * 느슨하게 잡아도 안전하다. 뒤의 `hasCandidateIdentitySignal`이 무관한 페이지를
 * 걸러내고, LLM도 근거가 없으면 UNPARSEABLE을 돌려준다.
 */
export const hasOperationSignal = (text: string): boolean =>
  /영업\s*(?:시간|중|전|종료|시작)|영업시간|운영\s*시간|운영시간|오픈|마감|휴무|무휴|연중무휴|라스트\s*오더|브레이크|24\s*시간|매일|평일|주중|주말|월요일|화요일|수요일|목요일|금요일|토요일|일요일|[월화수목금토일]\s*[~\-–—]\s*[월화수목금토일]/u.test(
    text,
  ) && /(?:[01]?\d|2[0-4]):[0-5]\d/u.test(text);

const hasCandidateIdentitySignal = (text: string, evidence: CandidateScoringEvidence): boolean => {
  const normalized = normalizeForSignal(text);
  const candidateName = normalizeForSignal(evidence.name);
  if (candidateName && normalized.includes(candidateName)) return true;

  const textTokens = new Set(tokenizeForSignal(text));
  const nameTokens = tokenizeForSignal(evidence.name);
  const addressTokens = tokenizeForSignal(
    [evidence.placeInfo.roadAddress, evidence.placeInfo.address].join(" "),
  );
  const nameHitCount = nameTokens.filter((token) => textTokens.has(token)).length;
  const addressHitCount = addressTokens.filter((token) => textTokens.has(token)).length;
  if (nameTokens.length === 0) return false;

  return nameHitCount / nameTokens.length >= 0.5 || (nameHitCount > 0 && addressHitCount > 0);
};

const tokenizeForSignal = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

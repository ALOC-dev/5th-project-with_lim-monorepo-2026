import { z } from "zod";

import {
  generateRecommendationObject,
  RECOMMENDATION_LLM_MODEL_ID,
} from "../../../llm/ai-sdk.js";
import {
  OperationInfoSchema,
  dayOfWeekValues,
  type DayOfWeek,
  type OperationInfo,
} from "../../../interfaces/output.js";
import type { CandidateScoringEvidence } from "../utils/evidence.js";
import type { EnrichmentSourceName } from "../utils/enrichment-types.js";
import {
  OperationVerifier,
  parseOperationInfo,
} from "../utils/operation-hours.js";

export type OperationInfoParseResult = {
  operationInfo?: OperationInfo;
  parser: "deterministic" | "llm" | "none";
  reason: string;
};

type ParseOperationInfoOptions = {
  text: string | undefined;
  evidence: CandidateScoringEvidence;
  operationVerifier: OperationVerifier;
  sourceName: EnrichmentSourceName;
  sourceTextKind: "snippet" | "scraped_page" | "agentic_fetch";
};

const time24hRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const LlmBreakTimeSchema = z
  .object({
    start: z.string().regex(time24hRegex),
    end: z.string().regex(time24hRegex),
  })
  .strict();

const LlmOperationScheduleSchema = z
  .object({
    daysOfWeek: z.array(z.enum(dayOfWeekValues)).min(1),
    status: z.enum(["OPEN", "CLOSED"]),
    open: z.string().regex(time24hRegex).nullable(),
    close: z.string().regex(time24hRegex).nullable(),
    breakTimes: z.array(LlmBreakTimeSchema).nullable(),
    lastOrderTime: z.string().regex(time24hRegex).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "OPEN") {
      if (!value.open) {
        context.addIssue({
          code: "custom",
          message: "open is required when status is OPEN",
          path: ["open"],
        });
      }
      if (!value.close) {
        context.addIssue({
          code: "custom",
          message: "close is required when status is OPEN",
          path: ["close"],
        });
      }
      return;
    }

    if (value.open !== null) {
      context.addIssue({
        code: "custom",
        message: "open must be null when status is CLOSED",
        path: ["open"],
      });
    }
    if (value.close !== null) {
      context.addIssue({
        code: "custom",
        message: "close must be null when status is CLOSED",
        path: ["close"],
      });
    }
  });

const LlmOperationInfoSchema = z
  .object({
    timezone: z.literal("Asia/Seoul"),
    schedules: z.array(LlmOperationScheduleSchema).min(1),
  })
  .strict();

const LlmOperationInfoResponseSchema = z
  .object({
    status: z.enum(["PARSED", "UNPARSEABLE"]),
    operationInfo: LlmOperationInfoSchema.nullable(),
    reason: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "PARSED" && !value.operationInfo) {
      context.addIssue({
        code: "custom",
        message: "operationInfo is required when status is PARSED",
        path: ["operationInfo"],
      });
    }
    if (value.status === "UNPARSEABLE" && value.operationInfo !== null) {
      context.addIssue({
        code: "custom",
        message: "operationInfo must be null when status is UNPARSEABLE",
        path: ["operationInfo"],
      });
    }
  });

type LlmOperationInfoResponse = z.infer<typeof LlmOperationInfoResponseSchema>;

const OPERATION_INFO_MODEL_ID = RECOMMENDATION_LLM_MODEL_ID;
const MAX_OPERATION_TEXT_CHARS = 7_000;

const OPERATION_INFO_SYSTEM_PROMPT = `너는 한국 매장 영업시간 텍스트 파서다.
주어진 raw page text에서 후보 장소의 실제 weekly operation schedule만 구조화한다.

규칙:
- 후보 장소와 무관한 텍스트면 UNPARSEABLE을 반환한다.
- 영업시간이 명시되어 있지 않으면 추측하지 말고 UNPARSEABLE을 반환한다.
- "영업 중", "곧 영업 종료" 같은 현재 상태만 있고 weekly schedule이 없으면 UNPARSEABLE이다.
- "연중무휴"와 단일 시간 범위가 함께 있으면 MONDAY..SUNDAY 전체에 같은 OPEN schedule을 적용한다.
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

  const deterministic = parseOperationInfo(
    text,
    operationVerifier.requestedDayOfWeek,
  );
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
        error instanceof Error
          ? error.message
          : `${sourceName} LLM operation-hour fallback failed`,
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

const toOperationInfo = (
  value: z.infer<typeof LlmOperationInfoSchema>,
): OperationInfo =>
  OperationInfoSchema.parse({
    timezone: value.timezone,
    schedules: value.schedules.map((schedule) => {
      if (schedule.status === "CLOSED") {
        return {
          daysOfWeek: schedule.daysOfWeek as DayOfWeek[],
          status: "CLOSED",
        };
      }

      return {
        daysOfWeek: schedule.daysOfWeek as DayOfWeek[],
        status: "OPEN",
        open: schedule.open,
        close: schedule.close,
        breakTimes: schedule.breakTimes ?? [],
        ...(schedule.lastOrderTime
          ? { lastOrderTime: schedule.lastOrderTime }
          : {}),
      };
    }),
  });

const shouldTryLlmFallback = (
  text: string,
  evidence: CandidateScoringEvidence,
): boolean => {
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

const normalizeForSignal = (value: string): string =>
  value.replace(/\s+/gu, "").toLowerCase();

const hasOperationSignal = (text: string): boolean =>
  /영업\s*시간|영업시간|운영\s*시간|운영시간|영업\s*중|휴무|연중무휴|라스트\s*오더|브레이크|매일|평일|주중|주말|월요일|화요일|수요일|목요일|금요일|토요일|일요일/u.test(
    text,
  ) && /(?:[01]?\d|2[0-4]):[0-5]\d/u.test(text);

const hasCandidateIdentitySignal = (
  text: string,
  evidence: CandidateScoringEvidence,
): boolean => {
  const normalized = normalizeForSignal(text);
  const candidateName = normalizeForSignal(evidence.name);
  if (candidateName && normalized.includes(candidateName)) return true;

  const textTokens = new Set(tokenizeForSignal(text));
  const nameTokens = tokenizeForSignal(evidence.name);
  const addressTokens = tokenizeForSignal(
    [evidence.placeInfo.roadAddress, evidence.placeInfo.address].join(" "),
  );
  const nameHitCount = nameTokens.filter((token) => textTokens.has(token))
    .length;
  const addressHitCount = addressTokens.filter((token) => textTokens.has(token))
    .length;
  if (nameTokens.length === 0) return false;

  return (
    nameHitCount / nameTokens.length >= 0.5 ||
    (nameHitCount > 0 && addressHitCount > 0)
  );
};

const tokenizeForSignal = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

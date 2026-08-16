import type { OperationInfo } from "../../../interfaces/output.contracts.js";
import type { CandidateEnrichment } from "./enrichment-types.js";

/**
 * 폐업/영업 종료 장소를 걸러낸다.
 *
 * 기존 파이프라인에는 폐업 개념이 아예 없었다. `operationVerification`의 `CLOSED`는
 * "요청한 시각에 닫혀 있다"는 뜻이지 "이 가게가 없어졌다"가 아니다. 그래서 폐업한
 * 가게라도 지도에 데이터가 남아 있으면 그대로 추천될 수 있었다.
 *
 * 지도/리뷰 페이지에는 폐업 시 명시적인 문구가 붙으므로 그걸 신호로 쓴다.
 */

/**
 * 폐업을 직접 가리키는 문구.
 *
 * "임시휴업"이나 "휴무"는 제외한다. 그건 영업시간 판정이 다룰 문제이고, 여기서
 * 걸러내면 명절 휴무 중인 멀쩡한 가게가 사라진다.
 */
const CLOSURE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "폐업 표기", pattern: /폐업|폐점|영업\s*종료(?!\s*시간)|영구\s*휴업/u },
  { label: "이전/이설 표기", pattern: /이전\s*(?:했|하였|오픈)|移轉/u },
  { label: "지도 폐업 안내", pattern: /지도에서\s*삭제|더\s*이상\s*운영하지\s*않/u },
  { label: "영문 폐업 표기", pattern: /permanently\s*closed/iu },
];

export type ClosureAssessment = {
  closed: boolean;
  signals: string[];
};

/** 7일 전부 CLOSED면 요청 시각 문제가 아니라 장소 자체가 운영하지 않는 것이다. */
const isClosedEveryDay = (operationInfo: OperationInfo | undefined): boolean => {
  if (!operationInfo) return false;
  const schedules = Object.values(operationInfo.schedules);
  return schedules.length > 0 && schedules.every((schedule) => schedule.status === "CLOSED");
};

export const assessClosure = (enrichment: CandidateEnrichment): ClosureAssessment => {
  const texts = [
    enrichment.rawTextSnippet,
    ...(enrichment.sourceDetails ?? []).map((detail) => detail.rawTextSnippet),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  const signals = CLOSURE_PATTERNS.filter(({ pattern }) =>
    texts.some((text) => pattern.test(text)),
  ).map(({ label }) => label);

  if (isClosedEveryDay(enrichment.operationInfo)) {
    signals.push("전 요일 영업 없음");
  }

  return { closed: signals.length > 0, signals };
};

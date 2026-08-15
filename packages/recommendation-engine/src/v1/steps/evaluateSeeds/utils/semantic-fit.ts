import type { CandidateScoringEvidence } from "./evidence.js";

type SemanticFitStatus = "PASS" | "PENALIZE";
type SemanticFitSeverity = "NONE" | "SOFT" | "STRONG";

export type SemanticFitAssessment = {
  status: SemanticFitStatus;
  score: number;
  severity: SemanticFitSeverity;
  requestedIntent: SemanticIntent;
  reason: string;
  positiveSignals: string[];
  negativeSignals: string[];
};

type SemanticScoreAdjustment = {
  appliedPenalty: number;
  scoreCap?: number;
};

type SemanticIntent = "CAFE" | "FOOD" | "PLACE";

type SemanticRule = {
  intent: SemanticIntent;
  requestKeywords: RegExp;
  allowedWhenRequestMentions: RegExp;
  hardRejectSignals: Array<{
    label: string;
    pattern: RegExp;
  }>;
  softPenaltySignals: Array<{
    label: string;
    pattern: RegExp;
  }>;
};

const SEMANTIC_RULES: SemanticRule[] = [
  {
    intent: "CAFE",
    // `차\b`를 쓰면 안 된다. JS의 `\b`는 ASCII 단어경계라 한글 뒤에서는 성립하지 않아
    // 한국어 입력에서 절대 매칭되지 않는 죽은 패턴이 된다. 실제 어휘로 대체한다.
    requestKeywords: /카페|커피|디저트|브런치|베이커리|티룸|찻집|tea|coffee|cafe/iu,
    allowedWhenRequestMentions: /타로|사주|운세|점술|신점|철학관|궁합|운명|작명|상담/iu,
    hardRejectSignals: [
      {
        label: "타로/운세 서비스업 신호",
        pattern: /타로|사주|운세|점술|신점|철학관|궁합|운명|작명/iu,
      },
      {
        label: "비식음료 상담 서비스 신호",
        pattern: /심리상담|상담센터|테라피|마사지|왁싱|네일|피부관리|공방|스튜디오/iu,
      },
    ],
    softPenaltySignals: [
      {
        label: "특수 목적 카페 신호",
        pattern: /보드게임카페|만화카페|룸카페|키즈카페|애견카페|고양이카페/iu,
      },
    ],
  },
  {
    intent: "FOOD",
    requestKeywords: /맛집|식당|음식|곱창|고기|파스타|한식|중식|일식|양식|브런치|비건|점심|저녁/iu,
    // `바\b`도 같은 이유로 죽은 패턴이었다. 복합어로 명시한다.
    allowedWhenRequestMentions:
      /술집|맥주|펍|호프|와인바|칵테일바|위스키바|바텐더|bar\b|포차|와인|칵테일|이자카야|한잔/iu,
    hardRejectSignals: [
      {
        label: "주류 중심 업장 신호",
        pattern: /술집|호프|펍|포차|이자카야|칵테일바|와인바|맥주집/iu,
      },
    ],
    softPenaltySignals: [
      {
        label: "요청 음식과 약한 업종 신호",
        pattern: /카페|디저트|베이커리|주스전문점|테이크아웃/iu,
      },
    ],
  },
];

export const assessSemanticFit = (evidence: CandidateScoringEvidence): SemanticFitAssessment => {
  const request = normalizeText(evidence.userFit.naturalLanguageRequest);
  const requestedIntent = inferRequestedIntent(request);
  const basePositiveSignals = getPositiveSignals(evidence);
  const base = {
    requestedIntent,
    positiveSignals: basePositiveSignals,
  };

  const rule = SEMANTIC_RULES.find((candidate) => candidate.requestKeywords.test(request));
  if (!rule) {
    return {
      ...base,
      status: "PASS",
      score: 1,
      severity: "NONE",
      reason: "적용할 의미 필터 규칙 없음",
      negativeSignals: [],
    };
  }

  const candidateText = normalizeText(toCandidateSemanticText(evidence));
  const negativeSignals = rule.hardRejectSignals
    .filter((signal) => signal.pattern.test(toHardRejectText(candidateText, signal.label)))
    .map((signal) => signal.label);
  const softPenaltySignals = rule.softPenaltySignals
    .filter((signal) => signal.pattern.test(candidateText))
    .map((signal) => signal.label);

  if (negativeSignals.length > 0 && !rule.allowedWhenRequestMentions.test(request)) {
    return {
      ...base,
      status: "PENALIZE",
      score: 0.1,
      severity: "STRONG",
      reason: `${rule.intent} 요청이지만 후보가 ${negativeSignals.join(", ")}를 ` + "강하게 포함함",
      negativeSignals,
    };
  }

  if (negativeSignals.length > 0 && rule.allowedWhenRequestMentions.test(request)) {
    return {
      ...base,
      status: "PASS",
      score: 1,
      severity: "NONE",
      reason: "사용자 요청이 서비스형 카페 신호를 명시해 의미 충돌로 보지 않음",
      negativeSignals: [],
    };
  }

  if (softPenaltySignals.length > 0 && !rule.allowedWhenRequestMentions.test(request)) {
    return {
      ...base,
      status: "PENALIZE",
      score: 0.45,
      severity: "SOFT",
      reason: `일반 ${rule.intent} 요청이지만 후보가 ${softPenaltySignals.join(", ")}를 포함함`,
      negativeSignals: softPenaltySignals,
    };
  }

  return {
    ...base,
    status: "PASS",
    score: 1,
    severity: "NONE",
    reason: "사용자 의도와 충돌하는 업종 신호 없음",
    negativeSignals: [],
  };
};

export const getSemanticScoreAdjustment = ({
  severity,
  score,
}: SemanticFitAssessment): SemanticScoreAdjustment => {
  if (severity === "NONE") return { appliedPenalty: 0 };
  if (severity === "STRONG") return { appliedPenalty: 45, scoreCap: 55 };
  return {
    appliedPenalty: Math.round((1 - score) * 35),
    scoreCap: 75,
  };
};

const inferRequestedIntent = (request: string): SemanticIntent => {
  if (/카페|커피|디저트|브런치|베이커리|티룸|찻집|tea|coffee|cafe/iu.test(request)) {
    return "CAFE";
  }
  if (/맛집|식당|음식|곱창|고기|파스타|한식|중식|일식|양식|술집|와인바|이자카야|포차/iu.test(request)) {
    return "FOOD";
  }
  return "PLACE";
};

const getPositiveSignals = (evidence: CandidateScoringEvidence): string[] => {
  const tags = evidence.category.tags.join(" ");
  const signals: string[] = [];
  if (/카페|커피|디저트|베이커리/iu.test(`${evidence.name} ${tags}`)) {
    signals.push("카페/음료 카테고리 신호");
  }
  if (/음식점|식당|전문음식점|한식|양식|중식|일식/iu.test(tags)) {
    signals.push("음식점 카테고리 신호");
  }
  return signals;
};

/**
 * 의미 판정에는 구조화된 필드만 쓴다.
 *
 * 예전에는 스크랩 원문(`rawTextSnippet`)까지 이어붙여 매칭했는데, 네이버 지도 페이지에는
 * 주변 가게와 리뷰가 섞여 있어서 리뷰에 "근처 이자카야" 한 줄만 있어도 멀쩡한 식당이
 * 주류 업장으로 오탐돼 -45점을 먹었다. 업종 판정의 근거는 카테고리와 상호명이어야 한다.
 */
const toCandidateSemanticText = (evidence: CandidateScoringEvidence): string =>
  [
    evidence.name,
    evidence.category.mainCategory,
    evidence.category.subCategory,
    ...evidence.category.tags,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

const normalizeText = (value: string): string =>
  value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&(?:amp|lt|gt|quot|apos);/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();

const toHardRejectText = (candidateText: string, signalLabel: string): string => {
  if (signalLabel !== "타로/운세 서비스업 신호") return candidateText;

  return candidateText
    .replace(/타로\s*(?:밀크\s*티|밀크티|버블\s*티|버블티|티|라떼|스무디|음료|펄)/giu, " ")
    .replace(/(?:밀크\s*티|밀크티|버블\s*티|버블티|티|라떼|스무디|음료|펄)\s*타로/giu, " ");
};

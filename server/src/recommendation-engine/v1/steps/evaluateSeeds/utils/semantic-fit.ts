import type { CandidateScoringEvidence } from "./evidence.js";

export type SemanticFitStatus = "PASS" | "PENALIZE" | "REJECT";
export type SemanticFitSeverity = "NONE" | "SOFT" | "STRONG";

export type SemanticFitAssessment = {
  status: SemanticFitStatus;
  score: number;
  severity: SemanticFitSeverity;
  requestedIntent: SemanticIntent;
  reason: string;
  positiveSignals: string[];
  negativeSignals: string[];
};

export type SemanticScoreAdjustment = {
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
    requestKeywords: /카페|커피|디저트|브런치|베이커리|티룸|차\b|tea|coffee|cafe/iu,
    allowedWhenRequestMentions:
      /타로|사주|운세|점술|신점|철학관|궁합|운명|작명|상담/iu,
    hardRejectSignals: [
      {
        label: "타로/운세 서비스업 신호",
        pattern: /타로|사주|운세|점술|신점|철학관|궁합|운명|작명/iu,
      },
      {
        label: "비식음료 상담 서비스 신호",
        pattern:
          /심리상담|상담센터|테라피|마사지|왁싱|네일|피부관리|공방|스튜디오/iu,
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
    requestKeywords:
      /맛집|식당|음식|곱창|고기|파스타|한식|중식|일식|양식|브런치|비건|점심|저녁/iu,
    allowedWhenRequestMentions:
      /술집|맥주|펍|호프|바\b|bar\b|포차|와인|칵테일|이자카야/iu,
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

export const assessSemanticFit = (
  evidence: CandidateScoringEvidence,
): SemanticFitAssessment => {
  // Provider category는 종종 넓다. 예: "카페"로 들어왔지만 실제로는 타로/상담 매장인 경우.
  // 그래서 사용자 요청과 후보명/category/raw snippet을 함께 보고 scoring 전 의미 gate를 건다.
  const request = normalizeText(evidence.userFit.naturalLanguageRequest);
  const requestedIntent = inferRequestedIntent(request);
  const basePositiveSignals = getPositiveSignals(evidence);
  const base = {
    requestedIntent,
    positiveSignals: basePositiveSignals,
  };

  const rule = SEMANTIC_RULES.find((candidate) =>
    candidate.requestKeywords.test(request),
  );
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
    .filter((signal) =>
      signal.pattern.test(toHardRejectText(candidateText, signal.label)),
    )
    .map((signal) => signal.label);
  const softPenaltySignals = rule.softPenaltySignals
    .filter((signal) => signal.pattern.test(candidateText))
    .map((signal) => signal.label);

  if (
    negativeSignals.length > 0 &&
    !rule.allowedWhenRequestMentions.test(request)
  ) {
    // 강한 의미 충돌도 즉시 DROP하지 않는다. ranking에서 큰 감점과 score cap을 적용한다.
    return {
      ...base,
      status: "PENALIZE",
      score: 0.1,
      severity: "STRONG",
      reason:
        `${rule.intent} 요청이지만 후보가 ${negativeSignals.join(", ")}를 ` +
        "강하게 포함함",
      negativeSignals,
    };
  }

  if (
    negativeSignals.length > 0 &&
    rule.allowedWhenRequestMentions.test(request)
  ) {
    // 반대로 사용자가 "타로 카페"처럼 명시했다면 의도와 맞는 후보이므로 제외하지 않는다.
    return {
      ...base,
      status: "PASS",
      score: 1,
      severity: "NONE",
      reason:
        "사용자 요청이 서비스형 카페 신호를 명시해 의미 충돌로 보지 않음",
      negativeSignals: [],
    };
  }

  if (
    softPenaltySignals.length > 0 &&
    !rule.allowedWhenRequestMentions.test(request)
  ) {
    // 보드게임/키즈/룸카페는 카페일 수는 있지만 일반 대화/커피 의도와는 다를 수 있어 soft penalty.
    return {
      ...base,
      status: "PENALIZE",
      score: 0.45,
      severity: "SOFT",
      reason:
        `일반 ${rule.intent} 요청이지만 후보가 ${softPenaltySignals.join(", ")}를 포함함`,
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

export const attachSemanticFit = (
  evidence: CandidateScoringEvidence,
  semanticFit: SemanticFitAssessment,
): CandidateScoringEvidence => ({
  ...evidence,
  semanticFit,
});

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
  if (/카페|커피|디저트|브런치|베이커리|티룸|차\b|tea|coffee|cafe/iu.test(request)) {
    return "CAFE";
  }
  if (/맛집|식당|음식|곱창|고기|파스타|한식|중식|일식|양식|술집|바\b|포차/iu.test(request)) {
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

// category만으로는 부족하므로 enrichment raw text까지 포함한다.
// vendor가 넓은 카테고리를 준 경우에도 실제 업종 표현을 잡기 위함이다.
const toCandidateSemanticText = (evidence: CandidateScoringEvidence): string =>
  [
    evidence.name,
    evidence.category.mainCategory,
    evidence.category.subCategory,
    ...evidence.category.tags,
    evidence.placeInfo.address,
    evidence.placeInfo.roadAddress,
    evidence.enrichment?.rawTextSnippet,
    ...(evidence.enrichment?.sourceDetails ?? []).map(
      (detail) => detail.rawTextSnippet,
    ),
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

const toHardRejectText = (
  candidateText: string,
  signalLabel: string,
): string => {
  if (signalLabel !== "타로/운세 서비스업 신호") return candidateText;

  // 공차/버블티 계열의 "타로 밀크티"는 점술 서비스가 아니라 메뉴명이다.
  // 서비스업 gate는 raw snippet을 넓게 보기 때문에 메뉴 단어를 먼저 제거해 오탐을 줄인다.
  return candidateText
    .replace(
      /타로\s*(?:밀크\s*티|밀크티|버블\s*티|버블티|티|라떼|스무디|음료|펄)/giu,
      " ",
    )
    .replace(
      /(?:밀크\s*티|밀크티|버블\s*티|버블티|티|라떼|스무디|음료|펄)\s*타로/giu,
      " ",
    );
};

import type {
  CourseCandidateDecision,
  CourseFailureCode,
  CourseOptionType,
  CoursePlaceInput,
  CourseRecommendationProgressStep,
  CourseRoutePoint,
  CreateCourseRequest,
} from "@monorepo/api-contracts";
import {
  createCourseRecommendationEngine,
  DEFAULT_COURSE_ENGINE_CONFIG,
  type CourseEngineMeta,
  type CourseInput,
  type CourseRecommendationItem,
} from "@monorepo/course-recommendation-engine";

import type {
  CandidateResolutionDecision,
  ResolvedCourseCandidates,
  ResolvedCandidateSource,
} from "./candidates.js";

export type CourseEngineFailureCode = CourseFailureCode;

export const COURSE_ENGINE_FAILURE_CODES = [
  "COURSE_INVALID_INPUT",
  "COURSE_CANDIDATE_NOT_FOUND",
  "COURSE_CANDIDATE_FORBIDDEN",
  "COURSE_CANDIDATE_LOOKUP_UNAVAILABLE",
  "COURSE_ENGINE_UNAVAILABLE",
  "COURSE_ROUTE_UNAVAILABLE",
  "COURSE_NO_FEASIBLE_COURSES",
  "COURSE_ENGINE_FAILURE",
  "COURSE_PERSISTENCE_FAILURE",
] as const satisfies readonly CourseEngineFailureCode[];

export type CourseEngineStop = CoursePlaceInput & {
  readonly sequence: number;
  readonly visitTime: string;
  readonly stayMinutes: number;
  readonly activityLabel: string;
};

export type CourseEngineOption = {
  readonly type: CourseOptionType;
  readonly totalDurationMinutes: number;
  readonly totalTravelMinutes: number;
  readonly pricePerPersonWon: number;
  readonly reason: string;
  readonly routePath: readonly CourseRoutePoint[];
  readonly stops: readonly CourseEngineStop[];
};

export type RealCourseEngineOption = {
  readonly course: CourseRecommendationItem;
  readonly candidateDecisions: readonly CourseCandidateDecision[];
};

export type CourseEngineResult =
  | { readonly kind: "SUCCESS"; readonly version: 1; readonly options: readonly CourseEngineOption[] }
  | {
      readonly kind: "SUCCESS";
      readonly version: 2;
      readonly engineInput: CourseInput;
      readonly engineMeta: CourseEngineMeta;
      readonly options: readonly RealCourseEngineOption[];
      readonly candidates: readonly ResolvedCandidateSource[];
      readonly candidateDecisions: readonly CourseCandidateDecision[];
    }
  | {
      readonly kind: "EMPTY";
      readonly version: 1 | 2;
      readonly engineInput?: CourseInput;
      readonly candidateDecisions?: readonly CourseCandidateDecision[];
    }
  | {
      readonly kind: "FAILED";
      readonly code: CourseEngineFailureCode;
      readonly retryable: boolean;
      readonly message?: string;
    };

export type CourseRecommendationEngine = {
  readonly generate: (
    input: CreateCourseRequest,
    options: {
      readonly userId: string;
      readonly signal: AbortSignal;
      readonly onProgress: (step: CourseRecommendationProgressStep) => void;
    },
  ) => Promise<CourseEngineResult>;
};

export type RealCourseRecommendationEngineSecrets = {
  readonly openAiApiKey: string;
  readonly kakaoRestApiKey: string;
  readonly tmapAppKey: string;
};

const toApiDecision = (
  candidate: ResolvedCandidateSource,
  decision: CourseRecommendationItem["candidateDecisions"][number],
): CourseCandidateDecision => ({
  candidateIndex: candidate.candidateIndex,
  candidateKey: candidate.candidateKey,
  source: candidate.source,
  savedPlaceId: candidate.savedPlaceId,
  kakaoPlaceId: candidate.kakaoPlaceId,
  name: candidate.place.name,
  decision: decision.decision,
  message: decision.message,
});

const mergeOptionDecisions = (
  course: CourseRecommendationItem,
  candidates: readonly ResolvedCandidateSource[],
  resolutionDecisions: readonly CandidateResolutionDecision[],
): readonly CourseCandidateDecision[] => {
  const candidateByPlaceId = new Map(candidates.map((candidate) => [candidate.place.id, candidate]));
  const engineDecisions = course.candidateDecisions.flatMap((decision) => {
    const candidate = candidateByPlaceId.get(decision.placeId);
    return candidate ? [toApiDecision(candidate, decision)] : [];
  });
  return [...resolutionDecisions, ...engineDecisions].sort(
    (left, right) => left.candidateIndex - right.candidateIndex,
  );
};

const toGlobalDecisions = (
  options: readonly RealCourseEngineOption[],
  candidates: readonly ResolvedCandidateSource[],
  resolutionDecisions: readonly CandidateResolutionDecision[],
): readonly CourseCandidateDecision[] => {
  const resolutionByIndex = new Map(
    resolutionDecisions.map((decision) => [decision.candidateIndex, decision]),
  );
  const optionDecisionByIndex = new Map<number, CourseCandidateDecision>();
  for (const option of options) {
    for (const decision of option.candidateDecisions) {
      const current = optionDecisionByIndex.get(decision.candidateIndex);
      if (!current || decision.decision === "INCLUDED") {
        optionDecisionByIndex.set(decision.candidateIndex, decision);
      }
    }
  }

  return [...resolutionDecisions, ...candidates.map((candidate) =>
    resolutionByIndex.get(candidate.candidateIndex) ??
    optionDecisionByIndex.get(candidate.candidateIndex) ?? {
      candidateIndex: candidate.candidateIndex,
      candidateKey: candidate.candidateKey,
      source: candidate.source,
      savedPlaceId: candidate.savedPlaceId,
      kakaoPlaceId: candidate.kakaoPlaceId,
      name: candidate.place.name,
      decision: "NOT_IN_TOP_COMBINATION" as const,
      message: `${candidate.place.name}: 생성된 최종 코스에는 포함되지 않았어요.`,
    },
  )]
    .filter((decision, index, all) =>
      all.findIndex((candidate) => candidate.candidateIndex === decision.candidateIndex) === index,
    )
    .sort((left, right) => left.candidateIndex - right.candidateIndex);
};

const emptyDecisions = (
  candidates: readonly ResolvedCandidateSource[],
  resolutionDecisions: readonly CandidateResolutionDecision[],
): readonly CourseCandidateDecision[] => {
  const resolved = candidates.map((candidate) => ({
    candidateIndex: candidate.candidateIndex,
    candidateKey: candidate.candidateKey,
    source: candidate.source,
    savedPlaceId: candidate.savedPlaceId,
    kakaoPlaceId: candidate.kakaoPlaceId,
    name: candidate.place.name,
    decision: "DURATION_LIMIT" as const,
    message: `${candidate.place.name}: 요청 시간 안에 2곳 이상인 코스로 구성하지 못했어요.`,
  }));
  return [...resolutionDecisions, ...resolved].sort(
    (left, right) => left.candidateIndex - right.candidateIndex,
  );
};

type GenerateContext = Parameters<CourseRecommendationEngine["generate"]>[1];

const processResolvedCandidates = async (
  resolution: ResolvedCourseCandidates,
  context: GenerateContext,
  providerOptions: { readonly openAiApiKey?: string; readonly tmapAppKey?: string },
): Promise<CourseEngineResult> => {
  if (!resolution.engineInput) {
    return {
      kind: "EMPTY",
      version: 2,
      candidateDecisions: emptyDecisions(resolution.candidates, resolution.decisions),
    };
  }

  const engine = createCourseRecommendationEngine(
    resolution.engineInput,
    { ...DEFAULT_COURSE_ENGINE_CONFIG, placeScoreWeight: 0 },
    {
      ...providerOptions,
      signal: context.signal,
      onProgress: context.onProgress,
    },
  );
  const output = await engine.process();
  if (output.status === "ERROR") {
    if (output.error.code === "COURSE_NO_FEASIBLE_COURSES") {
      return {
        kind: "EMPTY",
        version: 2,
        engineInput: resolution.engineInput,
        candidateDecisions: emptyDecisions(resolution.candidates, resolution.decisions),
      };
    }
    return {
      kind: "FAILED",
      code: "COURSE_INVALID_INPUT",
      retryable: false,
      message: "코스 추천 입력을 처리하지 못했어요.",
    };
  }

  const displayableCourses = output.userOutput.courses.filter(
    (course) => course.timeline.length >= 2 && course.timeline.length <= 6,
  ).slice(0, 3);
  if (displayableCourses.length === 0) {
    return {
      kind: "EMPTY",
      version: 2,
      engineInput: resolution.engineInput,
      candidateDecisions: emptyDecisions(resolution.candidates, resolution.decisions),
    };
  }

  const options = displayableCourses.map((course) => ({
    course,
    candidateDecisions: mergeOptionDecisions(
      course,
      resolution.candidates,
      resolution.decisions,
    ),
  }));
  context.onProgress("persisting_results");
  return {
    kind: "SUCCESS",
    version: 2,
    engineInput: resolution.engineInput,
    engineMeta: output.meta,
    options,
    candidates: resolution.candidates,
    candidateDecisions: toGlobalDecisions(
      options,
      resolution.candidates,
      resolution.decisions,
    ),
  };
};

const generateResolvedCourse = async (
  input: CreateCourseRequest,
  context: GenerateContext,
  options: RealCourseRecommendationEngineSecrets & { readonly verifyDirectSearch: boolean },
): Promise<CourseEngineResult> => {
  const { CourseCandidateResolutionError, resolveCourseCandidates } = await import(
    "./candidates.js"
  );
  try {
    const resolution = await resolveCourseCandidates(input, context.userId, {
      kakaoRestApiKey: options.kakaoRestApiKey,
      signal: context.signal,
      onProgress: context.onProgress,
      verifyDirectSearch: options.verifyDirectSearch,
    });
    return await processResolvedCandidates(resolution, context, {
      ...(options.openAiApiKey ? { openAiApiKey: options.openAiApiKey } : {}),
      ...(options.tmapAppKey ? { tmapAppKey: options.tmapAppKey } : {}),
    });
  } catch (error: unknown) {
    if (context.signal.aborted) throw error;
    if (error instanceof CourseCandidateResolutionError) {
      return {
        kind: "FAILED",
        code: error.code,
        retryable: error.retryable,
        message: error.message,
      };
    }
    throw error;
  }
};

export const createRealCourseRecommendationEngine = (
  secrets: RealCourseRecommendationEngineSecrets,
): CourseRecommendationEngine => ({
  generate: (input, context) =>
    generateResolvedCourse(input, context, { ...secrets, verifyDirectSearch: true }),
});

export type MockCourseRecommendationOutcome = "SUCCESS" | "EMPTY" | "FAILED";

const MOCK_DELAY_MS = 180;

const wait = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Course recommendation cancelled", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, MOCK_DELAY_MS);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Course recommendation cancelled", "AbortError"));
      },
      { once: true },
    );
  });

const mockV2EmptyDecisions = (
  input: Extract<CreateCourseRequest, { version: 2 }>,
): readonly CourseCandidateDecision[] =>
  input.candidates.map((candidate, candidateIndex) => ({
    candidateIndex,
    candidateKey: candidate.source === "SAVED_PLACE"
      ? `saved:${candidate.savedPlaceId}`
      : `kakao:${candidate.kakaoPlaceId}`,
    source: candidate.source,
    savedPlaceId: candidate.source === "SAVED_PLACE" ? candidate.savedPlaceId : null,
    kakaoPlaceId: candidate.source === "DIRECT_SEARCH" ? candidate.kakaoPlaceId : null,
    name: candidate.source === "DIRECT_SEARCH" ? candidate.name : null,
    decision: "DURATION_LIMIT",
    message: "개발용 mock이 빈 코스 결과를 반환했어요.",
  }));

const toMinutes = (time: string): number => {
  const [hour, minute] = time.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
};

const toTime = (minutes: number): string => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
};

const optionDefinitions: readonly Pick<
  CourseEngineOption,
  "type" | "totalTravelMinutes" | "pricePerPersonWon" | "reason"
>[] = [
  {
    type: "이동 최소",
    totalTravelMinutes: 18,
    pricePerPersonWon: 41000,
    reason: "선택한 장소를 가까운 순서로 연결해 이동 시간을 가장 짧게 만들었어요.",
  },
  {
    type: "느긋한 흐름",
    totalTravelMinutes: 26,
    pricePerPersonWon: 43000,
    reason: "장소별 체류 시간과 산책 구간을 넉넉하게 잡아 대화에 집중할 수 있어요.",
  },
  {
    type: "장소 다양성",
    totalTravelMinutes: 31,
    pricePerPersonWon: 39000,
    reason: "식사와 카페, 문화 공간을 고르게 섞어 다양한 분위기를 경험할 수 있어요.",
  },
  {
    type: "식사 우선",
    totalTravelMinutes: 22,
    pricePerPersonWon: 45000,
    reason: "식사 경험을 중심에 두고 다음 장소까지 자연스럽게 이어지도록 구성했어요.",
  },
];

const activityFor = (index: number): string =>
  ["식사", "관람", "대화", "산책"][index % 4] ?? "방문";

const rotatePlaces = (
  places: readonly CoursePlaceInput[],
  offset: number,
): readonly CoursePlaceInput[] =>
  places
    .map((_, index) => places[(index + offset) % places.length])
    .filter((place): place is CoursePlaceInput => Boolean(place));

export const createMockCourseRecommendationEngine = (
  outcome: MockCourseRecommendationOutcome = (process.env.COURSE_RECOMMENDATION_MOCK_OUTCOME ??
    "SUCCESS") as MockCourseRecommendationOutcome,
): CourseRecommendationEngine => ({
  generate: async (input, context) => {
    const { signal, onProgress } = context;
    if ("version" in input && input.version === 2) {
      await wait(signal);
      if (outcome === "FAILED") {
        return {
          kind: "FAILED",
          code: "COURSE_ENGINE_UNAVAILABLE",
          retryable: true,
        };
      }
      if (outcome === "EMPTY") {
        return {
          kind: "EMPTY",
          version: 2,
          candidateDecisions: mockV2EmptyDecisions(input),
        };
      }
      return generateResolvedCourse(input, context, {
        openAiApiKey: "",
        kakaoRestApiKey: "",
        tmapAppKey: "",
        verifyDirectSearch: false,
      });
    }

    onProgress("input_validated");
    await wait(signal);

    if (outcome === "FAILED") {
      return {
        kind: "FAILED",
        code: "COURSE_ENGINE_UNAVAILABLE",
        retryable: true,
      };
    }

    onProgress("generating_options");
    await wait(signal);
    if (outcome === "EMPTY") return { kind: "EMPTY", version: 1 };

    const places = "places" in input ? input.places : [];
    const options = optionDefinitions.map((definition, optionIndex) => {
      const optionPlaces = rotatePlaces(places, optionIndex).slice(0, Math.min(4, places.length));
      let currentMinutes = toMinutes(input.startTime);
      const stops = optionPlaces.map((place, index) => {
        const stayMinutes = index === 0 ? 70 + optionIndex * 5 : 35 + ((index + optionIndex) % 2) * 10;
        const stop: CourseEngineStop = {
          ...place,
          sequence: index + 1,
          visitTime: toTime(currentMinutes),
          stayMinutes,
          activityLabel: activityFor(index),
        };
        currentMinutes += stayMinutes + (index === optionPlaces.length - 1
          ? 0
          : Math.ceil(definition.totalTravelMinutes / Math.max(1, optionPlaces.length - 1)));
        return stop;
      });
      const totalDurationMinutes = Math.max(
        input.durationHours * 60,
        stops.reduce((total, stop) => total + stop.stayMinutes, 0) + definition.totalTravelMinutes,
      );
      return {
        ...definition,
        totalDurationMinutes,
        routePath: stops.map(({ lat, lng }) => ({ lat, lng })),
        stops,
      } satisfies CourseEngineOption;
    });

    onProgress("persisting_results");
    return { kind: "SUCCESS", version: 1, options };
  },
});

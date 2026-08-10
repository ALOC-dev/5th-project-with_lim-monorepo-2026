import type {
  CourseOptionType,
  CoursePlaceInput,
  CourseRecommendationProgressStep,
  CourseRoutePoint,
  CreateCourseRequest,
} from "@monorepo/api-contracts";

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

export type CourseEngineResult =
  | { readonly kind: "SUCCESS"; readonly options: readonly CourseEngineOption[] }
  | { readonly kind: "EMPTY" };

export type CourseRecommendationEngine = {
  readonly generate: (
    input: CreateCourseRequest,
    options: {
      readonly signal: AbortSignal;
      readonly onProgress: (step: CourseRecommendationProgressStep) => void;
    },
  ) => Promise<CourseEngineResult>;
};

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
  generate: async (input, { signal, onProgress }) => {
    onProgress("input_validated");
    await wait(signal);

    if (outcome === "FAILED") {
      throw new Error("Mock course recommendation engine failed");
    }

    onProgress("generating_options");
    await wait(signal);
    if (outcome === "EMPTY") return { kind: "EMPTY" };

    const options = optionDefinitions.map((definition, optionIndex) => {
      const places = rotatePlaces(input.places, optionIndex).slice(
        0,
        Math.min(4, input.places.length),
      );
      let currentMinutes = toMinutes(input.startTime);
      const stops = places.map((place, index) => {
        const stayMinutes =
          index === 0 ? 70 + optionIndex * 5 : 35 + ((index + optionIndex) % 2) * 10;
        const stop: CourseEngineStop = {
          ...place,
          sequence: index + 1,
          visitTime: toTime(currentMinutes),
          stayMinutes,
          activityLabel: activityFor(index),
        };
        currentMinutes +=
          stayMinutes +
          (index === places.length - 1
            ? 0
            : Math.ceil(definition.totalTravelMinutes / Math.max(1, places.length - 1)));
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
    return { kind: "SUCCESS", options };
  },
});

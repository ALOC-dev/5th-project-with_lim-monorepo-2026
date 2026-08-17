import type {
  DayOfWeek,
  PlaceRecommendationItem,
} from "@monorepo/recommendation-engine/v1/contracts";

import { type CourseEngineConfig, DEFAULT_COURSE_ENGINE_CONFIG } from "./configs.js";
import {
  type CourseBudgetRange,
  type CourseEngineMeta,
  type CourseEngineOutput,
  type CourseEngineProgressStep,
  type CourseInput,
  CourseInputSchema,
  type CourseRecommendationItem,
  CourseRecommendationItemSchema,
  type MealPlan,
} from "./contracts.js";
import {
  type CourseCurationClient,
  createOpenAiCourseCurationClient,
  toCourseCurationCandidate,
} from "./llm/curation.js";
import type { PlaceStayEstimate, StayEstimatorClient } from "./stay/contracts.js";
import { createOpenAiStayEstimatorClient } from "./stay/llm.js";
import { estimateStayDeterministically, withLlmTypical } from "./stay/profiles.js";
import type { TravelMatrixClient, WalkCalibration } from "./travel/contracts.js";
import { toDistanceMeters, toWalkMinutes } from "./travel/distance.js";
import { createCalibratedTmapMatrixClient } from "./travel/tmap-calibrated.js";

type CourseState = {
  mask: number;
  last: number;
  stopCount: number;
  startMinute: number;
  endMinute: number;
  /** 이 장소에 머무는 시간. 재분배로 기본값에서 늘어날 수 있어 상태에 싣는다. */
  stayMinutes: number;
  totalStayMinutes: number;
  totalTravelMinutes: number;
  totalWaitMinutes: number;
  placeScoreSum: number;
  flowBonus: number;
  travelFromPrevious: number;
  waitFromPrevious: number;
  /** 방문한 mainCategory 집합. popcount로 카테고리 수를 O(1)에 얻는다. */
  categoryMask: number;
  /** 영업시간을 모르는 장소 수. */
  unknownHoursCount: number;
  costMinSum: number;
  costMaxSum: number;
  mealStopIndex: number | undefined;
  prev: CourseState | undefined;
};

type ScoredState = {
  state: CourseState;
  score: number;
  placeScore: number;
  mealFit: number;
  travelEfficiency: number;
  waitEfficiency: number;
  durationFit: number;
  categoryDiversity: number;
  costFit: number;
  unknownHours: number;
  flow: number;
  mealPlan: MealPlan;
};

/** 장소마다 한 번만 계산한다. DP 안에서 수십만 번 호출되는 값들이다. */
type PlaceMetrics = {
  /** 탐색에 쓰는 기본 체류 시간. */
  stayMinutes: number;
  /** 코스 확정 후 남는 시간을 재분배할 때의 상한. */
  maxStayMinutes: number;
  isMeal: boolean;
  isCafe: boolean;
  /** mainCategory에 부여한 비트. 코스의 카테고리 다양성을 O(1)에 계산한다. */
  categoryBit: number;
  unknownHours: boolean;
  costMin: number;
  costMax: number;
};

type MealWindow = { start: number; end: number; label: string };

type MealContext = {
  requiredWindow: MealWindow | undefined;
  hasFeasibleMealPlace: boolean;
};

type ScoringContext = MealContext & {
  courseStartMinute: number;
  totalDurationMinutes: number;
  budgetPerPersonWon: CourseBudgetRange | undefined;
};

const LUNCH_WINDOW: MealWindow = {
  start: toMinute("11:30"),
  end: toMinute("13:30"),
  label: "점심",
};
const DINNER_WINDOW: MealWindow = {
  start: toMinute("17:30"),
  end: toMinute("20:00"),
  label: "저녁",
};
const MEAL_WINDOWS = [LUNCH_WINDOW, DINNER_WINDOW];
const COURSE_ID_PREFIX = "course";

export class CourseRecommendationEngine {
  private readonly config: CourseEngineConfig;
  private readonly input: unknown;
  private readonly options: CourseRecommendationEngineOptions;

  constructor(
    input: unknown,
    config: CourseEngineConfig = DEFAULT_COURSE_ENGINE_CONFIG,
    options: CourseRecommendationEngineOptions = {},
  ) {
    this.input = input;
    this.config = config;
    this.options = options;
  }

  async process(): Promise<CourseEngineOutput> {
    throwIfAborted(this.options.signal);
    const startedAt = Date.now();
    const parsed = CourseInputSchema.safeParse(this.input);

    if (!parsed.success) {
      return {
        status: "ERROR",
        userInput: this.input,
        error: toInputError(parsed.error),
      };
    }

    const userInput = parsed.data;
    await emitProgress(this.options, "measuring_travel");
    const [travel, stay] = await withAbort(
      Promise.all([
        resolveTravelMatrix(userInput, this.config, this.options),
        resolveStayEstimates(userInput, this.config, this.options),
      ]),
      this.options.signal,
    );
    await emitProgress(this.options, "generating_courses");
    const candidates = buildCourses(userInput, this.config, travel.minutes, stay.byPlaceId);

    if (candidates.pool.length === 0) {
      return {
        status: "ERROR",
        userInput,
        error: {
          code: "COURSE_NO_FEASIBLE_COURSES",
          message: "No course can be built within the requested schedule",
        },
      };
    }

    await emitProgress(this.options, "curating_courses");
    const curation = await withAbort(
      curateCourses(candidates.pool, userInput, this.config, this.options),
      this.options.signal,
    );
    throwIfAborted(this.options.signal);

    return {
      status: "SUCCESS",
      userInput,
      userOutput: {
        courses: curation.courses,
      },
      meta: {
        candidateCount: candidates.candidateCount,
        curationPoolSize: candidates.pool.length,
        curatedByLlm: curation.curatedByLlm,
        curationFallbackReason: curation.fallbackReason,
        measuredTravelPairCount: travel.measuredPairCount,
        estimatedTravelPairCount: travel.estimatedPairCount,
        travelCalibration: travel.calibration,
        travelMatrixFallbackReason: travel.fallbackReason,
        llmRefinedStayPlaceCount: stay.llmRefinedCount,
        stayEstimateFallbackReason: stay.fallbackReason,
        generationMillis: Date.now() - startedAt,
      },
    };
  }
}

export type CourseRecommendationEngineOptions = {
  openAiApiKey?: string;
  curateCourses?: CourseCurationClient;
  /** TMAP 보행자 경로안내용 앱 키. 없으면 계측을 건너뛰고 직선거리로 추정한다. */
  tmapAppKey?: string;
  /** 도보 이동 시간 계측 클라이언트. 주입하지 않으면 TMAP 클라이언트를 쓴다. */
  travelMatrix?: TravelMatrixClient;
  /**
   * 장소별 체류 시간 LLM 보정 클라이언트.
   * 주입하지 않으면 `openAiApiKey`가 있을 때만 기본 클라이언트를 쓴다.
   * 어느 쪽도 없으면 결정론 추정만 쓴다.
   */
  estimateStay?: StayEstimatorClient;
  /** Cancels the run. Cancellation rejects `process()` with the signal's abort reason. */
  signal?: AbortSignal;
  /** Called before each externally observable engine phase. */
  onProgress?: (step: CourseEngineProgressStep) => void | Promise<void>;
};

export type CourseRecommendationEngineFactory = (
  input: unknown,
  config?: CourseEngineConfig,
  options?: CourseRecommendationEngineOptions,
) => CourseRecommendationEngine;

export const createCourseRecommendationEngine: CourseRecommendationEngineFactory = (
  input,
  config = DEFAULT_COURSE_ENGINE_CONFIG,
  options = {},
) => new CourseRecommendationEngine(input, config, options);

const emitProgress = async (
  options: CourseRecommendationEngineOptions,
  step: CourseEngineProgressStep,
): Promise<void> => {
  throwIfAborted(options.signal);
  await options.onProgress?.(step);
  throwIfAborted(options.signal);
};

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  signal?.throwIfAborted();
};

const withAbort = async <T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> => {
  if (!signal) return promise;
  throwIfAborted(signal);

  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = (): void => rejectAbort?.(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
};

type ResolvedStayEstimates = {
  byPlaceId: ReadonlyMap<string, PlaceStayEstimate>;
  llmRefinedCount: number;
  fallbackReason: string | null;
};

/**
 * 장소별 체류 시간을 정한다.
 *
 * 결정론 추정(카테고리 -> 가격대 -> 라스트오더)을 먼저 깔고, LLM 클라이언트가
 * 있으면 그 위에 덮어쓴다. LLM 값은 카테고리 범위로 clamp되므로 아무리 이상한
 * 값이 와도 일정이 망가지지 않고, 실패하면 결정론 값이 그대로 남는다.
 */
const resolveStayEstimates = async (
  input: CourseInput,
  config: CourseEngineConfig,
  options: CourseRecommendationEngineOptions,
): Promise<ResolvedStayEstimates> => {
  const dayOfWeek = toDayOfWeek(input.dateISO);
  const byPlaceId = new Map<string, PlaceStayEstimate>(
    input.places.map((place) => [
      place.id,
      estimateStayDeterministically(place, {
        dayOfWeek,
        numberOfPeople: input.numberOfPeople,
        largeGroupThreshold: config.largeGroupThreshold,
        largeGroupExtraStayMinutes: config.largeGroupExtraStayMinutes,
        pace: input.pacePreference ?? "NORMAL",
      }),
    ]),
  );

  const client =
    options.estimateStay ?? (options.openAiApiKey ? createOpenAiStayEstimatorClient() : undefined);
  if (!client) return { byPlaceId, llmRefinedCount: 0, fallbackReason: null };

  try {
    const response = await client({
      candidates: input.places.flatMap((place) => {
        const estimate = byPlaceId.get(place.id);
        if (!estimate) return [];
        return [
          {
            placeId: place.id,
            name: place.name,
            category: `${place.mainCategory}/${place.subCategory}`,
            tags: [...place.tags],
            contentSummary: place.contentSummary,
            pricePerPersonWon: place.priceRangePerPerson,
            minMinutes: estimate.range.min,
            maxMinutes: estimate.range.max,
            baselineMinutes: estimate.range.typical,
          },
        ];
      }),
      openAiApiKey: options.openAiApiKey,
      signal: options.signal,
    });

    let llmRefinedCount = 0;
    for (const estimate of response.estimates) {
      const current = byPlaceId.get(estimate.placeId);
      if (!current) continue;
      byPlaceId.set(estimate.placeId, withLlmTypical(current, estimate.typicalStayMinutes));
      llmRefinedCount += 1;
    }

    return { byPlaceId, llmRefinedCount, fallbackReason: null };
  } catch (error) {
    throwIfAborted(options.signal);
    return {
      byPlaceId,
      llmRefinedCount: 0,
      fallbackReason: error instanceof Error ? error.message : String(error),
    };
  }
};

type ResolvedTravelMatrix = {
  /** `minutes[i][j]` = 장소 i에서 j까지 도보 분. 대칭이다. */
  minutes: number[][];
  measuredPairCount: number;
  estimatedPairCount: number;
  calibration: WalkCalibration | null;
  fallbackReason: string | null;
};

/**
 * 도보 이동 시간 매트릭스를 만든다.
 *
 * 계측에 성공한 쌍은 실측값을, 나머지는 직선거리 추정값을 쓴다. 계측 자체가
 * 불가능한 상황(키 없음, 네트워크 실패)에서도 항상 완전한 매트릭스를 돌려주므로
 * 코스 탐색은 언제나 진행된다.
 */
const resolveTravelMatrix = async (
  input: CourseInput,
  config: CourseEngineConfig,
  options: CourseRecommendationEngineOptions,
): Promise<ResolvedTravelMatrix> => {
  const places = input.places.map((place) => ({
    id: place.id,
    lat: place.location.lat,
    lng: place.location.lng,
  }));

  const estimate = (fromIndex: number, toIndex: number): number => {
    const from = places[fromIndex];
    const to = places[toIndex];
    if (!from || !to) return 1;
    return toWalkMinutes(toDistanceMeters(from, to), config.fallbackWalkingMetersPerMinute);
  };

  const minutes = places.map((_, fromIndex) =>
    places.map((__, toIndex) => (fromIndex === toIndex ? 0 : estimate(fromIndex, toIndex))),
  );

  const totalPairCount = (places.length * (places.length - 1)) / 2;
  const noMeasurement = (fallbackReason: string | null): ResolvedTravelMatrix => ({
    minutes,
    measuredPairCount: 0,
    estimatedPairCount: totalPairCount,
    calibration: null,
    fallbackReason,
  });

  if (places.length < 2) return noMeasurement(null);

  const client =
    options.travelMatrix ??
    (options.tmapAppKey
      ? createCalibratedTmapMatrixClient({ sampleSize: config.travelCalibrationSampleSize })
      : undefined);
  if (!client) return noMeasurement("No travel matrix client configured");

  try {
    const measured = await client({
      places,
      maxWalkableMeters: config.maxWalkableMeters,
      concurrency: config.travelRequestConcurrency,
      tmapAppKey: options.tmapAppKey,
      signal: options.signal,
    });

    let overlaidPairCount = 0;
    for (let fromIndex = 0; fromIndex < places.length; fromIndex += 1) {
      for (let toIndex = fromIndex + 1; toIndex < places.length; toIndex += 1) {
        const from = places[fromIndex];
        const to = places[toIndex];
        if (!from || !to) continue;

        // 클라이언트가 한 방향만 채웠어도 도보는 대칭이므로 양방향에 적용한다.
        const value =
          measured.minutesByPlaceId[from.id]?.[to.id] ??
          measured.minutesByPlaceId[to.id]?.[from.id];
        if (value === undefined) continue;

        setTravelMinutes(minutes, fromIndex, toIndex, value);
        setTravelMinutes(minutes, toIndex, fromIndex, value);
        overlaidPairCount += 1;
      }
    }

    // 보정 클라이언트는 추정한 쌍까지 돌려주므로, 실측 쌍 수는 클라이언트가 알려준
    // 값을 신뢰한다. 알려주지 않으면 돌려준 쌍을 전부 실측으로 본다.
    const measuredPairCount = Math.min(
      measured.measuredPairCount ?? overlaidPairCount,
      totalPairCount,
    );

    return {
      minutes,
      measuredPairCount,
      estimatedPairCount: totalPairCount - measuredPairCount,
      calibration: measured.calibration ?? null,
      fallbackReason: null,
    };
  } catch (error) {
    throwIfAborted(options.signal);
    return noMeasurement(error instanceof Error ? error.message : String(error));
  }
};

const setTravelMinutes = (
  minutes: number[][],
  fromIndex: number,
  toIndex: number,
  value: number,
): void => {
  const row = minutes[fromIndex];
  if (row) row[toIndex] = value;
};

const getTravelMinutes = (minutes: number[][], fromIndex: number, toIndex: number): number =>
  minutes[fromIndex]?.[toIndex] ?? 1;

type CurationResult = {
  courses: CourseRecommendationItem[];
  curatedByLlm: boolean;
  fallbackReason: CourseEngineMeta["curationFallbackReason"];
};

const curateCourses = async (
  candidates: CourseRecommendationItem[],
  input: CourseInput,
  config: CourseEngineConfig,
  options: CourseRecommendationEngineOptions,
): Promise<CurationResult> => {
  const fallback = (fallbackReason: string): CurationResult => ({
    courses: candidates.slice(0, config.targetCourseCount),
    curatedByLlm: false,
    fallbackReason,
  });

  const client = options.curateCourses ?? createOpenAiCourseCurationClient();

  try {
    const curation = await client({
      candidates: candidates.map(toCourseCurationCandidate),
      targetCourseCount: config.targetCourseCount,
      openAiApiKey: options.openAiApiKey,
      signal: options.signal,
    });
    const courseById = new Map(candidates.map((course) => [course.id, course]));
    const picked = curation.picks.flatMap((pick) => {
      const course = courseById.get(pick.courseId);
      if (!course) return [];
      return [
        CourseRecommendationItemSchema.parse({
          ...course,
          title: pick.title,
          courseType: pick.courseType,
          selection: {
            ...pick.selection,
            tradeoffs: withMandatoryTradeoffs(course, pick.selection.tradeoffs, config),
          },
          reasons: pick.selection.reasonTexts,
        }),
      ];
    });

    if (picked.length === 0) {
      return fallback("Curation returned no pick matching a generated candidate");
    }

    const pickedIds = new Set(picked.map((course) => course.id));
    const fallbackFill = candidates
      .filter((course) => !pickedIds.has(course.id))
      .slice(0, Math.max(0, config.targetCourseCount - picked.length));

    return {
      courses: [...picked, ...fallbackFill],
      curatedByLlm: true,
      fallbackReason: null,
    };
  } catch (error) {
    throwIfAborted(options.signal);
    return fallback(error instanceof Error ? error.message : String(error));
  }
};

const MAX_TRADEOFFS = 3;

/**
 * LLM은 `selection`을 통째로 갈아끼우므로 결정론 단계에서 붙인 사실 경고가 사라진다.
 * 영업시간 미확인 같은 정보는 사용자가 알아야 하므로 다시 넣어 준다.
 * 감점 폭이 `unknownHoursPenalty`의 배수라 코스 항목만 보고도 장소 수를 되돌릴 수 있다.
 */
const withMandatoryTradeoffs = (
  course: CourseRecommendationItem,
  tradeoffs: string[],
  config: CourseEngineConfig,
): string[] => {
  if (config.unknownHoursPenalty <= 0) return tradeoffs;

  const unknownHoursCount = Math.round(
    -course.scoreBreakdown.unknownHours / config.unknownHoursPenalty,
  );
  const mandatory = buildUnknownHoursTradeoff(unknownHoursCount);
  if (!mandatory || tradeoffs.includes(mandatory)) return tradeoffs;

  return [mandatory, ...tradeoffs].slice(0, MAX_TRADEOFFS);
};

type CandidateBuildResult = {
  pool: CourseRecommendationItem[];
  candidateCount: number;
};

/**
 * 코스 후보를 만든다.
 *
 * 비트마스크 DP + 빔서치로 탐색하되, 결과는 `mask`(방문 장소 집합)당 최고 점수 상태
 * 하나만 남긴다. 같은 장소 조합의 서로 다른 순열은 사용자에게 사실상 같은 코스라
 * 후보 풀만 균질하게 만들기 때문이다. 무거운 변환(zod 검증, 타임라인 문자열 생성)은
 * 상위 `candidatePoolSize`개에만 적용한다.
 */
const buildCourses = (
  input: CourseInput,
  config: CourseEngineConfig,
  travelMinutes: number[][],
  stayByPlaceId: ReadonlyMap<string, PlaceStayEstimate>,
): CandidateBuildResult => {
  const dayOfWeek = toDayOfWeek(input.dateISO);
  const metrics = buildPlaceMetrics(input, config, dayOfWeek, stayByPlaceId);
  const courseStartMinute = toMinute(input.startTime24h);
  const courseEndMinute = courseStartMinute + input.totalDurationMinutes;
  const scoring: ScoringContext = {
    ...buildMealContext(input, metrics, dayOfWeek, courseStartMinute, courseEndMinute),
    courseStartMinute,
    totalDurationMinutes: input.totalDurationMinutes,
    budgetPerPersonWon: input.budgetPerPersonWon,
  };

  /** 장소 집합(mask)당 최고 점수 상태 하나만 유지한다. */
  const bestByMask = new Map<number, ScoredState>();

  const remember = (state: CourseState): void => {
    if (state.stopCount < 2) return;
    const scored = scoreState(state, config, scoring);
    const existing = bestByMask.get(state.mask);
    if (!existing || compareScoredStates(scored, existing) < 0) {
      bestByMask.set(state.mask, scored);
    }
  };

  let frontier = pruneLevel(
    input.places.flatMap((place, index) => {
      const placeMetrics = getMetrics(metrics, index);

      return resolveArrivals(place, placeMetrics, {
        dayOfWeek,
        earliestArrive: courseStartMinute,
        latestEnd: courseEndMinute,
        maxWaitMinutes: config.maxWaitMinutes,
      }).map((arriveMinute) => {
        const leaveMinute = arriveMinute + placeMetrics.stayMinutes;
        const waitMinutes = arriveMinute - courseStartMinute;

        return {
          mask: 1 << index,
          last: index,
          stopCount: 1,
          startMinute: arriveMinute,
          endMinute: leaveMinute,
          stayMinutes: placeMetrics.stayMinutes,
          totalStayMinutes: placeMetrics.stayMinutes,
          totalTravelMinutes: 0,
          totalWaitMinutes: waitMinutes,
          placeScoreSum: place.score,
          flowBonus: 0,
          travelFromPrevious: 0,
          waitFromPrevious: waitMinutes,
          categoryMask: placeMetrics.categoryBit,
          unknownHoursCount: placeMetrics.unknownHours ? 1 : 0,
          costMinSum: placeMetrics.costMin,
          costMaxSum: placeMetrics.costMax,
          mealStopIndex:
            placeMetrics.isMeal && overlapsMealWindow(arriveMinute, leaveMinute) ? 0 : undefined,
          prev: undefined,
        } satisfies CourseState;
      });
    }),
    config,
  );

  for (let stopCount = 1; stopCount < config.maxStopsPerCourse; stopCount += 1) {
    const nextStates: CourseState[] = [];

    for (const state of frontier) {
      input.places.forEach((nextPlace, nextIndex) => {
        if ((state.mask & (1 << nextIndex)) !== 0) return;

        const nextMetrics = getMetrics(metrics, nextIndex);
        const legMinutes = getTravelMinutes(travelMinutes, state.last, nextIndex);
        const earliestArrive = state.endMinute + legMinutes;

        for (const arriveMinute of resolveArrivals(nextPlace, nextMetrics, {
          dayOfWeek,
          earliestArrive,
          latestEnd: courseEndMinute,
          maxWaitMinutes: config.maxWaitMinutes,
        })) {
          const leaveMinute = arriveMinute + nextMetrics.stayMinutes;
          const waitMinutes = arriveMinute - earliestArrive;

          nextStates.push({
            mask: state.mask | (1 << nextIndex),
            last: nextIndex,
            stopCount: state.stopCount + 1,
            startMinute: state.startMinute,
            endMinute: leaveMinute,
            stayMinutes: nextMetrics.stayMinutes,
            totalStayMinutes: state.totalStayMinutes + nextMetrics.stayMinutes,
            totalTravelMinutes: state.totalTravelMinutes + legMinutes,
            totalWaitMinutes: state.totalWaitMinutes + waitMinutes,
            placeScoreSum: state.placeScoreSum + nextPlace.score,
            flowBonus:
              state.flowBonus +
              getTransitionFlowBonus(getMetrics(metrics, state.last), nextMetrics),
            travelFromPrevious: legMinutes,
            waitFromPrevious: waitMinutes,
            categoryMask: state.categoryMask | nextMetrics.categoryBit,
            unknownHoursCount: state.unknownHoursCount + (nextMetrics.unknownHours ? 1 : 0),
            costMinSum: state.costMinSum + nextMetrics.costMin,
            costMaxSum: state.costMaxSum + nextMetrics.costMax,
            mealStopIndex:
              state.mealStopIndex ??
              (nextMetrics.isMeal && overlapsMealWindow(arriveMinute, leaveMinute)
                ? state.stopCount
                : undefined),
            prev: state,
          });
        }
      });
    }

    for (const state of nextStates) remember(state);
    if (nextStates.length === 0) break;
    frontier = pruneLevel(nextStates, config);
  }

  const pool = selectDiverseCandidates([...bestByMask.values()], config)
    .map((scored) =>
      redistributeSlack(scored, {
        config,
        scoring,
        metrics,
        travelMinutes,
        dayOfWeek,
        courseEndMinute,
        places: input.places,
      }),
    )
    .sort(compareScoredStates)
    .map((scored) => toCourseRecommendationItem(scored, input, metrics));

  return { pool, candidateCount: bestByMask.size };
};

/**
 * 다음 단계로 넘길 상태를 좁힌다.
 *
 * 1) `mask:last`별로 상위 `beamWidth`개만 남기고,
 * 2) 그래도 남는 상태가 많으면 전체에서 상위 `maxFrontierStates`개로 자른다.
 *
 * 2번이 없으면 `mask:last` 조합 자체가 장소 수에 지수적으로 늘어나기 때문에
 * 버킷별 빔만으로는 상한이 걸리지 않는다.
 */
const pruneLevel = (states: CourseState[], config: CourseEngineConfig): CourseState[] => {
  const buckets = new Map<string, CourseState[]>();

  for (const state of states) {
    const key = `${state.mask}:${state.last}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(state);
    else buckets.set(key, [state]);
  }

  const pruned: CourseState[] = [];
  for (const bucket of buckets.values()) {
    bucket.sort(compareStateQuality);
    for (let index = 0; index < Math.min(bucket.length, config.beamWidth); index += 1) {
      const state = bucket[index];
      if (state) pruned.push(state);
    }
  }

  if (pruned.length <= config.maxFrontierStates) return pruned;

  pruned.sort(compareStateQuality);
  return pruned.slice(0, config.maxFrontierStates);
};

const compareStateQuality = (left: CourseState, right: CourseState): number =>
  getRawStateScore(right) - getRawStateScore(left) || left.endMinute - right.endMinute;

/**
 * 빔 가지치기용 지표. 최종 점수와 방향을 맞추기 위해 합이 아니라 평균을 쓴다.
 * 합을 쓰면 장소가 많은 상태만 살아남아 최종 랭킹과 어긋난다.
 */
const getRawStateScore = (state: CourseState): number =>
  state.placeScoreSum / state.stopCount +
  state.flowBonus -
  state.totalTravelMinutes * 0.25 -
  state.totalWaitMinutes * 0.1;

const scoreState = (
  state: CourseState,
  config: CourseEngineConfig,
  scoring: ScoringContext,
): ScoredState => {
  const mealPlan = buildMealPlan(state, scoring);
  const placeScore = (state.placeScoreSum / state.stopCount) * config.placeScoreWeight;
  const mealFit = getMealFitScore(mealPlan.status, config);
  const travelEfficiency = -state.totalTravelMinutes * config.travelPenaltyPerMinute;
  const waitEfficiency = -state.totalWaitMinutes * config.waitPenaltyPerMinute;
  const elapsedMinutes = state.endMinute - scoring.courseStartMinute;
  const durationFit =
    config.durationFitBonus * Math.min(1, elapsedMinutes / scoring.totalDurationMinutes);
  const flow = Math.min(state.flowBonus, config.maxFlowBonus);
  // 서로 다른 카테고리 비율에 비례해 준다. 3스톱 전부 다른 카테고리면 만점.
  const categoryDiversity =
    config.categoryDiversityBonus * (countBits(state.categoryMask) / state.stopCount);
  const costFit = getCostFitScore(state, config, scoring.budgetPerPersonWon);
  const unknownHours = -state.unknownHoursCount * config.unknownHoursPenalty;

  // 가산 항목을 하나 더할 때마다 상한을 넘겨 상위 코스가 전부 100점으로 뭉개졌다.
  // 이론상 만점으로 나눠 정규화하면 항목을 추가해도 상한이 저절로 유지되고,
  // 항목 사이의 상대 가중치도 그대로 보존된다.
  const maxPositiveScore =
    config.placeScoreWeight * 100 +
    config.mealBonus +
    config.durationFitBonus +
    config.maxFlowBonus +
    config.categoryDiversityBonus +
    (scoring.budgetPerPersonWon === undefined ? 0 : config.costFitBonus);

  const raw =
    placeScore +
    mealFit +
    travelEfficiency +
    waitEfficiency +
    durationFit +
    categoryDiversity +
    costFit +
    unknownHours +
    flow;
  const total = clampScore((raw / maxPositiveScore) * 100);

  return {
    state,
    score: total,
    placeScore,
    mealFit,
    travelEfficiency,
    waitEfficiency,
    durationFit,
    categoryDiversity,
    costFit,
    unknownHours,
    flow,
    mealPlan,
  };
};

/**
 * 예산 적합도. 예산을 안 받았으면 비용은 랭킹에 반영하지 않는다.
 * 예산이 있으면 예상 비용 중앙값이 범위 안일 때 만점, 범위를 벗어날수록 깎는다.
 */
const getCostFitScore = (
  state: CourseState,
  config: CourseEngineConfig,
  budgetPerPersonWon: CourseBudgetRange | undefined,
): number => {
  if (budgetPerPersonWon === undefined) return 0;

  const expectedCost = (state.costMinSum + state.costMaxSum) / 2;
  const [minBudget, maxBudget] = budgetPerPersonWon;
  if (expectedCost >= minBudget && expectedCost <= maxBudget) return config.costFitBonus;

  const distance = expectedCost < minBudget ? minBudget - expectedCost : expectedCost - maxBudget;
  const boundary = expectedCost < minBudget ? minBudget : maxBudget;
  const deviationRatio = distance / boundary;
  // 목표 범위에서 멀어질수록 감점하고, 두 배 이상 벗어나면 최저점으로 고정한다.
  return config.costFitBonus * Math.max(-1, 1 - deviationRatio * 2);
};

/**
 * 점수만 보고 상위 N개를 자르면 후보가 전부 같은 고득점 장소들의 변형이 된다.
 * (실측: 상위 12개의 평균 자카드 유사도 0.55, 카페 한 곳이 12/12에 등장)
 *
 * 그래서 이미 뽑은 후보와 장소가 겹칠수록 점수를 깎아가며 하나씩 고른다.
 * 겹침은 장소 집합 비트마스크의 자카드 유사도로 잰다.
 */
const selectDiverseCandidates = (
  candidates: ScoredState[],
  config: CourseEngineConfig,
): ScoredState[] => {
  const ranked = candidates.sort(compareScoredStates);
  if (ranked.length <= config.candidatePoolSize) return ranked;

  const selected: ScoredState[] = [];
  const remaining = new Set(ranked);

  while (selected.length < config.candidatePoolSize && remaining.size > 0) {
    let best: ScoredState | undefined;
    let bestValue = -Infinity;

    for (const candidate of remaining) {
      let maxSimilarity = 0;
      for (const chosen of selected) {
        const similarity = toJaccard(candidate.state.mask, chosen.state.mask);
        if (similarity > maxSimilarity) maxSimilarity = similarity;
        if (maxSimilarity === 1) break;
      }

      const value = candidate.score - config.diversityPenalty * maxSimilarity;
      if (value > bestValue) {
        bestValue = value;
        best = candidate;
      }
    }

    if (!best) break;
    selected.push(best);
    remaining.delete(best);
  }

  return selected;
};

type RedistributionContext = {
  config: CourseEngineConfig;
  scoring: ScoringContext;
  metrics: PlaceMetrics[];
  travelMinutes: number[][];
  dayOfWeek: DayOfWeek;
  courseEndMinute: number;
  places: readonly PlaceRecommendationItem[];
};

/**
 * 코스가 확정된 뒤 남는 시간을 각 장소의 체류 시간에 나눠 준다.
 *
 * 탐색은 기본 체류 시간으로만 하므로(가변으로 두면 상태 공간이 터진다) 4시간을
 * 요청했는데 좋은 장소 3곳으로 2시간 30분밖에 안 채워지는 일이 생긴다. 그러면
 * 엔진은 "각 장소에 더 오래 머물기"라는 선택지가 없어 어중간한 4번째 장소를
 * 끼워 넣는다. 여기서 그 선택지를 되돌려 준다.
 *
 * 재분배 결과가 원본보다 점수가 낮으면 원본을 유지하므로 절대 나빠지지 않는다.
 */
const redistributeSlack = (scored: ScoredState, context: RedistributionContext): ScoredState => {
  const route = unwind(scored.state);
  const stayPlan = route.map((state) => state.stayMinutes);
  // 각 정거장의 원래 도착 시각. `startMinute`은 코스 전체의 시작이라 여기 쓰면 안 된다.
  const floors = route.map((state) => state.endMinute - state.stayMinutes);

  let best = scored;
  const exhausted = new Set<number>();

  // 여유를 한 곳에 몰아주면 "식당에서 110분, 카페는 60분"처럼 치우친 코스가 된다.
  // 남은 여력이 가장 큰 장소부터 조금씩 돌아가며 늘려 고르게 배분한다.
  while (exhausted.size < route.length) {
    let target = -1;
    let bestHeadroom = 0;
    for (let index = 0; index < route.length; index += 1) {
      if (exhausted.has(index)) continue;
      const routeState = route[index];
      if (!routeState) continue;
      const headroom =
        getMetrics(context.metrics, routeState.last).maxStayMinutes - (stayPlan[index] ?? 0);
      if (headroom > bestHeadroom) {
        bestHeadroom = headroom;
        target = index;
      }
    }

    if (target < 0) break;

    const step = Math.min(SLACK_STEP_MINUTES, bestHeadroom);
    const trial = [...stayPlan];
    trial[target] = (trial[target] ?? 0) + step;

    const rebuilt = simulateRoute(route, trial, floors, context);
    const candidate = rebuilt ? scoreState(rebuilt, context.config, context.scoring) : undefined;

    // 늘릴 수 없거나(영업시간·총 시간 초과) 늘려서 점수가 떨어지면(식사 시간대 이탈 등)
    // 이 장소는 더 늘리지 않는다.
    if (!candidate || compareScoredStates(candidate, best) >= 0) {
      exhausted.add(target);
      continue;
    }

    stayPlan[target] = trial[target] ?? 0;
    best = candidate;
  }

  return best;
};

const SLACK_STEP_MINUTES = 5;

/**
 * 정해진 방문 순서와 체류 시간 배분으로 코스를 다시 시뮬레이션한다.
 * 원래 도착 시각을 하한으로 유지해 식사 시간대를 맞추려던 대기가 사라지지 않게 한다.
 */
const simulateRoute = (
  route: readonly CourseState[],
  stayPlan: readonly number[],
  floors: readonly number[],
  context: RedistributionContext,
): CourseState | undefined => {
  let previous: CourseState | undefined;

  for (let index = 0; index < route.length; index += 1) {
    const routeState = route[index];
    const stayMinutes = stayPlan[index];
    const floor = floors[index];
    if (!routeState || stayMinutes === undefined || floor === undefined) return undefined;

    const placeIndex = routeState.last;
    const metrics = getMetrics(context.metrics, placeIndex);
    const place = context.places[placeIndex];
    if (!place) return undefined;

    const travelFromPrevious = previous
      ? getTravelMinutes(context.travelMinutes, previous.last, placeIndex)
      : 0;
    const earliestArrive = previous
      ? Math.max(previous.endMinute + travelFromPrevious, floor)
      : floor;

    const arriveMinute = resolveArrivalMinute(
      place,
      { ...metrics, stayMinutes },
      {
        dayOfWeek: context.dayOfWeek,
        earliestArrive,
        latestEnd: context.courseEndMinute,
        maxWaitMinutes: Number.POSITIVE_INFINITY,
      },
      earliestArrive,
    );
    if (arriveMinute === undefined) return undefined;

    const leaveMinute = arriveMinute + stayMinutes;
    const waitFromPrevious = previous
      ? arriveMinute - (previous.endMinute + travelFromPrevious)
      : 0;

    previous = {
      mask: routeState.mask,
      last: placeIndex,
      stopCount: index + 1,
      startMinute: previous?.startMinute ?? arriveMinute,
      endMinute: leaveMinute,
      stayMinutes,
      totalStayMinutes: (previous?.totalStayMinutes ?? 0) + stayMinutes,
      totalTravelMinutes: (previous?.totalTravelMinutes ?? 0) + travelFromPrevious,
      totalWaitMinutes: (previous?.totalWaitMinutes ?? 0) + waitFromPrevious,
      placeScoreSum: (previous?.placeScoreSum ?? 0) + place.score,
      flowBonus:
        (previous?.flowBonus ?? 0) +
        (previous
          ? getTransitionFlowBonus(getMetrics(context.metrics, previous.last), metrics)
          : 0),
      travelFromPrevious,
      waitFromPrevious,
      categoryMask: (previous?.categoryMask ?? 0) | metrics.categoryBit,
      unknownHoursCount: (previous?.unknownHoursCount ?? 0) + (metrics.unknownHours ? 1 : 0),
      costMinSum: (previous?.costMinSum ?? 0) + metrics.costMin,
      costMaxSum: (previous?.costMaxSum ?? 0) + metrics.costMax,
      mealStopIndex:
        previous?.mealStopIndex ??
        (metrics.isMeal && overlapsMealWindow(arriveMinute, leaveMinute) ? index : undefined),
      prev: previous,
    };
  }

  return previous;
};

const toJaccard = (left: number, right: number): number => {
  const union = countBits(left | right);
  return union === 0 ? 0 : countBits(left & right) / union;
};

const compareScoredStates = (left: ScoredState, right: ScoredState): number =>
  right.score - left.score ||
  right.state.stopCount - left.state.stopCount ||
  right.state.endMinute - left.state.endMinute ||
  left.state.totalTravelMinutes - right.state.totalTravelMinutes ||
  left.state.totalWaitMinutes - right.state.totalWaitMinutes;

const toCourseRecommendationItem = (
  scored: ScoredState,
  input: CourseInput,
  metrics: PlaceMetrics[],
): CourseRecommendationItem => {
  const route = unwind(scored.state);
  const courseStartMinute = toMinute(input.startTime24h);
  const places = route.map((routeState) => getPlace(input, routeState.last));
  const timeline = route.map((routeState) => {
    const place = getPlace(input, routeState.last);
    // 재분배로 늘어난 실제 체류 시간을 쓴다. 기본값으로 역산하면 시각이 어긋난다.
    const stayDurationMinutes = routeState.stayMinutes;
    const time24h = toTime24h(routeState.endMinute - stayDurationMinutes);

    return {
      placeId: place.id,
      placeName: place.name,
      categoryLabel: `${place.mainCategory} · ${place.subCategory}`,
      time24h,
      stayDurationMinutes,
      travelMinutesFromPrevious: routeState.travelFromPrevious,
      waitMinutesFromPrevious: routeState.waitFromPrevious,
      label: `${time24h} ${place.name}(${stayDurationMinutes}분 체류)`,
    };
  });
  const reasons = buildReasons(scored.mealPlan, scored.state);
  const categoryCount = new Set(places.map((place) => place.mainCategory)).size;

  return CourseRecommendationItemSchema.parse({
    id: buildCourseId(places),
    title: buildCourseTitle(places, metrics, scored.state),
    courseType: buildFallbackCourseType(places, scored.state),
    places,
    summary: {
      estimatedCostPerPerson: getEstimatedCostPerPerson(places),
      estimatedTotalMinutes: scored.state.endMinute - courseStartMinute,
      estimatedTravelMinutes: scored.state.totalTravelMinutes,
      totalStayMinutes: scored.state.totalStayMinutes,
      stopCount: places.length,
      categoryCount,
      mealIncluded: scored.mealPlan.status === "SATISFIED",
    },
    selection: {
      reasonCodes: buildFallbackReasonCodes(scored.mealPlan, places, scored.state),
      reasonTexts: reasons,
      tradeoffs: buildFallbackTradeoffs(places, scored.state),
    },
    timeline,
    startTime24h: toTime24h(scored.state.startMinute),
    endTime24h: toTime24h(scored.state.endMinute),
    totalStayMinutes: scored.state.totalStayMinutes,
    totalTravelMinutes: scored.state.totalTravelMinutes,
    mealPlan: scored.mealPlan,
    score: Math.round(scored.score),
    scoreBreakdown: {
      placeScore: round(scored.placeScore),
      mealFit: round(scored.mealFit),
      travelEfficiency: round(scored.travelEfficiency),
      waitEfficiency: round(scored.waitEfficiency),
      durationFit: round(scored.durationFit),
      categoryDiversity: round(scored.categoryDiversity),
      costFit: round(scored.costFit),
      unknownHours: round(scored.unknownHours),
      flow: round(scored.flow),
      total: round(scored.score),
    },
    reasons,
    candidateDecisions: input.places.map((place) => {
      const included = places.some((selected) => selected.id === place.id);
      return {
        placeId: place.id,
        placeName: place.name,
        decision: included ? "INCLUDED" : "NOT_IN_TOP_COMBINATION",
        message: included
          ? `${place.name}: 이 코스에 포함했습니다.`
          : `${place.name}: 더 적합한 시간·이동 조합이 있어 이 옵션에는 포함하지 않았습니다.`,
      };
    }),
  });
};

/**
 * 장소 id를 전부 이어붙이면 6스톱에서 id가 매우 길어지고, 그대로 LLM 프롬프트에
 * 실려 토큰을 낭비하고 모델이 되뱉을 때 오타가 난다. 순서까지 반영한 짧은 해시를 쓴다.
 */
const buildCourseId = (places: PlaceRecommendationItem[]): string => {
  let hash = 2_166_136_261;
  for (const place of places) {
    for (let index = 0; index < place.id.length; index += 1) {
      hash ^= place.id.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
    hash ^= 0x2f;
    hash = Math.imul(hash, 16_777_619);
  }

  return `${COURSE_ID_PREFIX}-${places.length}-${(hash >>> 0).toString(36)}`;
};

const getPlace = (input: CourseInput, index: number): PlaceRecommendationItem => {
  const place = input.places[index];
  if (!place) throw new Error(`Missing course place at index ${index}`);
  return place;
};

const getMetrics = (metrics: PlaceMetrics[], index: number): PlaceMetrics => {
  const value = metrics[index];
  if (!value) throw new Error(`Missing place metrics at index ${index}`);
  return value;
};

const unwind = (state: CourseState): CourseState[] => {
  const route: CourseState[] = [];
  let cursor: CourseState | undefined = state;

  while (cursor) {
    route.push(cursor);
    cursor = cursor.prev;
  }

  return route.reverse();
};

const buildMealContext = (
  input: CourseInput,
  metrics: PlaceMetrics[],
  dayOfWeek: DayOfWeek,
  courseStartMinute: number,
  courseEndMinute: number,
): MealContext => {
  const requiredWindow = MEAL_WINDOWS.find((window) =>
    rangesOverlap(courseStartMinute, courseEndMinute, window.start, window.end),
  );

  if (!requiredWindow) return { requiredWindow: undefined, hasFeasibleMealPlace: false };

  const hasFeasibleMealPlace = input.places.some((place, index) => {
    const placeMetrics = getMetrics(metrics, index);
    if (!placeMetrics.isMeal) return false;

    return (
      resolveArrivals(place, placeMetrics, {
        dayOfWeek,
        earliestArrive: requiredWindow.start,
        latestEnd: Math.min(courseEndMinute, requiredWindow.end + placeMetrics.stayMinutes),
        maxWaitMinutes: 0,
      }).length > 0
    );
  });

  return { requiredWindow, hasFeasibleMealPlace };
};

const buildMealPlan = (state: CourseState, mealContext: MealContext): MealPlan => {
  const { requiredWindow, hasFeasibleMealPlace } = mealContext;

  if (!requiredWindow) {
    return { status: "NOT_REQUIRED", reason: "식사 시간대와 겹치지 않는 코스입니다." };
  }

  if (state.mealStopIndex !== undefined) {
    return {
      status: "SATISFIED",
      reason: `${requiredWindow.label} 시간대에 식사 장소를 포함했습니다.`,
    };
  }

  if (!hasFeasibleMealPlace) {
    return {
      status: "MISSING_FEASIBLE_PLACE",
      reason: `입력 후보 중 ${requiredWindow.label} 시간대에 방문 가능한 식사 장소가 부족합니다.`,
    };
  }

  return {
    status: "NOT_SATISFIED",
    reason: `${requiredWindow.label} 시간대 식사 장소가 빠졌습니다.`,
  };
};

const getMealFitScore = (status: MealPlan["status"], config: CourseEngineConfig): number => {
  switch (status) {
    case "SATISFIED":
      return config.mealBonus;
    case "NOT_SATISFIED":
      return -config.missingMealPenalty;
    case "MISSING_FEASIBLE_PLACE":
      return -config.missingMealPenalty / 4;
    case "NOT_REQUIRED":
      return 0;
  }
};

const buildReasons = (mealPlan: MealPlan, state: CourseState): string[] => [
  mealPlan.reason,
  `장소 ${state.stopCount}개를 ${state.totalStayMinutes}분 체류로 구성했습니다.`,
  `예상 이동 시간은 ${state.totalTravelMinutes}분입니다.`,
];

const buildCourseTitle = (
  places: PlaceRecommendationItem[],
  metrics: PlaceMetrics[],
  state: CourseState,
): string => {
  if (state.totalTravelMinutes <= 15) return "이동 부담을 줄인 가까운 코스";
  const categoryCount = new Set(places.map((place) => place.mainCategory)).size;
  if (categoryCount >= Math.min(3, places.length)) return "장소 구성이 다양한 코스";
  if (state.mealStopIndex !== undefined || places.some((_, index) => isMealAt(metrics, index))) {
    return "식사를 챙기는 안정적인 코스";
  }
  return places.map((place) => place.name).join(" → ");
};

const isMealAt = (metrics: PlaceMetrics[], index: number): boolean =>
  metrics[index]?.isMeal ?? false;

const buildFallbackCourseType = (
  places: PlaceRecommendationItem[],
  state: CourseState,
): CourseRecommendationItem["courseType"] => {
  const categoryCount = new Set(places.map((place) => place.mainCategory)).size;

  if (state.totalTravelMinutes <= 15) {
    return {
      key: "LOW_TRAVEL",
      label: "이동 적은 코스",
      description: "장소 간 이동 부담을 줄인 코스입니다.",
    };
  }

  if (categoryCount >= Math.min(3, places.length)) {
    return {
      key: "DIVERSE_CATEGORIES",
      label: "다양한 코스",
      description: "서로 다른 유형의 장소를 섞은 코스입니다.",
    };
  }

  return {
    key: "BALANCED",
    label: "균형형 코스",
    description: "시간, 이동, 장소 점수를 균형 있게 반영한 코스입니다.",
  };
};

const buildFallbackReasonCodes = (
  mealPlan: MealPlan,
  places: PlaceRecommendationItem[],
  state: CourseState,
): string[] => {
  const codes = new Set<string>();
  if (state.totalTravelMinutes <= 15) codes.add("LOW_TRAVEL");
  if (mealPlan.status === "SATISFIED") codes.add("MEAL_INCLUDED");
  if (new Set(places.map((place) => place.mainCategory)).size >= 3) {
    codes.add("DIVERSE_CATEGORIES");
  }
  if (state.totalStayMinutes >= 240) codes.add("LONG_DURATION_FIT");
  if (codes.size === 0) codes.add("BALANCED");
  return [...codes];
};

/**
 * LLM이 지워서는 안 되는 사실 경고. 문체 선택이 아니라 정보라서, 큐레이션 결과에도
 * 다시 끼워 넣는다.
 */
const buildUnknownHoursTradeoff = (unknownHoursCount: number): string | undefined =>
  unknownHoursCount > 0
    ? `영업시간이 확인되지 않은 장소가 ${unknownHoursCount}곳 있습니다.`
    : undefined;

const buildFallbackTradeoffs = (
  places: PlaceRecommendationItem[],
  state: CourseState,
): string[] => {
  const tradeoffs: string[] = [];
  const unknownHours = buildUnknownHoursTradeoff(state.unknownHoursCount);
  if (unknownHours) tradeoffs.push(unknownHours);
  if (state.totalTravelMinutes >= 45) tradeoffs.push("이동 시간이 비교적 긴 편입니다.");
  if (state.totalWaitMinutes >= 30) tradeoffs.push("장소를 기다리는 시간이 포함되어 있습니다.");
  if (places.length <= 2) tradeoffs.push("장소 수가 적어 다양한 경험은 제한적입니다.");
  return tradeoffs.slice(0, 3);
};

const getEstimatedCostPerPerson = (places: PlaceRecommendationItem[]): [number, number] => {
  const [min, max] = places.reduce(
    ([minSum, maxSum], place) => [
      minSum + place.priceRangePerPerson[0],
      maxSum + place.priceRangePerPerson[1],
    ],
    [0, 0],
  );

  return [min, max];
};

/** 장소별 체류 시간 추정과 카테고리 비트를 한 번에 만든다. */
const buildPlaceMetrics = (
  input: CourseInput,
  config: CourseEngineConfig,
  dayOfWeek: DayOfWeek,
  stayByPlaceId: ReadonlyMap<string, PlaceStayEstimate>,
): PlaceMetrics[] => {
  const bitByCategory = new Map<string, number>();

  return input.places.map((place) => {
    const estimate =
      stayByPlaceId.get(place.id) ??
      estimateStayDeterministically(place, {
        dayOfWeek,
        numberOfPeople: input.numberOfPeople,
        largeGroupThreshold: config.largeGroupThreshold,
        largeGroupExtraStayMinutes: config.largeGroupExtraStayMinutes,
        pace: input.pacePreference ?? "NORMAL",
      });

    let bit = bitByCategory.get(place.mainCategory);
    if (bit === undefined) {
      bit = 1 << bitByCategory.size;
      bitByCategory.set(place.mainCategory, bit);
    }

    return {
      stayMinutes: estimate.range.typical,
      maxStayMinutes: estimate.range.max,
      isMeal: estimate.kind === "MEAL",
      isCafe: estimate.kind === "CAFE",
      categoryBit: bit,
      unknownHours: hasUnknownHours(place, dayOfWeek),
      costMin: place.priceRangePerPerson[0],
      costMax: place.priceRangePerPerson[1],
    };
  });
};

const overlapsMealWindow = (startMinute: number, endMinute: number): boolean =>
  MEAL_WINDOWS.some((window) => rangesOverlap(startMinute, endMinute, window.start, window.end));

const getTransitionFlowBonus = (previous: PlaceMetrics, next: PlaceMetrics): number =>
  previous.isMeal && next.isCafe ? 8 : 0;

type ArrivalOptions = {
  dayOfWeek: DayOfWeek;
  earliestArrive: number;
  latestEnd: number;
  maxWaitMinutes: number;
};

/**
 * 방문 가능한 도착 시각 후보를 만든다.
 *
 * 기존 구현은 "가장 이른 도착"만 시도하고 영업 시작 전이면 그냥 버렸다. 그래서
 * 10분만 기다리면 갈 수 있는 장소가 탐색에서 빠지고, 식사 시간대를 맞추려고
 * 잠깐 여유를 두는 코스는 아예 만들어질 수 없었다.
 */
const resolveArrivals = (
  place: PlaceRecommendationItem,
  metrics: PlaceMetrics,
  options: ArrivalOptions,
): number[] => {
  const targets = [options.earliestArrive];

  if (metrics.isMeal) {
    for (const window of MEAL_WINDOWS) {
      if (
        window.start > options.earliestArrive &&
        window.start - options.earliestArrive <= options.maxWaitMinutes
      ) {
        targets.push(window.start);
      }
    }
  }

  const arrivals: number[] = [];
  for (const target of targets) {
    const arrival = resolveArrivalMinute(place, metrics, options, target);
    if (arrival === undefined) continue;
    if (arrival - options.earliestArrive > options.maxWaitMinutes) continue;
    if (!arrivals.includes(arrival)) arrivals.push(arrival);
  }

  return arrivals;
};

const MINUTES_PER_DAY = 24 * 60;

/**
 * 마감 시각이 개점 시각보다 이르면 자정을 넘겨 영업하는 것이다(예: 18:00~02:00).
 * 그대로 분으로 바꾸면 마감(120분)이 개점(1080분)보다 작아져 모든 방문이 거부된다.
 * 실제로 새벽까지 여는 술집이 코스에서 통째로 사라지던 원인이었다.
 */
const toClosingMinute = (openMinute: number, rawCloseMinute: number): number =>
  rawCloseMinute <= openMinute ? rawCloseMinute + MINUTES_PER_DAY : rawCloseMinute;

const resolveArrivalMinute = (
  place: PlaceRecommendationItem,
  metrics: PlaceMetrics,
  options: ArrivalOptions,
  target: number,
): number | undefined => {
  const daily = place.operationInfo.schedules[options.dayOfWeek];
  if (daily.status === "CLOSED") return undefined;

  if (daily.status === "UNKNOWN") {
    return target + metrics.stayMinutes <= options.latestEnd ? target : undefined;
  }

  const openMinute = toMinute(daily.open);
  const closeMinute = toClosingMinute(openMinute, toMinute(daily.close));
  let arrive = Math.max(target, openMinute);

  // 브레이크 타임과 겹치면 종료 시각 뒤로 미룬다. 브레이크가 연달아 있을 수 있어
  // 더 이상 밀리지 않을 때까지 반복한다.
  for (let guard = 0; guard <= daily.breakTimes.length; guard += 1) {
    const blocking = daily.breakTimes.find((breakTime) =>
      rangesOverlap(
        arrive,
        arrive + metrics.stayMinutes,
        toMinute(breakTime.start),
        toMinute(breakTime.end),
      ),
    );
    if (!blocking) break;
    arrive = toMinute(blocking.end);
  }

  // 라스트 오더를 넘겨 도착하면 주문을 못 한다. 마감 시각과 같은 기준으로 정규화한다.
  if (daily.lastOrderTime !== undefined) {
    const lastOrderMinute = toClosingMinute(openMinute, toMinute(daily.lastOrderTime));
    if (arrive > lastOrderMinute) return undefined;
  }

  const leave = arrive + metrics.stayMinutes;
  if (leave > closeMinute || leave > options.latestEnd) return undefined;

  return arrive;
};

/** 영업시간을 알 수 없는 장소인지. 점수에서 불확실성만큼 감점한다. */
const hasUnknownHours = (place: PlaceRecommendationItem, dayOfWeek: DayOfWeek): boolean =>
  place.operationInfo.schedules[dayOfWeek].status === "UNKNOWN";

const toDayOfWeek = (dateISO: string): DayOfWeek => {
  const day = new Date(`${dateISO}T00:00:00.000Z`).getUTCDay();
  const days: DayOfWeek[] = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];
  const value = days[day];
  if (!value) throw new Error(`Invalid dateISO: ${dateISO}`);
  return value;
};

const rangesOverlap = (
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean => leftStart < rightEnd && rightStart < leftEnd;

function toMinute(time24h: string): number {
  const [hourText, minuteText] = time24h.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return hour * 60 + minute;
}

/** 자정을 넘긴 코스는 26:00이 아니라 02:00으로 표기한다. */
const toTime24h = (minuteOfDay: number): string => {
  const wrapped = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

const countBits = (value: number): number => {
  let count = 0;
  let cursor = value;
  while (cursor > 0) {
    count += cursor & 1;
    cursor >>>= 1;
  }
  return count;
};

const clampScore = (value: number): number => Math.max(0, Math.min(100, value));

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const toInputError = (error: {
  issues: {
    path: PropertyKey[];
    code?: string;
    maximum?: number | bigint;
    minimum?: number | bigint;
  }[];
}) => {
  const isTooManyPlaces = error.issues.some(
    (issue) =>
      issue.path.length === 1 &&
      issue.path[0] === "places" &&
      issue.code === "too_big" &&
      issue.maximum === 15,
  );

  if (isTooManyPlaces) {
    return {
      code: "COURSE_INPUT_TOO_MANY_PLACES",
      message: "Course recommendation accepts at most 15 places",
    };
  }

  const isTooFewPlaces = error.issues.some(
    (issue) =>
      issue.path.length === 1 &&
      issue.path[0] === "places" &&
      issue.code === "too_small" &&
      issue.minimum === 2,
  );

  if (isTooFewPlaces) {
    return {
      code: "COURSE_INPUT_TOO_FEW_PLACES",
      message: "Course recommendation requires at least 2 places",
    };
  }

  return {
    code: "COURSE_INVALID_INPUT",
    message: "Course recommendation input is invalid",
  };
};

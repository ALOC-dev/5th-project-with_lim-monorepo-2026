import type {
  DayOfWeek,
  PlaceRecommendationItem,
} from "@monorepo/recommendation-engine/v1/contracts";

import {
  DEFAULT_COURSE_ENGINE_CONFIG,
  type CourseEngineConfig,
} from "./configs.js";
import {
  type CourseEngineOutput,
  CourseInputSchema,
  type CourseInput,
  type CourseRecommendationItem,
  CourseRecommendationItemSchema,
} from "./contracts.js";

type CourseState = {
  mask: number;
  last: number;
  startMinute: number;
  endMinute: number;
  totalStayMinutes: number;
  totalTravelMinutes: number;
  placeScoreSum: number;
  flowBonus: number;
  mealStopIndex?: number;
  prev?: CourseState;
};

const LUNCH_WINDOW = { start: toMinute("11:30"), end: toMinute("13:30"), label: "점심" };
const DINNER_WINDOW = { start: toMinute("17:30"), end: toMinute("20:00"), label: "저녁" };
const COURSE_ID_PREFIX = "course";

export class CourseRecommendationEngine {
  private readonly config: CourseEngineConfig;
  private readonly input: unknown;

  constructor(input: unknown, config: CourseEngineConfig = DEFAULT_COURSE_ENGINE_CONFIG) {
    this.input = input;
    this.config = config;
  }

  async process(): Promise<CourseEngineOutput> {
    const parsed = CourseInputSchema.safeParse(this.input);

    if (!parsed.success) {
      return {
        status: "ERROR",
        userInput: this.input,
        error: toInputError(parsed.error),
      };
    }

    const userInput = parsed.data;
    const courses = buildCourses(userInput, this.config);

    if (courses.length === 0) {
      return {
        status: "ERROR",
        userInput,
        error: {
          code: "COURSE_NO_FEASIBLE_COURSES",
          message: "No course can be built within the requested schedule",
        },
      };
    }

    return {
      status: "SUCCESS",
      userInput,
      userOutput: {
        courses,
      },
    };
  }
}

const buildCourses = (
  input: CourseInput,
  config: CourseEngineConfig,
): CourseRecommendationItem[] => {
  const startMinute = toMinute(input.startTime24h);
  const endMinute = startMinute + input.totalDurationMinutes;
  const dp = new Map<string, CourseState[]>();
  const allStates: CourseState[] = [];

  input.places.forEach((place, index) => {
    const arriveMinute = startMinute;
    const stayMinutes = getEstimatedStayMinutes(place);
    const leaveMinute = arriveMinute + stayMinutes;

    if (!canVisit(place, input.dateISO, arriveMinute, leaveMinute)) return;

    const state: CourseState = {
      mask: 1 << index,
      last: index,
      startMinute: arriveMinute,
      endMinute: leaveMinute,
      totalStayMinutes: stayMinutes,
      totalTravelMinutes: 0,
      placeScoreSum: place.score,
      flowBonus: 0,
      ...(isMealPlace(place) && overlapsMealWindow(arriveMinute, leaveMinute)
        ? { mealStopIndex: 0 }
        : {}),
    };
    pushState(dp, state, config);
    allStates.push(state);
  });

  for (let stopCount = 1; stopCount < config.maxStopsPerCourse; stopCount += 1) {
    const snapshot = [...dp.values()].flat().filter((state) => countBits(state.mask) === stopCount);

    for (const state of snapshot) {
      const previousPlace = input.places[state.last];
      if (!previousPlace) continue;

      input.places.forEach((nextPlace, nextIndex) => {
        if ((state.mask & (1 << nextIndex)) !== 0) return;

        const travelMinutes = getTravelMinutes(previousPlace, nextPlace, input, config);
        const arriveMinute = state.endMinute + travelMinutes;
        const stayMinutes = getEstimatedStayMinutes(nextPlace);
        const leaveMinute = arriveMinute + stayMinutes;

        if (leaveMinute > endMinute) return;
        if (!canVisit(nextPlace, input.dateISO, arriveMinute, leaveMinute)) return;

        const nextState: CourseState = {
          mask: state.mask | (1 << nextIndex),
          last: nextIndex,
          startMinute: state.startMinute,
          endMinute: leaveMinute,
          totalStayMinutes: state.totalStayMinutes + stayMinutes,
          totalTravelMinutes: state.totalTravelMinutes + travelMinutes,
          placeScoreSum: state.placeScoreSum + nextPlace.score,
          flowBonus: state.flowBonus + getTransitionFlowBonus(previousPlace, nextPlace),
          mealStopIndex:
            state.mealStopIndex ??
            (isMealPlace(nextPlace) && overlapsMealWindow(arriveMinute, leaveMinute)
              ? stopCount
              : undefined),
          prev: state,
        };
        pushState(dp, nextState, config);
        allStates.push(nextState);
      });
    }
  }

  return allStates
    .filter((state) => countBits(state.mask) >= 2)
    .map((state) => toCourseRecommendationItem(state, input, config))
    .sort((left, right) => right.score - left.score || left.totalTravelMinutes - right.totalTravelMinutes)
    .slice(0, config.targetCourseCount);
};

const pushState = (
  dp: Map<string, CourseState[]>,
  state: CourseState,
  config: CourseEngineConfig,
): void => {
  const key = `${state.mask}:${state.last}`;
  const bucket = dp.get(key) ?? [];
  bucket.push(state);
  bucket.sort(compareStateQuality);
  dp.set(key, bucket.slice(0, config.beamWidth));
};

const compareStateQuality = (left: CourseState, right: CourseState): number =>
  getRawStateScore(right) - getRawStateScore(left) || left.endMinute - right.endMinute;

const getRawStateScore = (state: CourseState): number =>
  state.placeScoreSum + state.flowBonus - state.totalTravelMinutes * 0.25;

const toCourseRecommendationItem = (
  state: CourseState,
  input: CourseInput,
  config: CourseEngineConfig,
): CourseRecommendationItem => {
  const route = unwind(state);
  const mealPlan = buildMealPlan(state, input);
  const placeScore = state.placeScoreSum / route.length;
  const mealFit = getMealFitScore(mealPlan.status, config);
  const travelEfficiency = -state.totalTravelMinutes * config.travelPenaltyPerMinute;
  const total = clampScore(placeScore + mealFit + travelEfficiency + state.flowBonus);
  const timeline = route.map((routeState, index) => {
    const place = getPlace(input, routeState.last);
    const previous = route[index - 1];
    const travelMinutesFromPrevious = previous
      ? routeState.endMinute - previous.endMinute - getEstimatedStayMinutes(place)
      : routeState.startMinute - toMinute(input.startTime24h);
    const time24h = toTime24h(routeState.endMinute - getEstimatedStayMinutes(place));
    const stayDurationMinutes = getEstimatedStayMinutes(place);

    return {
      place,
      time24h,
      stayDurationMinutes,
      travelMinutesFromPrevious: Math.max(0, travelMinutesFromPrevious),
      label: `${time24h} ${place.name}(${stayDurationMinutes}분 체류)`,
    };
  });
  const places = timeline.map((item) => item.place);
  const estimatedCostPerPerson = getEstimatedCostPerPerson(places);
  const reasons = buildReasons(mealPlan, state);

  return CourseRecommendationItemSchema.parse({
    id: `${COURSE_ID_PREFIX}-${route.map((routeState) => getPlace(input, routeState.last).id).join("-")}`,
    title: buildCourseTitle(places, state),
    places,
    llmSelectionReason: reasons,
    estimatedCostPerPerson,
    estimatedTotalMinutes: state.endMinute - toMinute(input.startTime24h),
    estimatedTravelMinutes: state.totalTravelMinutes,
    timeline,
    startTime24h: toTime24h(route[0]?.startMinute ?? toMinute(input.startTime24h)),
    endTime24h: toTime24h(state.endMinute),
    totalStayMinutes: state.totalStayMinutes,
    totalTravelMinutes: state.totalTravelMinutes,
    mealPlan,
    score: Math.round(total),
    scoreBreakdown: {
      placeScore: round(placeScore),
      mealFit: round(mealFit),
      travelEfficiency: round(travelEfficiency),
      flow: round(state.flowBonus),
      total: round(total),
    },
    reasons,
  });
};

const getPlace = (input: CourseInput, index: number): PlaceRecommendationItem => {
  const place = input.places[index];
  if (!place) throw new Error(`Missing course place at index ${index}`);
  return place;
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

const buildMealPlan = (
  state: CourseState,
  input: CourseInput,
): CourseRecommendationItem["mealPlan"] => {
  const courseStart = toMinute(input.startTime24h);
  const courseEnd = courseStart + input.totalDurationMinutes;
  const requiredWindow = [LUNCH_WINDOW, DINNER_WINDOW].find((window) =>
    rangesOverlap(courseStart, courseEnd, window.start, window.end),
  );

  if (!requiredWindow) {
    return { status: "NOT_REQUIRED", reason: "식사 시간대와 겹치지 않는 코스입니다." };
  }

  const hasFeasibleMealPlace = input.places.some(
    (place) =>
      isMealPlace(place) &&
      canVisit(place, input.dateISO, requiredWindow.start, requiredWindow.start + getEstimatedStayMinutes(place)),
  );

  if (state.mealStopIndex !== undefined) {
    return { status: "SATISFIED", reason: `${requiredWindow.label} 시간대에 식사 장소를 포함했습니다.` };
  }

  if (!hasFeasibleMealPlace) {
    return {
      status: "MISSING_FEASIBLE_PLACE",
      reason: `입력 후보 중 ${requiredWindow.label} 시간대에 방문 가능한 식사 장소가 부족합니다.`,
    };
  }

  return { status: "NOT_SATISFIED", reason: `${requiredWindow.label} 시간대 식사 장소가 빠졌습니다.` };
};

const getMealFitScore = (
  status: CourseRecommendationItem["mealPlan"]["status"],
  config: CourseEngineConfig,
): number => {
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

const buildReasons = (
  mealPlan: CourseRecommendationItem["mealPlan"],
  state: CourseState,
): string[] => [
  mealPlan.reason,
  `장소 ${countBits(state.mask)}개를 ${state.totalStayMinutes}분 체류로 구성했습니다.`,
  `예상 이동 시간은 ${state.totalTravelMinutes}분입니다.`,
];

const buildCourseTitle = (places: PlaceRecommendationItem[], state: CourseState): string => {
  if (state.totalTravelMinutes <= 15) return "이동 부담을 줄인 가까운 코스";
  const categoryCount = new Set(places.map((place) => place.mainCategory)).size;
  if (categoryCount >= Math.min(3, places.length)) return "장소 구성이 다양한 코스";
  if (places.some(isMealPlace)) return "식사를 챙기는 안정적인 코스";
  return places.map((place) => place.name).join(" → ");
};

const getEstimatedCostPerPerson = (
  places: PlaceRecommendationItem[],
): [number, number] => {
  const [min, max] = places.reduce(
    ([minSum, maxSum], place) => [
      minSum + place.priceRangePerPerson[0],
      maxSum + place.priceRangePerPerson[1],
    ],
    [0, 0],
  );

  return [min, max];
};

const getEstimatedStayMinutes = (place: PlaceRecommendationItem): number => {
  const text = `${place.mainCategory} ${place.subCategory} ${place.tags.join(" ")} ${place.contentSummary}`;

  if (/(전시|미술관|박물관|공연|영화|체험|클래스|팝업)/u.test(text)) return 90;
  if (/(술집|주점|포차|이자카야|바|호프|와인)/u.test(text)) return 120;
  if (/(식당|음식점|한식|중식|일식|양식|분식|고기|파스타|브런치)/u.test(text)) return 70;
  if (/(카페|커피|디저트|베이커리)/u.test(text)) return 60;
  if (/(공원|산책)/u.test(text)) return 45;
  if (/(쇼핑|소품|편집샵)/u.test(text)) return 40;
  return 60;
};

const isMealPlace = (place: PlaceRecommendationItem): boolean => {
  const text = `${place.mainCategory} ${place.subCategory} ${place.tags.join(" ")}`;
  return /(식당|음식점|맛집|한식|중식|일식|양식|분식|고기|파스타|브런치)/u.test(text);
};

const overlapsMealWindow = (startMinute: number, endMinute: number): boolean =>
  rangesOverlap(startMinute, endMinute, LUNCH_WINDOW.start, LUNCH_WINDOW.end) ||
  rangesOverlap(startMinute, endMinute, DINNER_WINDOW.start, DINNER_WINDOW.end);

const getTransitionFlowBonus = (
  previous: PlaceRecommendationItem,
  next: PlaceRecommendationItem,
): number => {
  if (isMealPlace(previous) && /(카페|커피|디저트|베이커리)/u.test(`${next.mainCategory} ${next.subCategory}`)) {
    return 8;
  }
  return 0;
};

const canVisit = (
  place: PlaceRecommendationItem,
  dateISO: string,
  arriveMinute: number,
  leaveMinute: number,
): boolean => {
  const daily = place.operationInfo.schedules[toDayOfWeek(dateISO)];
  if (daily.status === "UNKNOWN") return true;
  if (daily.status === "CLOSED") return false;

  const openMinute = toMinute(daily.open);
  const closeMinute = toMinute(daily.close);
  if (arriveMinute < openMinute || leaveMinute > closeMinute) return false;

  return daily.breakTimes.every(
    (breakTime) => !rangesOverlap(arriveMinute, leaveMinute, toMinute(breakTime.start), toMinute(breakTime.end)),
  );
};

const toDayOfWeek = (dateISO: string): DayOfWeek => {
  const day = new Date(`${dateISO}T00:00:00.000Z`).getUTCDay();
  const days: DayOfWeek[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const value = days[day];
  if (!value) throw new Error(`Invalid dateISO: ${dateISO}`);
  return value;
};

const getTravelMinutes = (
  from: PlaceRecommendationItem,
  to: PlaceRecommendationItem,
  input: CourseInput,
  config: CourseEngineConfig,
): number => {
  const matrixValue = input.travelTimeMatrix?.placeToPlace[from.id]?.[to.id];
  if (matrixValue !== undefined) return matrixValue;

  return Math.max(
    1,
    Math.ceil(toDistanceMeters(from.location, to.location) / config.fallbackAverageTravelMetersPerMinute),
  );
};

const toDistanceMeters = (
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number => {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

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

const toTime24h = (minuteOfDay: number): string => {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

const countBits = (value: number): number => {
  let count = 0;
  let cursor = value;
  while (cursor > 0) {
    count += cursor & 1;
    cursor >>= 1;
  }
  return count;
};

const clampScore = (value: number): number => Math.max(0, Math.min(100, value));

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const toInputError = (error: { issues: { path: PropertyKey[] }[] }) => {
  const isTooManyPlaces = error.issues.some(
    (issue) => issue.path.length === 1 && issue.path[0] === "places",
  );

  if (isTooManyPlaces) {
    return {
      code: "COURSE_INPUT_TOO_MANY_PLACES",
      message: "Course recommendation accepts at most 15 places",
    };
  }

  return {
    code: "COURSE_INVALID_INPUT",
    message: "Course recommendation input is invalid",
  };
};

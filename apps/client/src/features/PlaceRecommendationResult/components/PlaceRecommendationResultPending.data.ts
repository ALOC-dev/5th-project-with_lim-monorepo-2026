import {
  PLACE_RECOMMENDATION_PROGRESS_STEPS,
  type PlaceRecommendationFormLocationSnapshot,
  PlaceRecommendationFormLocationSnapshotSchema,
  type PlaceRecommendationProgressStep,
} from "@monorepo/api-contracts";
import { UserInputSchema } from "@monorepo/recommendation-engine/v1/contracts";

import type { PlaceRecommendationProgressSseEvent } from "../../../apis/server/placeRecommendation";
import type { RecommendationProgressStepStatus } from "../../../components/RecommendationProgress";

export const PLACE_RECOMMENDATION_STEP_KEYS = PLACE_RECOMMENDATION_PROGRESS_STEPS;

export type PlaceRecommendationProgressTimelineStep = {
  readonly id: PlaceRecommendationProgressStep;
  readonly status: RecommendationProgressStepStatus;
  readonly elapsedSeconds: number | null;
};

export type PlaceRecommendationInputSummaryItem = {
  readonly label: string;
  readonly value: string;
};

const ACTIVITY_LABELS = {
  ACTIVITY: "문화/액티비티",
  CAFE: "카페",
  DRINK: "술자리",
  MEAL: "식사",
} as const;

const PARTY_LABELS = {
  COLLEAGUES: "동료",
  FAMILY: "가족",
  FRIENDS: "친구",
  LOVERS: "연인",
} as const;

const currencyFormatter = new Intl.NumberFormat("ko-KR");

const parseFormLocations = (
  value: unknown,
): readonly PlaceRecommendationFormLocationSnapshot[] | null => {
  const parsed = PlaceRecommendationFormLocationSnapshotSchema.array().safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const getPlaceRecommendationInputSummary = (
  input: unknown,
  formLocations: unknown,
): readonly PlaceRecommendationInputSummaryItem[] => {
  const parsedInput = UserInputSchema.safeParse(input);
  const parsedLocations = parseFormLocations(formLocations);
  if (!parsedInput.success || parsedLocations === null) return [];

  const userInput = parsedInput.data;
  const schedule = [
    userInput.schedule.dateISO,
    userInput.schedule.time24h,
    userInput.schedule.stayDurationMinutes === undefined
      ? null
      : `${userInput.schedule.stayDurationMinutes}분 체류`,
  ]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const conditions = [
    userInput.activityType === undefined ? null : ACTIVITY_LABELS[userInput.activityType],
    userInput.numberOfPeople === undefined ? null : `${userInput.numberOfPeople}명`,
    userInput.partyType === undefined ? null : PARTY_LABELS[userInput.partyType],
    userInput.budgetPerPerson === undefined
      ? null
      : `${currencyFormatter.format(userInput.budgetPerPerson[0])}~${currencyFormatter.format(
          userInput.budgetPerPerson[1],
        )}원/인`,
  ].filter((value): value is string => value !== null);

  return [
    {
      label: "출발지",
      value: parsedLocations
        .map(({ placeName, roadNameAddress }) => placeName?.trim() || roadNameAddress)
        .join(" · "),
    },
    { label: "일정", value: schedule },
    ...(conditions.length > 0 ? [{ label: "조건", value: conditions.join(" · ") }] : []),
    { label: "요청", value: userInput.userNaturalLanguageRequest },
  ];
};

const getStartedAtByStep = (
  events: readonly PlaceRecommendationProgressSseEvent[],
): ReadonlyMap<PlaceRecommendationProgressStep, number> => {
  const startedAtByStep = new Map<PlaceRecommendationProgressStep, number>();

  for (const event of events) {
    // 스트림 재연결 시 서버 버퍼가 다시 전달되므로, 각 단계의 최초 시작 시각만 유지한다.
    if (startedAtByStep.has(event.step)) continue;

    const startedAt = Date.parse(event.startedAt);
    if (!Number.isNaN(startedAt)) startedAtByStep.set(event.step, startedAt);
  }

  return startedAtByStep;
};

const toElapsedSeconds = (start: number, end: number): number =>
  Math.max(0, Math.floor((end - start) / 1_000));

export const getPlaceRecommendationProgressTimeline = (
  events: readonly PlaceRecommendationProgressSseEvent[],
  now: number,
): readonly PlaceRecommendationProgressTimelineStep[] => {
  const startedAtByStep = getStartedAtByStep(events);
  const activeIndex = PLACE_RECOMMENDATION_STEP_KEYS.reduce(
    (latestIndex, step, index) => (startedAtByStep.has(step) ? index : latestIndex),
    -1,
  );

  return PLACE_RECOMMENDATION_STEP_KEYS.map((step, index) => {
    const startedAt = startedAtByStep.get(step);
    if (startedAt === undefined || activeIndex < index) {
      return { id: step, status: "pending", elapsedSeconds: null };
    }
    if (index === activeIndex) {
      return {
        id: step,
        status: "active",
        elapsedSeconds: toElapsedSeconds(startedAt, now),
      };
    }

    const nextStartedAt = PLACE_RECOMMENDATION_STEP_KEYS.slice(index + 1).find((nextStep) =>
      startedAtByStep.has(nextStep),
    );
    const endedAt = nextStartedAt === undefined ? now : startedAtByStep.get(nextStartedAt);

    return {
      id: step,
      status: "done",
      elapsedSeconds: toElapsedSeconds(startedAt, endedAt ?? now),
    };
  });
};

export const formatElapsedSeconds = (elapsedSeconds: number): string => {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return minutes === 0 ? `${seconds}초` : `${minutes}분 ${seconds}초`;
};

export const getPlaceRecommendationDurationLabel = (
  requestedAt: string,
  completedAt: string | null,
): string | null => {
  if (completedAt === null) return null;

  const requestedTime = Date.parse(requestedAt);
  const completedTime = Date.parse(completedAt);
  if (Number.isNaN(requestedTime) || Number.isNaN(completedTime) || completedTime < requestedTime) {
    return null;
  }

  return formatElapsedSeconds(Math.floor((completedTime - requestedTime) / 1_000));
};

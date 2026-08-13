import {
  PLACE_RECOMMENDATION_PROGRESS_STEPS,
  type PlaceRecommendationProgressStep,
} from "@monorepo/api-contracts";

import type { PlaceRecommendationProgressSseEvent } from "../../../apis/server/placeRecommendation";
import type { RecommendationProgressStepStatus } from "../../../components/RecommendationProgress";

export const PLACE_RECOMMENDATION_STEP_KEYS = PLACE_RECOMMENDATION_PROGRESS_STEPS;

export type PlaceRecommendationProgressTimelineStep = {
  readonly id: PlaceRecommendationProgressStep;
  readonly status: RecommendationProgressStepStatus;
  readonly elapsedSeconds: number | null;
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

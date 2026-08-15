import { useEffect, useState } from "react";

import {
  getPlaceRecommendationStreamUrl,
  type PlaceRecommendationProgressSseEvent,
  PlaceRecommendationProgressSseEventSchema,
} from "../../../apis/server/placeRecommendation";
import { RecommendationProgress } from "../../../components/RecommendationProgress";
import { useAppNavigate } from "../../../routes/useAppNavigate";
import {
  formatElapsedSeconds,
  getPlaceRecommendationInputSummary,
  getPlaceRecommendationProgressTimeline,
  type PLACE_RECOMMENDATION_STEP_KEYS,
} from "./PlaceRecommendationResultPending.data";

type PlaceRecommendationResultPendingProps = {
  readonly formLocations: unknown;
  readonly input: unknown;
  readonly jobId: string;
  readonly onTerminal: () => void;
};

const STEP_LABELS = {
  discovering: "장소 후보 탐색 중",
  enriching: "장소 정보 수집 중",
  evaluating: "장소 후보 평가 중",
  input_validated: "입력 검증 완료",
  scoring: "AI 점수 계산 중",
} satisfies Record<(typeof PLACE_RECOMMENDATION_STEP_KEYS)[number], string>;

const parseSseMessageData = (data: unknown): unknown => {
  if (typeof data !== "string") throw new Error("추천 진행 상태 형식이 올바르지 않습니다.");
  return JSON.parse(data);
};

const PlaceRecommendationResultPending = ({
  formLocations,
  input,
  jobId,
  onTerminal,
}: PlaceRecommendationResultPendingProps) => {
  const navigate = useAppNavigate();
  const [progressEvents, setProgressEvents] = useState<
    readonly PlaceRecommendationProgressSseEvent[]
  >([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const source = new EventSource(getPlaceRecommendationStreamUrl(jobId), {
      withCredentials: true,
    });
    const complete = () => {
      source.close();
      onTerminal();
    };
    const completeFromTerminalEvent = (event: Event) => {
      if (event instanceof MessageEvent) complete();
    };
    const updateProgress = (event: MessageEvent<string>) => {
      try {
        const parsed = PlaceRecommendationProgressSseEventSchema.safeParse(
          parseSseMessageData(event.data),
        );
        if (!parsed.success) return;
        setProgressEvents((current) =>
          current.some((progress) => progress.step === parsed.data.step)
            ? current
            : [...current, parsed.data],
        );
        setNow(Date.now());
      } catch {
        // Polling remains the recovery path when an individual SSE payload is malformed.
      }
    };

    source.addEventListener("progress", updateProgress as EventListener);
    source.addEventListener("result", complete as EventListener);
    source.addEventListener("error", completeFromTerminalEvent);

    return () => {
      source.close();
    };
  }, [jobId, onTerminal]);

  const steps = getPlaceRecommendationProgressTimeline(progressEvents, now);
  const inputSummary = getPlaceRecommendationInputSummary(input, formLocations);
  const activeStepId = steps.find((step) => step.status === "active")?.id;

  useEffect(() => {
    if (activeStepId === undefined) return;

    const timerId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timerId);
  }, [activeStepId]);

  return (
    <RecommendationProgress
      description={
        activeStepId ? (
          `${STEP_LABELS[activeStepId]}\n잠시만 기다려 주세요.`
        ) : (
          <>장소 후보를 수집하고 점수를 계산하는 중입니다.{"\n"}잠시만 기다려 주세요.</>
        )
      }
      details={inputSummary}
      headerTitle="장소 추천 중"
      onBack={() => void navigate("/place/recommendation/form")}
      steps={steps.map((step) => ({
        id: step.id,
        label: STEP_LABELS[step.id],
        meta: step.elapsedSeconds === null ? undefined : formatElapsedSeconds(step.elapsedSeconds),
        status: step.status,
      }))}
      title="추천 결과를 만들고 있어요"
    />
  );
};

export default PlaceRecommendationResultPending;

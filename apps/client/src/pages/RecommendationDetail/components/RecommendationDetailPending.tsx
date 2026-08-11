import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getRecommendationStreamUrl,
  RecommendationProgressSseEventSchema,
} from "../../../apis/server/recommendation";
import {
  RecommendationProgress,
  type RecommendationProgressStepStatus,
} from "../../../components/RecommendationProgress";

type RecommendationDetailPendingProps = {
  readonly jobId: string;
  readonly onTerminal: () => void;
};

type StepStatus = RecommendationProgressStepStatus;

const STEP_KEYS = ["input_validated", "discovering", "evaluating", "enriching", "scoring"] as const;

const INITIAL_STEPS = {
  discovering: "pending",
  enriching: "pending",
  evaluating: "pending",
  input_validated: "pending",
  scoring: "pending",
} satisfies Record<(typeof STEP_KEYS)[number], StepStatus>;

const STEP_LABELS = {
  discovering: "장소 후보 탐색 중",
  enriching: "장소 정보 수집 중",
  evaluating: "장소 후보 평가 중",
  input_validated: "입력 검증 완료",
  scoring: "AI 점수 계산 중",
} satisfies Record<(typeof STEP_KEYS)[number], string>;

const parseSseMessageData = (data: unknown): unknown => {
  if (typeof data !== "string") throw new Error("추천 진행 상태 형식이 올바르지 않습니다.");
  return JSON.parse(data);
};

const RecommendationDetailPending = ({ jobId, onTerminal }: RecommendationDetailPendingProps) => {
  const navigate = useNavigate();
  const [steps, setSteps] = useState<Record<(typeof STEP_KEYS)[number], StepStatus>>(INITIAL_STEPS);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const source = new EventSource(getRecommendationStreamUrl(jobId), { withCredentials: true });
    const queue: (typeof STEP_KEYS)[number][] = [];
    let processing = false;
    let stepStartTime = Date.now();
    let elapsedTimer: ReturnType<typeof setInterval> | null = null;

    const startElapsedTimer = () => {
      stepStartTime = Date.now();
      setElapsed(0);
      if (elapsedTimer) clearInterval(elapsedTimer);
      elapsedTimer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - stepStartTime) / 1000));
      }, 1000);
    };
    const stopElapsedTimer = () => {
      if (elapsedTimer !== null) clearInterval(elapsedTimer);
    };
    const processQueue = () => {
      if (processing || queue.length === 0) return;
      processing = true;
      const step = queue.shift();
      if (step === undefined) {
        processing = false;
        return;
      }
      const stepIndex = STEP_KEYS.indexOf(step);
      setSteps((current) => {
        const next = { ...current };
        STEP_KEYS.forEach((key, index) => {
          if (index < stepIndex) next[key] = "done";
        });
        next[step] = "active";
        return next;
      });
      startElapsedTimer();
      window.setTimeout(() => {
        processing = false;
        processQueue();
      }, 600);
    };
    const complete = () => {
      stopElapsedTimer();
      source.close();
      onTerminal();
    };
    const completeFromTerminalEvent = (event: Event) => {
      if (event instanceof MessageEvent) complete();
    };
    const updateProgress = (event: MessageEvent<string>) => {
      try {
        const parsed = RecommendationProgressSseEventSchema.safeParse(
          parseSseMessageData(event.data),
        );
        if (!parsed.success) return;
        queue.push(parsed.data.step);
        processQueue();
      } catch {
        // Polling remains the recovery path when an individual SSE payload is malformed.
      }
    };

    source.addEventListener("progress", updateProgress as EventListener);
    source.addEventListener("result", complete as EventListener);
    source.addEventListener("error", completeFromTerminalEvent);

    return () => {
      stopElapsedTimer();
      source.close();
    };
  }, [jobId, onTerminal]);

  const activeStep = STEP_KEYS.find((step) => steps[step] === "active");

  return (
    <RecommendationProgress
      description={
        activeStep ? (
          `${STEP_LABELS[activeStep]}\n잠시만 기다려 주세요.`
        ) : (
          <>장소 후보를 수집하고 점수를 계산하는 중입니다.{"\n"}잠시만 기다려 주세요.</>
        )
      }
      headerTitle="장소 추천 중"
      onBack={() => void navigate("/place/recommendation/form")}
      steps={STEP_KEYS.map((key) => ({
        id: key,
        label: STEP_LABELS[key],
        meta: steps[key] === "active" && elapsed > 0 ? `${elapsed}초` : undefined,
        status: steps[key],
      }))}
      title="추천 결과를 만들고 있어요"
    />
  );
};

export default RecommendationDetailPending;

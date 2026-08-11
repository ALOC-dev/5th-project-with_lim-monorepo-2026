import { EngineOutputSchema, UserInputSchema } from "@monorepo/recommendation-engine/v1/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  getRecommendationStreamUrl,
  RecommendationErrorSseEventSchema,
  RecommendationProgressSseEventSchema,
  type RecommendationProgressStep,
  RecommendationResultSseEventSchema,
} from "../../apis/server/recommendation";
import {
  RecommendationProgress,
  type RecommendationProgressStepStatus,
} from "../../components/RecommendationProgress";
import { getRecommendationResultQueryKey } from "../RecommendationResult/wrappers/RecommendationResult.query-key";

type StepStatus = RecommendationProgressStepStatus;

const STEP_LABELS = {
  discovering: "장소 후보 탐색 중",
  enriching: "장소 정보 수집 중",
  evaluating: "장소 후보 평가 중",
  input_validated: "입력 검증 완료",
  scoring: "AI 점수 계산 중",
} satisfies Record<RecommendationProgressStep, string>;

const STEP_KEYS = [
  "input_validated",
  "discovering",
  "evaluating",
  "enriching",
  "scoring",
] as const satisfies readonly RecommendationProgressStep[];

const INITIAL_STEPS = {
  discovering: "pending",
  enriching: "pending",
  evaluating: "pending",
  input_validated: "pending",
  scoring: "pending",
} satisfies Record<RecommendationProgressStep, StepStatus>;

const getUserInputFromLocationState = (state: unknown) => {
  if (!isRecord(state)) {
    return null;
  }

  const parseResult = UserInputSchema.safeParse(state.userInput);
  return parseResult.success ? parseResult.data : null;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null;
};

const parseSseMessageData = (data: unknown): unknown => {
  if (typeof data !== "string") {
    throw new Error("추천 진행 상태 형식이 올바르지 않습니다.");
  }

  return JSON.parse(data);
};

const RecommendationPendingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("jobId");
  const userInput = useMemo(() => getUserInputFromLocationState(location.state), [location.state]);

  const [steps, setSteps] = useState<Record<RecommendationProgressStep, StepStatus>>(INITIAL_STEPS);
  const [elapsed, setElapsed] = useState(0); // 현재 단계 경과 시간(초)
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const visibleErrorMessage =
    jobId === null || userInput === null ? "추천 요청 정보를 찾을 수 없습니다." : errorMessage;

  useEffect(() => {
    if (jobId === null || userInput === null) {
      return;
    }

    const es = new EventSource(getRecommendationStreamUrl(jobId), { withCredentials: true });

    const queue: RecommendationProgressStep[] = [];
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
      if (elapsedTimer !== null) {
        clearInterval(elapsedTimer);
      }
    };

    const fail = (message: string) => {
      stopElapsedTimer();
      setErrorMessage(message);
      es.close();
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

      setSteps((prev) => {
        const next = { ...prev };
        STEP_KEYS.forEach((key, i) => {
          if (i < stepIndex) next[key] = "done";
        });
        next[step] = "active";
        return next;
      });
      if (stepIndex >= 0) startElapsedTimer();

      setTimeout(() => {
        processing = false;
        processQueue();
      }, 600);
    };

    es.addEventListener("progress", (event: MessageEvent<string>) => {
      try {
        const parseResult = RecommendationProgressSseEventSchema.safeParse(
          parseSseMessageData(event.data),
        );

        if (!parseResult.success) {
          fail("추천 진행 상태를 읽지 못했습니다.");
          return;
        }

        queue.push(parseResult.data.step);
        processQueue();
      } catch (error) {
        if (error instanceof Error) {
          fail(error.message);
          return;
        }

        fail("추천 진행 상태를 읽지 못했습니다.");
      }
    });

    es.addEventListener("heartbeat", () => {
      // 연결 유지 확인용 — 별도 처리 불필요
    });

    es.addEventListener("result", (event: MessageEvent<string>) => {
      try {
        const sseParseResult = RecommendationResultSseEventSchema.safeParse(
          parseSseMessageData(event.data),
        );

        if (!sseParseResult.success) {
          fail("추천 결과 형식이 올바르지 않습니다.");
          return;
        }

        const outputParseResult = EngineOutputSchema.safeParse({
          status: "SUCCESS",
          userInput,
          userOutput: sseParseResult.data.data,
        });

        if (!outputParseResult.success) {
          fail("추천 결과를 화면에 표시할 수 없습니다.");
          return;
        }

        stopElapsedTimer();
        es.close();
        queryClient.setQueryData(getRecommendationResultQueryKey(jobId), outputParseResult.data);
        void navigate(`/place/recommendation/result/${encodeURIComponent(jobId)}`, {
          replace: true,
          state: { result: outputParseResult.data },
        });
      } catch (error) {
        if (error instanceof Error) {
          fail(error.message);
          return;
        }

        fail("추천 결과를 읽지 못했습니다.");
      }
    });

    es.addEventListener("error", (event) => {
      if (event instanceof MessageEvent) {
        try {
          const parseResult = RecommendationErrorSseEventSchema.safeParse(
            parseSseMessageData(event.data),
          );

          if (parseResult.success) {
            fail(parseResult.data.message);
            return;
          }
        } catch (error) {
          if (error instanceof Error) {
            fail(error.message);
            return;
          }

          fail("추천 결과를 만드는 중 문제가 발생했습니다.");
          return;
        }
      }

      fail("추천 결과를 만드는 중 문제가 발생했습니다.");
    });

    return () => {
      stopElapsedTimer();
      es.close();
    };
  }, [jobId, navigate, queryClient, userInput]);

  if (visibleErrorMessage !== null) {
    return (
      <RecommendationProgress
        error={{
          title: "추천 결과를 만들지 못했어요",
          description: visibleErrorMessage,
          action: {
            label: "추천 폼으로",
            onClick: () => void navigate("/place/recommendation/form"),
          },
        }}
        headerTitle="장소 추천 중"
        onBack={() => void navigate("/place/recommendation/form")}
        title="추천 결과를 만들고 있어요"
      />
    );
  }

  return (
    <RecommendationProgress
      description={
        <>장소 후보를 수집하고 점수를 계산하는 중입니다.{"\n"}잠시만 기다려 주세요.</>
      }
      headerTitle="장소 추천 중"
      onBack={() => void navigate("/place/recommendation/form")}
      steps={STEP_KEYS.map((key) => ({
        id: key,
        label: STEP_LABELS[key],
        status: steps[key],
        meta: steps[key] === "active" && elapsed > 0 ? `${elapsed}초` : undefined,
      }))}
      title="추천 결과를 만들고 있어요"
    />
  );
};

export default RecommendationPendingPage;

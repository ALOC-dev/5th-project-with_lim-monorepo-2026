import { useEffect, useState } from "react";

import { getCourseStreamUrl } from "../../apis/server/courses";
import { RecommendationProgress } from "../../components/RecommendationProgress";
import { useAppNavigate } from "../../routes/useAppNavigate";
import {
  advanceCourseProgressStep,
  COURSE_PROGRESS_LABELS,
  type CourseProgressStep,
  isCourseProgressStep,
  toCourseProgressSteps,
} from "../CourseRecommendation/courseRecommendation.constants";

type CourseRecommendationResultPendingProps = {
  readonly courseId: string;
  readonly onCancelled: () => void;
  readonly onTerminal: () => void;
};

export const CourseRecommendationResultPending = ({
  courseId,
  onCancelled,
  onTerminal,
}: CourseRecommendationResultPendingProps) => {
  const navigate = useAppNavigate();
  const [progressStep, setProgressStep] = useState<CourseProgressStep>("resolving_candidates");
  const [isTakingLong, setTakingLong] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setTakingLong(true), 90_000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const source = new EventSource(getCourseStreamUrl(courseId), { withCredentials: true });
    const updateProgress = (event: MessageEvent<string>) => {
      try {
        const data: unknown = JSON.parse(event.data);
        if (typeof data !== "object" || data === null) return;
        const record = data as { type?: string; step?: string };
        if (record.type !== "progress") return;
        const nextStep = record.step;
        if (nextStep && isCourseProgressStep(nextStep)) {
          setProgressStep((current) => advanceCourseProgressStep(current, nextStep));
        }
      } catch {
        // Polling remains the recovery path when a progress payload is malformed.
      }
    };
    const terminal = (event: Event) => {
      if (!(event instanceof MessageEvent)) return;
      source.close();
      try {
        if (typeof event.data !== "string") {
          onTerminal();
          return;
        }
        const data: unknown = JSON.parse(event.data);
        if (typeof data !== "object" || data === null) {
          onTerminal();
          return;
        }
        const record = data as { type?: string };
        if (record.type === "cancelled") {
          onCancelled();
          return;
        }
        onTerminal();
      } catch {
        onTerminal();
      }
    };

    source.addEventListener("result", terminal);
    source.addEventListener("error", terminal);
    source.addEventListener("cancelled", terminal);
    source.addEventListener("progress", updateProgress as EventListener);
    return () => source.close();
  }, [courseId, onCancelled, onTerminal]);

  return (
    <RecommendationProgress
      description={
        isTakingLong
          ? `${COURSE_PROGRESS_LABELS[progressStep]} 화면을 닫아도 작업은 계속되며 추천 기록에서 다시 확인할 수 있어요.`
          : COURSE_PROGRESS_LABELS[progressStep]
      }
      headerTitle="코스 추천 중"
      onBack={() => void navigate("/course/recommendation/history")}
      steps={toCourseProgressSteps(progressStep)}
      title="코스 추천을 만드는 중이에요"
    />
  );
};

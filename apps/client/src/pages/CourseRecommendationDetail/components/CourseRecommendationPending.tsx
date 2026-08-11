import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getCourseStreamUrl } from "../../../apis/server/courses";
import { RecommendationProgress } from "../../../components/RecommendationProgress";
import {
  COURSE_PROGRESS_LABELS,
  type CourseProgressStep,
  toCourseProgressSteps,
} from "../../../features/CourseRecommendation/courseRecommendation.constants";

type CourseRecommendationPendingProps = {
  readonly courseId: string;
  readonly onCancelled: () => void;
  readonly onTerminal: () => void;
};

export const CourseRecommendationPending = ({
  courseId,
  onCancelled,
  onTerminal,
}: CourseRecommendationPendingProps) => {
  const navigate = useNavigate();
  const [progressStep, setProgressStep] = useState<CourseProgressStep>("input_validated");

  useEffect(() => {
    const source = new EventSource(getCourseStreamUrl(courseId), { withCredentials: true });
    const updateProgress = (event: MessageEvent<string>) => {
      try {
        const data: unknown = JSON.parse(event.data);
        if (typeof data !== "object" || data === null) return;
        const record = data as { type?: string; step?: string };
        if (record.type !== "progress") return;
        setProgressStep(
          record.step === "generating_options" || record.step === "persisting_results"
            ? record.step
            : "input_validated",
        );
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
      description={COURSE_PROGRESS_LABELS[progressStep]}
      headerTitle="코스 추천 중"
      onBack={() => void navigate("/course/recommendation/form")}
      steps={toCourseProgressSteps(progressStep)}
      title="코스 추천을 만드는 중이에요"
    />
  );
};

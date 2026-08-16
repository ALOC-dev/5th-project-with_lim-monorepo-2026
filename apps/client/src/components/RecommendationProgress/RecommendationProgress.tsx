import type { ReactNode } from "react";

import { tokens } from "../../design-system/tokens.generated";
import { Button } from "../Button";
import Header from "../Header/Header";
import PageRoot from "../PageRoot/PageRoot";
import { type RecommendationProgressStepStatus, S } from "./RecommendationProgress.styled";

export type RecommendationProgressStep = {
  readonly id: string;
  readonly label: string;
  readonly status: RecommendationProgressStepStatus;
  readonly meta?: ReactNode;
};

export type RecommendationProgressDetail = {
  readonly label: string;
  readonly value: ReactNode;
};

type RecommendationProgressAction = {
  readonly label: string;
  readonly onClick: () => void;
};

type RecommendationProgressError = {
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: RecommendationProgressAction;
};

type RecommendationProgressProps = {
  readonly headerTitle: string;
  readonly onBack?: () => void;
  readonly title: string;
  readonly description?: ReactNode;
  readonly details?: readonly RecommendationProgressDetail[];
  readonly steps?: readonly RecommendationProgressStep[];
  readonly error?: RecommendationProgressError;
};

const stepMark = (status: RecommendationProgressStepStatus) => {
  if (status === "done") return "✓";
  if (status === "active") return "▶";
  return "○";
};

/**
 * Recommendation generation states shared by place and course flows.
 *
 * `steps` is optional so a streaming flow with only a human-readable progress
 * message can use the exact same header, spacing, loading indicator, and
 * error recovery CTA as a multi-step flow.
 */
const RecommendationProgress = ({
  headerTitle,
  onBack,
  title,
  description,
  details,
  steps,
  error,
}: RecommendationProgressProps) => {
  const visibleTitle = error?.title ?? title;
  const visibleDescription = error?.description ?? description;
  const isError = error !== undefined;

  return (
    <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
      <Header onBack={onBack} title={headerTitle} />
      <S.Page
        aria-live={isError ? "assertive" : "polite"}
        aria-busy={!isError}
        role={isError ? "alert" : "status"}
      >
        <S.Body>
          {!isError ? <S.Spinner aria-hidden="true" /> : null}
          <S.Title>{visibleTitle}</S.Title>
          {visibleDescription ? <S.Description>{visibleDescription}</S.Description> : null}
          {!isError && details && details.length > 0 ? (
            <S.DetailList aria-label="입력한 추천 조건">
              {details.map((detail) => (
                <S.DetailRow key={detail.label}>
                  <S.DetailLabel>{detail.label}</S.DetailLabel>
                  <S.DetailValue>{detail.value}</S.DetailValue>
                </S.DetailRow>
              ))}
            </S.DetailList>
          ) : null}
          {!isError && steps && steps.length > 0 ? (
            <S.StepList aria-label="추천 생성 단계">
              {steps.map((step) => (
                <S.StepItem $status={step.status} key={step.id}>
                  <S.StepMark aria-hidden="true">{stepMark(step.status)}</S.StepMark>
                  <span>{step.label}</span>
                  {step.meta ? <S.StepMeta>{step.meta}</S.StepMeta> : null}
                </S.StepItem>
              ))}
            </S.StepList>
          ) : null}
          {error?.action ? (
            <S.Action>
              <Button onClick={error.action.onClick} type="button" width="100%">
                {error.action.label}
              </Button>
            </S.Action>
          ) : null}
        </S.Body>
      </S.Page>
    </PageRoot>
  );
};

export type { RecommendationProgressStepStatus };
export default RecommendationProgress;

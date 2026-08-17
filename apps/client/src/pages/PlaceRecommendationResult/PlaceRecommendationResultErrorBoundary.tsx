import { Component, type ErrorInfo, type ReactNode } from "react";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import Header from "../../components/Header/Header";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import { PlaceRecommendationHistoryParseError } from "../PlaceRecommendationHistory/PlaceRecommendationHistory.data";

type PlaceRecommendationResultErrorBoundaryProps = {
  readonly children: ReactNode;
};

type PlaceRecommendationResultErrorBoundaryState = {
  readonly error: Error | null;
};

const GENERIC_ERROR_DESCRIPTION = "저장된 추천 결과를 화면에 표시할 수 없습니다.";

const getErrorDescription = (error: Error): string => {
  if (!import.meta.env.DEV) return GENERIC_ERROR_DESCRIPTION;

  if (error instanceof PlaceRecommendationHistoryParseError) {
    return `진단: ${error.stage} 검증 실패 · ${error.issue}`;
  }

  return `진단: ${error.message}`;
};

export class PlaceRecommendationResultErrorBoundary extends Component<
  PlaceRecommendationResultErrorBoundaryProps,
  PlaceRecommendationResultErrorBoundaryState
> {
  state: PlaceRecommendationResultErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PlaceRecommendationResultErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[PlaceRecommendationResult] render failed", { error, errorInfo });
  }

  render() {
    if (this.state.error === null) return this.props.children;

    return (
      <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
        <Header onBack={() => window.history.back()} title="장소 결과" />
        <FeedbackState
          description={getErrorDescription(this.state.error)}
          kind="error"
          title="추천 결과를 불러오지 못했어요"
        />
      </PageRoot>
    );
  }
}

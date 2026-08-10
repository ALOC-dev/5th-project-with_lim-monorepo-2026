import { useParams } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import RecommendationResultListView from "./components/RecommendationResultListView";
import RecommendationResultPlaceDetail from "./components/RecommendationResultPlaceDetail";
import type { RecommendationResultSuccess } from "./wrappers/RecommendationResult.data.context";
import { RecommendationResultDataProvider } from "./wrappers/RecommendationResult.data.provider";
import { RecommendationResultQueryBoundary } from "./wrappers/RecommendationResult.query-boundary";
import { RecommendationResultUiProvider } from "./wrappers/RecommendationResult.ui.provider";

const RecommendationResultLoading = () => {
  return <FeedbackState kind="loading" title="추천 결과를 불러오는 중입니다." />;
};

const RecommendationResultError = () => {
  return <FeedbackState kind="error" title="추천 결과를 불러오지 못했습니다." />;
};

const RecommendationResultSuccessView = ({
  result,
}: {
  readonly result: RecommendationResultSuccess;
}) => {
  return (
    <RecommendationResultUiProvider result={result}>
      <RecommendationResultResolvedView />
    </RecommendationResultUiProvider>
  );
};

const RecommendationResultResolvedView = () => {
  const { placeId } = useParams();

  if (placeId !== undefined) {
    return <RecommendationResultPlaceDetail />;
  }

  return <RecommendationResultListView />;
};

const RecommendationResultPage = () => {
  const { placeId } = useParams();

  return (
    <RecommendationResultDataProvider>
      <PageRoot
        backgroundColor={tokens.color.neutral[50]}
        layout={placeId === undefined ? "full" : "contained"}
      >
        <RecommendationResultQueryBoundary
          views={{
            loading: RecommendationResultLoading,
            error: RecommendationResultError,
            success: RecommendationResultSuccessView,
          }}
        />
      </PageRoot>
    </RecommendationResultDataProvider>
  );
};

export default RecommendationResultPage;

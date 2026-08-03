import { useParams } from "react-router-dom";

import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import RecommendationResultListView from "./components/RecommendationResultListView";
import RecommendationResultPlaceDetail from "./components/RecommendationResultPlaceDetail";
import type { RecommendationResultSuccess } from "./wrappers/RecommendationResult.data.context";
import { RecommendationResultDataProvider } from "./wrappers/RecommendationResult.data.provider";
import { RecommendationResultQueryBoundary } from "./wrappers/RecommendationResult.query-boundary";
import { RecommendationResultUiProvider } from "./wrappers/RecommendationResult.ui.provider";

const RecommendationResultLoading = () => {
  return <div>추천 결과를 불러오는 중입니다.</div>;
};

const RecommendationResultError = () => {
  return <div>추천 결과를 불러오지 못했습니다.</div>;
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
  return (
    <RecommendationResultDataProvider>
      <PageRoot backgroundColor={tokens.color.neutral[50]}>
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

import styled from "@emotion/styled";
import { useNavigate, useParams } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import Header from "../../components/Header/Header";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import RecommendationResultListView from "./components/RecommendationResultListView";
import RecommendationResultPlaceDetail from "./components/RecommendationResultPlaceDetail";
import {
  type RecommendationResultSuccess,
  useRecommendationResultDataContext,
} from "./wrappers/RecommendationResult.data.context";
import { RecommendationResultDataProvider } from "./wrappers/RecommendationResult.data.provider";
import { RecommendationResultQueryBoundary } from "./wrappers/RecommendationResult.query-boundary";
import { RecommendationResultUiProvider } from "./wrappers/RecommendationResult.ui.provider";

const RecommendationResultFeedbackShell = ({
  children,
}: {
  readonly children: React.ReactNode;
}) => {
  const navigate = useNavigate();

  return (
    <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
      <Header onBack={() => navigate("/place/recommendation/history")} title="장소 결과" />
      <S.StateBody>{children}</S.StateBody>
    </PageRoot>
  );
};

const RecommendationResultLoading = () => {
  return (
    <RecommendationResultFeedbackShell>
      <FeedbackState kind="loading" title="추천 결과를 불러오는 중이에요" />
    </RecommendationResultFeedbackShell>
  );
};

const RecommendationResultEmpty = () => {
  const navigate = useNavigate();

  return (
    <RecommendationResultFeedbackShell>
      <FeedbackState
        action={{
          label: "다시 추천받기",
          onClick: () => navigate("/place/recommendation/form"),
        }}
        description="조건을 조정해 다시 추천받아 보세요."
        kind="empty"
        title="조건에 맞는 장소를 찾지 못했어요"
      />
    </RecommendationResultFeedbackShell>
  );
};

const RecommendationResultError = () => {
  const dataContext = useRecommendationResultDataContext();
  const navigate = useNavigate();
  const description =
    dataContext.status === "error"
      ? dataContext.message ?? "추천 기록에서 다시 열거나 새 추천을 요청해 주세요."
      : "추천 기록에서 다시 열거나 새 추천을 요청해 주세요.";

  return (
    <RecommendationResultFeedbackShell>
      <FeedbackState
        action={{
          label: "다시 추천받기",
          onClick: () => navigate("/place/recommendation/form"),
        }}
        description={description}
        kind="error"
        title="추천 결과를 불러오지 못했어요"
      />
    </RecommendationResultFeedbackShell>
  );
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
    return (
      <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
        <RecommendationResultPlaceDetail />
      </PageRoot>
    );
  }

  return (
    <PageRoot backgroundColor={tokens.color.neutral[50]} layout="full">
      <RecommendationResultListView />
    </PageRoot>
  );
};

const RecommendationResultPage = () => {
  const { recommendationId } = useParams();

  return (
    <RecommendationResultDataProvider key={recommendationId ?? "missing"}>
      <RecommendationResultQueryBoundary
        views={{
          loading: RecommendationResultLoading,
          empty: RecommendationResultEmpty,
          error: RecommendationResultError,
          success: RecommendationResultSuccessView,
        }}
      />
    </RecommendationResultDataProvider>
  );
};

export default RecommendationResultPage;

const S = {
  StateBody: styled.div`
    display: flex;
    flex: 1;
  `,
};

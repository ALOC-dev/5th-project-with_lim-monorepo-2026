import styled from "@emotion/styled";
import type { EngineOutput } from "@monorepo/recommendation-engine/v1/contracts";
import { useNavigate, useParams } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import Header from "../../components/Header/Header";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import RecommendationDetailListView from "./components/RecommendationDetailListView";
import RecommendationDetailPlaceDetail from "./components/RecommendationDetailPlaceDetail";
import { RecommendationDetailBoundary } from "./state/RecommendationDetail.boundary";
import {
  type RecommendationDetailSuccess,
  useRecommendationDetailDataContext,
} from "./state/RecommendationDetail.data.context";
import { RecommendationDetailDataProvider } from "./state/RecommendationDetail.data.provider";
import { RecommendationDetailUiProvider } from "./state/RecommendationDetail.ui.provider";

const RecommendationDetailFeedbackShell = ({
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

const RecommendationDetailLoading = () => {
  return (
    <RecommendationDetailFeedbackShell>
      <FeedbackState kind="loading" title="추천 결과를 불러오는 중이에요" />
    </RecommendationDetailFeedbackShell>
  );
};

const RecommendationDetailEmpty = () => {
  const navigate = useNavigate();

  return (
    <RecommendationDetailFeedbackShell>
      <FeedbackState
        action={{
          label: "다시 추천받기",
          onClick: () => void navigate("/place/recommendation/form"),
        }}
        description="조건을 조정해 다시 추천받아 보세요."
        kind="empty"
        title="조건에 맞는 장소를 찾지 못했어요"
      />
    </RecommendationDetailFeedbackShell>
  );
};

const RecommendationDetailError = () => {
  const dataContext = useRecommendationDetailDataContext();
  const navigate = useNavigate();
  const description =
    dataContext.status === "error"
      ? (dataContext.message ?? "추천 기록에서 다시 열거나 새 추천을 요청해 주세요.")
      : "추천 기록에서 다시 열거나 새 추천을 요청해 주세요.";

  return (
    <RecommendationDetailFeedbackShell>
      <FeedbackState
        action={{
          label: "다시 추천받기",
          onClick: () => void navigate("/place/recommendation/form"),
        }}
        description={description}
        kind="error"
        title="추천 결과를 불러오지 못했어요"
      />
    </RecommendationDetailFeedbackShell>
  );
};

const RecommendationDetailSuccessView = ({
  result,
}: {
  readonly result: RecommendationDetailSuccess;
}) => {
  return (
    <RecommendationDetailUiProvider result={result}>
      <RecommendationDetailResolvedView />
    </RecommendationDetailUiProvider>
  );
};

const RecommendationDetailResolvedView = () => {
  const { placeId } = useParams();

  if (placeId !== undefined) {
    return (
      <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
        <RecommendationDetailPlaceDetail />
      </PageRoot>
    );
  }

  return (
    <PageRoot backgroundColor={tokens.color.neutral[50]} layout="full">
      <RecommendationDetailListView />
    </PageRoot>
  );
};

const RecommendationDetailContent = ({ output }: { readonly output: EngineOutput }) => {
  return (
    <RecommendationDetailDataProvider output={output}>
      <RecommendationDetailBoundary
        views={{
          loading: RecommendationDetailLoading,
          empty: RecommendationDetailEmpty,
          error: RecommendationDetailError,
          success: RecommendationDetailSuccessView,
        }}
      />
    </RecommendationDetailDataProvider>
  );
};

export default RecommendationDetailContent;

const S = {
  StateBody: styled.div`
    display: flex;
    flex: 1;
  `,
};

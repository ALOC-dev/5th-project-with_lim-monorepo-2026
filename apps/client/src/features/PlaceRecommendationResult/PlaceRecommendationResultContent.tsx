import styled from "@emotion/styled";
import type { EngineOutput } from "@monorepo/recommendation-engine/v1/contracts";
import { useNavigate, useParams } from "react-router-dom";

import FeedbackState from "../../components/FeedbackState/FeedbackState";
import Header from "../../components/Header/Header";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import PlaceRecommendationResultListView from "./components/PlaceRecommendationResultListView";
import PlaceRecommendationResultItemDetail from "./components/PlaceRecommendationResultItemDetail";
import { PlaceRecommendationResultBoundary } from "./state/PlaceRecommendationResult.boundary";
import {
  type PlaceRecommendationResultSuccess,
  usePlaceRecommendationResultDataContext,
} from "./state/PlaceRecommendationResult.data.context";
import { PlaceRecommendationResultDataProvider } from "./state/PlaceRecommendationResult.data.provider";
import { PlaceRecommendationResultUiProvider } from "./state/PlaceRecommendationResult.ui.provider";

const PlaceRecommendationResultFeedbackShell = ({
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

const PlaceRecommendationResultLoading = () => {
  return (
    <PlaceRecommendationResultFeedbackShell>
      <FeedbackState kind="loading" title="추천 결과를 불러오는 중이에요" />
    </PlaceRecommendationResultFeedbackShell>
  );
};

const PlaceRecommendationResultEmpty = () => {
  const navigate = useNavigate();

  return (
    <PlaceRecommendationResultFeedbackShell>
      <FeedbackState
        action={{
          label: "다시 추천받기",
          onClick: () => void navigate("/place/recommendation/form"),
        }}
        description="조건을 조정해 다시 추천받아 보세요."
        kind="empty"
        title="조건에 맞는 장소를 찾지 못했어요"
      />
    </PlaceRecommendationResultFeedbackShell>
  );
};

const PlaceRecommendationResultError = () => {
  const dataContext = usePlaceRecommendationResultDataContext();
  const navigate = useNavigate();
  const description =
    dataContext.status === "error"
      ? (dataContext.message ?? "추천 기록에서 다시 열거나 새 추천을 요청해 주세요.")
      : "추천 기록에서 다시 열거나 새 추천을 요청해 주세요.";

  return (
    <PlaceRecommendationResultFeedbackShell>
      <FeedbackState
        action={{
          label: "다시 추천받기",
          onClick: () => void navigate("/place/recommendation/form"),
        }}
        description={description}
        kind="error"
        title="추천 결과를 불러오지 못했어요"
      />
    </PlaceRecommendationResultFeedbackShell>
  );
};

const PlaceRecommendationResultSuccessView = ({
  result,
}: {
  readonly result: PlaceRecommendationResultSuccess;
}) => {
  return (
    <PlaceRecommendationResultUiProvider result={result}>
      <PlaceRecommendationResultResolvedView />
    </PlaceRecommendationResultUiProvider>
  );
};

const PlaceRecommendationResultResolvedView = () => {
  const { placeId } = useParams();

  if (placeId !== undefined) {
    return (
      <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
        <PlaceRecommendationResultItemDetail />
      </PageRoot>
    );
  }

  return (
    <PageRoot backgroundColor={tokens.color.neutral[50]} layout="full">
      <PlaceRecommendationResultListView />
    </PageRoot>
  );
};

const PlaceRecommendationResultContent = ({ output }: { readonly output: EngineOutput }) => {
  return (
    <PlaceRecommendationResultDataProvider output={output}>
      <PlaceRecommendationResultBoundary
        views={{
          loading: PlaceRecommendationResultLoading,
          empty: PlaceRecommendationResultEmpty,
          error: PlaceRecommendationResultError,
          success: PlaceRecommendationResultSuccessView,
        }}
      />
    </PlaceRecommendationResultDataProvider>
  );
};

export default PlaceRecommendationResultContent;

const S = {
  StateBody: styled.div`
    display: flex;
    flex: 1;
  `,
};

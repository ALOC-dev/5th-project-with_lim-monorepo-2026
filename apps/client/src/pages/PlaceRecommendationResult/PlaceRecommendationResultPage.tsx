import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useParams } from "react-router-dom";

import { getPlaceRecommendationHistory } from "../../apis/server/placeRecommendationHistories";
import FeedbackState from "../../components/FeedbackState/FeedbackState";
import Header from "../../components/Header/Header";
import PageRoot from "../../components/PageRoot/PageRoot";
import { tokens } from "../../design-system/tokens.generated";
import PlaceRecommendationResultPending from "../../features/PlaceRecommendationResult/components/PlaceRecommendationResultPending";
import PlaceRecommendationResultContent from "../../features/PlaceRecommendationResult/PlaceRecommendationResultContent";
import { useAppNavigate } from "../../routes/useAppNavigate";
import { toCompletedPlaceRecommendationEngineOutput } from "../PlaceRecommendationHistory/PlaceRecommendationHistory.data";

const getPlaceRecommendationResultQueryKey = (recommendationId: string) =>
  ["placeRecommendationHistory", recommendationId] as const;

const PlaceRecommendationResultStatusFeedback = ({
  kind,
  title,
  description,
}: {
  readonly kind: "loading" | "empty" | "error";
  readonly title: string;
  readonly description?: string;
}) => {
  const navigate = useAppNavigate();

  return (
    <PageRoot backgroundColor={tokens.color.neutral[50]} layout="contained">
      <Header onBack={() => navigate("/place/recommendation/history")} title="장소 결과" />
      <FeedbackState
        action={
          kind === "error"
            ? {
                label: "다시 추천받기",
                onClick: () => void navigate("/place/recommendation/form"),
              }
            : undefined
        }
        description={description}
        kind={kind}
        title={title}
      />
    </PageRoot>
  );
};

const PlaceRecommendationResultPage = () => {
  const { recommendationId } = useParams();
  const queryClient = useQueryClient();
  const recommendation = useQuery({
    queryKey: getPlaceRecommendationResultQueryKey(recommendationId ?? "missing"),
    queryFn: async () => {
      if (!recommendationId) throw new Error("추천 기록을 찾을 수 없습니다.");
      const response = await getPlaceRecommendationHistory(recommendationId);
      if (!response.success) throw new Error(response.error);
      return response.data;
    },
    enabled: Boolean(recommendationId),
    refetchInterval: (query) => (query.state.data?.status === "PENDING" ? 5_000 : false),
    retry: false,
  });
  const refreshStatus = useCallback(() => {
    if (!recommendationId) return;
    void queryClient.invalidateQueries({
      queryKey: getPlaceRecommendationResultQueryKey(recommendationId),
    });
  }, [queryClient, recommendationId]);

  if (recommendation.isPending) {
    return (
      <PlaceRecommendationResultStatusFeedback
        kind="loading"
        title="추천 결과를 불러오는 중이에요"
      />
    );
  }
  if (recommendation.isError || !recommendationId || !recommendation.data) {
    return (
      <PlaceRecommendationResultStatusFeedback
        description="추천 기록에서 다시 열거나 새 추천을 요청해 주세요."
        kind="error"
        title="추천 결과를 찾을 수 없어요"
      />
    );
  }

  switch (recommendation.data.status) {
    case "PENDING":
      return (
        <PlaceRecommendationResultPending jobId={recommendationId} onTerminal={refreshStatus} />
      );
    case "FAILED":
      return (
        <PlaceRecommendationResultStatusFeedback
          description={recommendation.data.errorMessage}
          kind="error"
          title="추천 결과를 만들지 못했어요"
        />
      );
    case "COMPLETED": {
      const output = toCompletedPlaceRecommendationEngineOutput(recommendation.data);
      if (output === null) {
        return (
          <PlaceRecommendationResultStatusFeedback
            description="저장된 추천 결과를 화면에 표시할 수 없습니다."
            kind="error"
            title="추천 결과를 불러오지 못했어요"
          />
        );
      }
      return <PlaceRecommendationResultContent output={output} />;
    }
  }
};

export default PlaceRecommendationResultPage;

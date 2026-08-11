import { useNavigate } from "react-router-dom";

import BottomSheet from "../../../components/BottomSheet/BottomSheet";
import Header from "../../../components/Header/Header";
import { useRecommendationDetailUiContext } from "../state/RecommendationDetail.ui.context";
import { S } from "./RecommendationDetailListView.styled";
import RecommendationDetailMap from "./RecommendationDetailMap";
import RecommendationDetailPlaceList from "./RecommendationDetailPlaceList";

const RecommendationDetailListView = () => {
  const { clearSelectedPlace } = useRecommendationDetailUiContext();
  const navigate = useNavigate();

  return (
    <S.Root>
      <S.HeaderLayer>
        <Header onBack={() => navigate("/place/recommendation/history")} title="장소 결과" />
      </S.HeaderLayer>
      <RecommendationDetailMap />
      <BottomSheet
        id="recommendation-result-list-sheet"
        isOpen
        close={clearSelectedPlace}
        backdropTone="none"
        handleType="resizable"
      >
        <RecommendationDetailPlaceList />
      </BottomSheet>
    </S.Root>
  );
};

export default RecommendationDetailListView;

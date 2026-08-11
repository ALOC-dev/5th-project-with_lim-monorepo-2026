import { useNavigate } from "react-router-dom";

import BottomSheet from "../../../components/BottomSheet/BottomSheet";
import Header from "../../../components/Header/Header";
import { useRecommendationResultUiContext } from "../wrappers/RecommendationResult.ui.context";
import { S } from "./RecommendationResultListView.styled";
import RecommendationResultMap from "./RecommendationResultMap";
import RecommendationResultPlaceList from "./RecommendationResultPlaceList";

const RecommendationResultListView = () => {
  const { clearSelectedPlace } = useRecommendationResultUiContext();
  const navigate = useNavigate();

  return (
    <S.Root>
      <S.HeaderLayer>
        <Header
          onBack={() => navigate("/place/recommendation/history")}
          title="장소 결과"
        />
      </S.HeaderLayer>
      <RecommendationResultMap />
      <BottomSheet
        id="recommendation-result-list-sheet"
        isOpen
        close={clearSelectedPlace}
        backdropTone="none"
        handleType="resizable"
      >
        <RecommendationResultPlaceList />
      </BottomSheet>
    </S.Root>
  );
};

export default RecommendationResultListView;

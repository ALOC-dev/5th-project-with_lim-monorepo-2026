import { useNavigate } from "react-router-dom";

import BottomSheet from "../../../components/BottomSheet/BottomSheet";
import Header from "../../../components/Header/Header";
import { usePlaceRecommendationResultUiContext } from "../state/PlaceRecommendationResult.ui.context";
import { S } from "./PlaceRecommendationResultListView.styled";
import PlaceRecommendationResultMap from "./PlaceRecommendationResultMap";
import PlaceRecommendationResultPlaceList from "./PlaceRecommendationResultPlaceList";

const PlaceRecommendationResultListView = () => {
  const { clearSelectedPlace } = usePlaceRecommendationResultUiContext();
  const navigate = useNavigate();

  return (
    <S.Root>
      <S.HeaderLayer>
        <Header onBack={() => navigate("/place/recommendation/history")} title="장소 결과" />
      </S.HeaderLayer>
      <PlaceRecommendationResultMap />
      <BottomSheet
        id="recommendation-result-list-sheet"
        isOpen
        close={clearSelectedPlace}
        backdropTone="none"
        handleType="resizable"
      >
        <PlaceRecommendationResultPlaceList />
      </BottomSheet>
    </S.Root>
  );
};

export default PlaceRecommendationResultListView;

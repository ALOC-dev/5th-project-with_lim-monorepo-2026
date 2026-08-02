import BottomSheet from "../../../components/BottomSheet/BottomSheet";
import { useRecommendationResultUiContext } from "../wrappers/RecommendationResult.ui.context";
import { S } from "./RecommendationResultListView.styled";
import RecommendationResultMap from "./RecommendationResultMap";
import RecommendationResultPlaceList from "./RecommendationResultPlaceList";

const RecommendationResultListView = () => {
  const { clearSelectedPlace } = useRecommendationResultUiContext();

  return (
    <S.Root>
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

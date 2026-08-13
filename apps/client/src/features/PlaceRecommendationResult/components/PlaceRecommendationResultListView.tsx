import { useCallback, useRef, useState } from "react";

import BottomSheet, { type BottomSheetHandle } from "../../../components/BottomSheet/BottomSheet";
import Header from "../../../components/Header/Header";
import { useAppNavigate } from "../../../routes/useAppNavigate";
import { usePlaceRecommendationResultUiContext } from "../state/PlaceRecommendationResult.ui.context";
import { S } from "./PlaceRecommendationResultListView.styled";
import PlaceRecommendationResultMap from "./PlaceRecommendationResultMap";
import { RESULT_LIST_SHEET_INITIAL_HEIGHT } from "./PlaceRecommendationResultMap.data";
import PlaceRecommendationResultPlaceList, {
  type PlaceRecommendationResultPlaceSelectionRequest,
} from "./PlaceRecommendationResultPlaceList";

const PlaceRecommendationResultListView = () => {
  const { clearSelectedPlace, selectPlace } = usePlaceRecommendationResultUiContext();
  const navigate = useAppNavigate();
  const sheetRef = useRef<BottomSheetHandle>(null);
  const [selectionRequest, setSelectionRequest] =
    useState<PlaceRecommendationResultPlaceSelectionRequest | null>(null);

  const handlePlaceSelect = useCallback(
    (placeId: string) => {
      sheetRef.current?.resetToInitialHeight();
      selectPlace(placeId);
      setSelectionRequest((previousRequest) => ({
        placeId,
        sequence: (previousRequest?.sequence ?? 0) + 1,
      }));
    },
    [selectPlace],
  );

  return (
    <S.Root>
      <S.HeaderLayer>
        <Header onBack={() => navigate("/place/recommendation/history")} title="장소 결과" />
      </S.HeaderLayer>
      <PlaceRecommendationResultMap
        focusRequest={selectionRequest}
        onPlaceSelect={handlePlaceSelect}
      />
      <BottomSheet
        ref={sheetRef}
        id="recommendation-result-list-sheet"
        isOpen
        close={clearSelectedPlace}
        backdropTone="none"
        handleType="resizable"
        initialHeight={RESULT_LIST_SHEET_INITIAL_HEIGHT}
        minHeight={RESULT_LIST_SHEET_INITIAL_HEIGHT}
        minimumTop={52}
      >
        <PlaceRecommendationResultPlaceList
          onPlaceSelect={handlePlaceSelect}
          selectionRequest={selectionRequest}
        />
      </BottomSheet>
    </S.Root>
  );
};

export default PlaceRecommendationResultListView;

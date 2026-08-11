import BottomSheet from "../../../../components/BottomSheet/BottomSheet";
import { usePlaceRecommendationFormUi } from "../../PlaceRecommendationForm.context";
import { LocationSelectionProvider, useLocationSelection } from "./LocationSelection.context";
import { S } from "./LocationSelectionBottomSheet.styled";
import MapModeContent from "./map-mode/MapModeContent";
import LocationSelectionSearchInput from "./search-input/LocationSelectionSearchInput";
import SearchModeContent from "./search-mode/SearchModeContent";

const LocationSelectionBottomSheet = () => {
  const { closeSheet, isSheetOpen } = usePlaceRecommendationFormUi();

  return (
    <LocationSelectionProvider>
      <BottomSheet
        id={"location-selector-bottomsheet"}
        isOpen={isSheetOpen("location")}
        close={closeSheet}
        handleType="none"
      >
        <LocationSelectionBottomSheetContent />
      </BottomSheet>
    </LocationSelectionProvider>
  );
};

const LocationSelectionBottomSheetContent = () => {
  const { mode } = useLocationSelection();

  return (
    <S.Wrapper>
      <S.SearchInputSlot>
        <LocationSelectionSearchInput />
      </S.SearchInputSlot>
      {mode === "map" ? <MapModeContent /> : <SearchModeContent />}
    </S.Wrapper>
  );
};

export default LocationSelectionBottomSheet;

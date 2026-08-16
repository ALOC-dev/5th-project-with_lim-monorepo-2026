import BottomSheet from "../../../../components/BottomSheet/BottomSheet";
import { Button } from "../../../../components/Button";
import {
  usePlaceRecommendationFormInput,
  usePlaceRecommendationFormUi,
} from "../../PlaceRecommendationForm.context";
import { LocationSelectionProvider, useLocationSelection } from "./LocationSelection.context";
import { S } from "./LocationSelectionBottomSheet.styled";
import MapModeContent from "./map-mode/MapModeContent";
import LocationSelectionSearchInput from "./search-input/LocationSelectionSearchInput";
import SearchModeContent from "./search-mode/SearchModeContent";

const LocationSelectionBottomSheet = () => {
  const { closeSheet, isSheetOpen } = usePlaceRecommendationFormUi();
  const isLocationSheetOpen = isSheetOpen("location");

  return (
    <LocationSelectionProvider isLocationSheetOpen={isLocationSheetOpen}>
      <BottomSheet
        id={"location-selector-bottomsheet"}
        isOpen={isLocationSheetOpen}
        close={closeSheet}
        handleType="none"
      >
        <LocationSelectionBottomSheetContent />
      </BottomSheet>
    </LocationSelectionProvider>
  );
};

const LocationSelectionBottomSheetContent = () => {
  const { currentLocation, mode, openMapMode, setQuery } = useLocationSelection();
  const { locations } = usePlaceRecommendationFormInput();
  const { closeSheet } = usePlaceRecommendationFormUi();

  const closeSearchMode = () => {
    openMapMode();
    setQuery("");
    closeSheet();
  };

  return (
    <S.Wrapper>
      <S.SelectedLocationStatus aria-live="polite">
        <S.SelectionMark aria-hidden>✓</S.SelectionMark>
        현재 출발지 {locations.length}곳 선택됨
      </S.SelectedLocationStatus>
      <S.SearchInputSlot>
        <LocationSelectionSearchInput />
      </S.SearchInputSlot>
      {mode === "map" ? (
        <MapModeContent
          key={`map:${currentLocation?.lat ?? "fallback"}:${currentLocation?.lng ?? "fallback"}`}
        />
      ) : (
        <SearchModeContent />
      )}
      {mode === "search" ? (
        <S.Footer>
          <Button onClick={closeSearchMode} tone="secondary" type="button" width="100%">
            취소
          </Button>
        </S.Footer>
      ) : null}
    </S.Wrapper>
  );
};

export default LocationSelectionBottomSheet;

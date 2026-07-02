import BottomSheet from "../../../../components/BottomSheet/BottomSheet";
import { SearchInput } from "../../../../components/SearchInput";
import { useRecommendationFormUi } from "../../RecommendationForm.context";
import { LocationSelectionProvider, useLocationSelection } from "./LocationSelection.context";
import { S } from "./LocationSelectionBottomSheet.styled";
import MapModeContent from "./map-mode/MapModeContent";
import SearchModeContent from "./search-mode/SearchModeContent";

const LocationSelectionBottomSheet = () => {
  const { closeSheet, isSheetOpen } = useRecommendationFormUi();

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

const LocationSelectionSearchInput = () => {
  const { mode, openMapMode, openSearchMode, query, setQuery } = useLocationSelection();

  return (
    <SearchInput
      isSearchMode={mode === "search"}
      backHandler={openMapMode}
      onFocus={openSearchMode}
      placeholder="지역, 지하철역, 장소 검색"
      clearHandler={() => setQuery("")}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );
};

export default LocationSelectionBottomSheet;

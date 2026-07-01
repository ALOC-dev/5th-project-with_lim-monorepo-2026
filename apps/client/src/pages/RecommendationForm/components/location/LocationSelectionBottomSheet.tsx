import { useCallback, useMemo, useState } from "react";

import BottomSheet from "../../../../components/BottomSheet/BottomSheet";
import { SearchInput } from "../../../../components/SearchInput";
import { useRecommendationFormUi } from "../../RecommendationForm.context";
import {
  LocationSelectionContext,
  type LocationSelectionMode,
  useLocationSelection,
} from "./LocationSelection.context";
import { S } from "./LocationSelectionBottomSheet.styled";
import MapModeContent from "./map-mode/MapModeContent";
import SearchModeContent from "./search-mode/SearchModeContent";

const LocationSelectionBottomSheet = () => {
  const { closeSheet, isSheetOpen } = useRecommendationFormUi();
  const [mode, setMode] = useState<LocationSelectionMode>("map");
  const [searchQuery, setSearchQuery] = useState("");
  const openMapMode = useCallback(() => {
    setMode("map");
  }, []);
  const openSearchMode = useCallback(() => {
    setMode("search");
  }, []);
  const locationSelectionContextValue = useMemo(
    () => ({
      mode,
      searchQuery,
      openMapMode,
      openSearchMode,
      setSearchQuery,
    }),
    [mode, openMapMode, openSearchMode, searchQuery],
  );

  return (
    <BottomSheet
      id={"location-selector-bottomsheet"}
      isOpen={isSheetOpen("location")}
      close={closeSheet}
    >
      <LocationSelectionContext.Provider value={locationSelectionContextValue}>
        <LocationSelectionBottomSheetContent />
      </LocationSelectionContext.Provider>
    </BottomSheet>
  );
};

const LocationSelectionBottomSheetContent = () => {
  const { mode } = useLocationSelection();

  return (
    <S.Wrapper>
      <LocationSelectionSearchInput />
      {mode === "map" ? <MapModeContent /> : <SearchModeContent />}
    </S.Wrapper>
  );
};

const LocationSelectionSearchInput = () => {
  const { mode, openMapMode, openSearchMode, searchQuery, setSearchQuery } = useLocationSelection();

  return (
    <SearchInput
      isSearchMode={mode === "search"}
      backHandler={openMapMode}
      onFocus={openSearchMode}
      placeholder="지역, 지하철역, 장소 검색"
      clearHandler={() => setSearchQuery("")}
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
    />
  );
};

export default LocationSelectionBottomSheet;

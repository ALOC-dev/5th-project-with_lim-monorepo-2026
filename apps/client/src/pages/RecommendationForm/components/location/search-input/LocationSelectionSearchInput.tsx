import { SearchInput } from "../../../../../components/SearchInput";
import { useLocationSelection } from "../LocationSelection.context";

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

export default LocationSelectionSearchInput;

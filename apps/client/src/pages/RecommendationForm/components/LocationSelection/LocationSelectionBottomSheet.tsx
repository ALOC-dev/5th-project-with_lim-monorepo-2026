import { type ChangeEvent, type Dispatch, type SetStateAction, useState } from "react";

import BottomSheet from "../../../../components/BottomSheet/BottomSheet";
import { SearchInput } from "../../../../components/SearchInput";
import { S } from "./LocationSelectionBottomSheet.styled";
import MapModeContent from "./MapModeContent";
import SearchModeContent from "./SearchModeContent";

export type Location = {
  readonly lat: number;
  readonly lng: number;
  readonly placeName?: string;
  readonly roadNameAddress: string;
};

export type LocationSelectionMode = "map" | "search";

type LocationSelectionBottomSheetProps = {
  readonly id: string;
  readonly isOpen: boolean;
  readonly close: () => void;
  readonly location: Location;
  readonly setLocation: Dispatch<SetStateAction<Location>>;
};

const LocationSelectionBottomSheet = ({
  id,
  isOpen,
  close,
  location,
  setLocation,
}: LocationSelectionBottomSheetProps) => {
  const [mode, setMode] = useState<LocationSelectionMode>("map");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <BottomSheet id={id} isOpen={isOpen} close={close}>
      <S.Wrapper>
        <SearchInput
          isSearchMode={mode === "search"}
          backHandler={() => setMode("map")}
          onFocus={() => setMode("search")}
          placeholder="지역, 지하철역, 장소 검색"
          clearHandler={() => setSearchQuery("")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {mode === "map" ? (
          <MapModeContent location={location} setLocation={setLocation} onComplete={close} />
        ) : (
          <SearchModeContent query={searchQuery} setMode={setMode} />
        )}
      </S.Wrapper>
    </BottomSheet>
  );
};

export default LocationSelectionBottomSheet;

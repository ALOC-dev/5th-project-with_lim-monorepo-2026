import { type ChangeEvent, type Dispatch, type SetStateAction, useState } from "react";

import BottomSheet from "../../../../components/BottomSheet/BottomSheet";
import { Input } from "../../../../components/Input";
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

  const handleSearchQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextSearchQuery = event.target.value;
    setSearchQuery(nextSearchQuery);
    setMode(nextSearchQuery.trim().length > 0 ? "search" : "map");
  };

  return (
    <BottomSheet id={id} isOpen={isOpen} close={close}>
      <S.Wrapper>
        <Input
          onFocus={() => setMode("search")}
          width="100%"
          value={searchQuery}
          onChange={handleSearchQueryChange}
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

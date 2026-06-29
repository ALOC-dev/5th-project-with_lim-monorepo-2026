import type { Dispatch, SetStateAction } from "react";

import type { Location, LocationSelectionMode } from "./LocationSelectionBottomSheet";

type QueryItem = {
  readonly id: string;
  readonly name: string;
  readonly location: Location;
};

type SearchModeContentProps = {
  readonly query: string;
  setMode: Dispatch<SetStateAction<LocationSelectionMode>>;
};

const SearchModeContent = ({ query, setMode }: SearchModeContentProps) => {
  const filled = query.trim().length > 0;

  if (!filled) {
    return <div>히스토리 보이기</div>;
  }

  return <div>검색 결과 영역 보이기</div>;
};

export default SearchModeContent;

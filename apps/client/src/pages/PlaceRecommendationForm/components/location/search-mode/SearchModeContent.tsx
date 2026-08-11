import { useLocationSelection } from "../LocationSelection.context";
import SearchHistory from "./history/SearchHistory";
import SearchQueryResult from "./query-result/SearchQueryResult";

const SearchModeContent = () => {
  const { query } = useLocationSelection();

  const filled = query.trim().length > 0;

  if (!filled) {
    return <SearchHistory />;
  }

  return <SearchQueryResult />;
};

export default SearchModeContent;

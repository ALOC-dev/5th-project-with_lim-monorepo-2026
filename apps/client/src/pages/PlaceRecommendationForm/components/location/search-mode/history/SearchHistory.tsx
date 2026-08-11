import { useLocationSearchHistory } from "../../../../hooks/useLocationSearchHistory";
import { toHistoryItemKey } from "../../../../utils/locationSearchHistory";
import HistoryItem from "./HistoryItem";
import { S } from "./SearchHistory.styled";

const SearchHistory = () => {
  const { items } = useLocationSearchHistory();

  return (
    <S.Wrapper>
      <S.Label>기록</S.Label>
      {items.length > 0 ? (
        <S.List>
          {items.map((item) => (
            <HistoryItem key={toHistoryItemKey(item)} item={item} />
          ))}
        </S.List>
      ) : (
        <S.EmptyText>최근 검색 기록이 없어요</S.EmptyText>
      )}
    </S.Wrapper>
  );
};

export default SearchHistory;

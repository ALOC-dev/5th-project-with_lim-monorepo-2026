import HistoryItem, { type HistoryItemData } from "./HistoryItem";
import { S } from "./SearchHistory.styled";

const mockHistoryItems = [
  {
    type: "query",
    query: "서울역",
  },
  {
    type: "location",
    location: {
      lat: 37.5547,
      lng: 126.9706,
      placeName: "서울역",
      roadNameAddress: "서울 중구 한강대로 405",
    },
  },
  {
    type: "query",
    query: "강남역",
  },
  {
    type: "location",
    location: {
      lat: 37.5539,
      lng: 126.9235,
      roadNameAddress: "서울 마포구 홍익로 6길",
    },
  },
] as const satisfies readonly HistoryItemData[];

const SearchHistory = () => {
  return (
    <S.Wrapper>
      <S.Label>기록</S.Label>
      <S.List>
        {mockHistoryItems.map((item) => (
          <HistoryItem key={item.type === "query" ? item.query : item.location.roadNameAddress} item={item} />
        ))}
      </S.List>
    </S.Wrapper>
  );
};

export default SearchHistory;

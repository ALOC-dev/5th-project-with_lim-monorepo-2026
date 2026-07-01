import type { Location } from "../../LocationSelection.context";
import QueryResultItem from "./QueryResultItem";
import { S } from "./SearchQueryResult.styled";

const mockQueryResultLocations = [
  {
    lat: 37.5547,
    lng: 126.9706,
    placeName: "서울역",
    roadNameAddress: "서울 중구 한강대로 405",
  },
  {
    lat: 37.5541,
    lng: 126.9716,
    placeName: "서울역 KTX",
    roadNameAddress: "서울 용산구 한강대로 378",
  },
  {
    lat: 37.5552,
    lng: 126.973,
    placeName: "서울스퀘어",
    roadNameAddress: "서울 중구 한강대로 416",
  },
  {
    lat: 37.5663,
    lng: 126.9779,
    roadNameAddress: "서울 중구 세종대로 110",
  },
] as const satisfies readonly Location[];

const SearchQueryResult = () => {
  return (
    <S.Wrapper>
      <S.Label>검색 결과</S.Label>
      <S.List>
        {mockQueryResultLocations.map((location) => (
          <QueryResultItem key={location.roadNameAddress} location={location} />
        ))}
      </S.List>
    </S.Wrapper>
  );
};

export default SearchQueryResult;

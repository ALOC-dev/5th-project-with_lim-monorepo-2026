import { useLocationSearchQuery } from "../../../../hooks/useLocationSearchQuery";
import QueryResultItem from "./QueryResultItem";
import { S } from "./SearchQueryResult.styled";

const SearchQueryResult = () => {
  const { locations, status } = useLocationSearchQuery();

  return (
    <S.Wrapper>
      <S.Label>검색 결과</S.Label>
      {status === "loading" ? <S.StatusText>검색 중</S.StatusText> : null}
      {status === "empty" ? <S.StatusText>검색 결과가 없어요</S.StatusText> : null}
      {status === "failed" ? <S.StatusText>장소를 검색할 수 없어요</S.StatusText> : null}
      {status === "success" ? (
        <S.List>
          {locations.map((location) => (
            <QueryResultItem
              key={`${location.lat}:${location.lng}:${location.roadNameAddress}`}
              location={location}
            />
          ))}
        </S.List>
      ) : null}
    </S.Wrapper>
  );
};

export default SearchQueryResult;

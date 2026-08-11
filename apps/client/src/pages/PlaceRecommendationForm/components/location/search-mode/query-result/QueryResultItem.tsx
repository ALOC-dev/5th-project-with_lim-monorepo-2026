import styled from "@emotion/styled";

import { theme } from "../../../../../../design-system/theme.generated";
import { useLocationSearchHistory } from "../../../../hooks/useLocationSearchHistory";
import { usePlaceRecommendationFormInput } from "../../../../PlaceRecommendationForm.context";
import type { Location } from "../../LocationSelection.context";
import { useLocationSelection } from "../../LocationSelection.context";

type QueryResultItemProps = {
  readonly location: Location;
};

const getLocationDisplay = (location: Location) => {
  if (location.placeName) {
    return {
      mainText: location.placeName,
      subText: location.roadNameAddress,
    };
  }

  return {
    mainText: location.roadNameAddress,
    subText: null,
  };
};

const QueryResultItem = ({ location }: QueryResultItemProps) => {
  const { locations } = usePlaceRecommendationFormInput();
  const { setQuery, openMapMode } = useLocationSelection();
  const { insertItem } = useLocationSearchHistory();
  const { mainText, subText } = getLocationDisplay(location);

  const selectLocation = () => {
    if (locations.length >= 8) {
      alert("출발지는 최대 8개까지만 선택할 수 있습니다.");
      return;
    }

    insertItem({
      type: "location",
      location,
    });

    setQuery("");
    openMapMode();
  };

  return (
    <S.Root onClick={selectLocation} type="button">
      <S.TextGroup>
        <S.MainText>{mainText}</S.MainText>
        {subText ? <S.SubText>{subText}</S.SubText> : null}
      </S.TextGroup>
    </S.Root>
  );
};

export default QueryResultItem;

const S = {
  Root: styled.button`
    box-sizing: border-box;
    display: flex;
    align-items: center;
    width: 100%;
    height: 56px;
    padding: 0 14px;

    text-align: left;
    background-color: ${theme.tokens.color.neutral[0]};
    border: 1px solid ${theme.tokens.color.neutral[200]};
    border-radius: 8px;
    cursor: pointer;

    &:active {
      border-color: ${theme.tokens.color.primary[500]};
    }
  `,
  TextGroup: styled.div`
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
  `,
  MainText: styled.span`
    overflow: hidden;

    color: ${theme.tokens.color.neutral[900]};
    white-space: nowrap;
    text-overflow: ellipsis;

    ${theme.tokens.typography.label.sm}
  `,
  SubText: styled.span`
    overflow: hidden;

    color: ${theme.tokens.color.secondary[500]};
    white-space: nowrap;
    text-overflow: ellipsis;

    /* Figma secondary text spec(10px/16px/400) has no matching design-system typography token yet. */
    font-family: "Noto Sans KR", system-ui, sans-serif;
    font-size: 10px;
    font-weight: 400;
    line-height: 16px;
  `,
};

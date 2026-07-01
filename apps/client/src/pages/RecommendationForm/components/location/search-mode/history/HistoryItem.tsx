import styled from "@emotion/styled";

import { Icon } from "../../../../../../components/Icon";
import { theme } from "../../../../../../design-system/theme.generated";
import { useRecommendationFormInput } from "../../../../RecommendationForm.context";
import type { Location } from "../../LocationSelection.context";
import { useLocationSelection } from "../../LocationSelection.context";

export type HistoryItemData =
  | {
      readonly type: "query";
      readonly query: string;
    }
  | {
      readonly type: "location";
      readonly location: Location;
    };

type HistoryItemProps = {
  readonly item: HistoryItemData;
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

const assertNever = (value: never): never => {
  throw new Error(`Unhandled history item: ${JSON.stringify(value)}`);
};

const HistoryItem = ({ item }: HistoryItemProps) => {
  const { setLocation } = useRecommendationFormInput();
  const { openMapMode, setSearchQuery } = useLocationSelection();
  const selectQuery = (query: string) => {
    setSearchQuery(query);
  };
  const selectLocation = (location: Location) => {
    setLocation(location);
    setSearchQuery("");
    openMapMode();
  };

  switch (item.type) {
    case "query": {
      return (
        <S.Root $height={44} onClick={() => selectQuery(item.query)} type="button">
          <S.TextGroup>
            <S.MainText>{item.query}</S.MainText>
          </S.TextGroup>
          <S.IconSlot>
            <Icon name="search" size={20} />
          </S.IconSlot>
        </S.Root>
      );
    }
    case "location": {
      const { mainText, subText } = getLocationDisplay(item.location);

      return (
        <S.Root
          $height={subText ? 56 : 44}
          onClick={() => selectLocation(item.location)}
          type="button"
        >
          <S.TextGroup>
            <S.MainText>{mainText}</S.MainText>
            {subText ? <S.SubText>{subText}</S.SubText> : null}
          </S.TextGroup>
          <S.IconSlot>
            <Icon name="map-pin" size={20} />
          </S.IconSlot>
        </S.Root>
      );
    }
    default:
      return assertNever(item);
  }
};

export default HistoryItem;

const S = {
  Root: styled.button<{ readonly $height: 44 | 56 }>`
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: ${({ $height }) => $height}px;
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
    font-family: "Noto Sans KR", sans-serif;
    font-size: 10px;
    font-weight: 400;
    line-height: 16px;
    white-space: nowrap;
    text-overflow: ellipsis;
  `,
  IconSlot: styled.span`
    display: flex;
    flex: 0 0 20px;
    align-items: center;
    justify-content: center;
    margin-left: 12px;

    color: ${theme.tokens.color.neutral[700]};
  `,
};

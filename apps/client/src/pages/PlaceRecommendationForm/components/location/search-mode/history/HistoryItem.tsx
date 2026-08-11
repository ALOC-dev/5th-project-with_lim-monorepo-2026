import styled from "@emotion/styled";

import { Icon } from "../../../../../../components/Icon";
import { theme } from "../../../../../../design-system/theme.generated";
import { useLocationSearchHistory } from "../../../../hooks/useLocationSearchHistory";
import type { LocationSearchHistoryItem } from "../../../../utils/locationSearchHistory";
import type { Location } from "../../LocationSelection.context";
import { useLocationSelection } from "../../LocationSelection.context";

type HistoryItemProps = {
  readonly item: LocationSearchHistoryItem;
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
  const { openMapMode, setQuery } = useLocationSelection();
  const { deleteItem, promoteItem } = useLocationSearchHistory();

  const selectQuery = (query: string) => {
    promoteItem(item);
    setQuery(query);
  };

  const selectLocation = (location: Location) => {
    promoteItem(item);

    setQuery("");
    openMapMode();
  };

  const deleteHistoryItem = () => {
    deleteItem(item);
  };

  switch (item.type) {
    case "query": {
      return (
        <S.Root $height={44}>
          <S.SelectButton onClick={() => selectQuery(item.query)} type="button">
            <S.TextGroup>
              <S.MainText>{item.query}</S.MainText>
            </S.TextGroup>
            <S.IconSlot aria-hidden>
              <Icon name="search" size={20} />
            </S.IconSlot>
          </S.SelectButton>
          <S.DeleteButton
            aria-label={`${item.query} 기록 삭제`}
            onClick={deleteHistoryItem}
            type="button"
          >
            <Icon name="circle-x" size={18} />
          </S.DeleteButton>
        </S.Root>
      );
    }
    case "location": {
      const { mainText, subText } = getLocationDisplay(item.location);

      return (
        <S.Root $height={subText ? 56 : 44}>
          <S.SelectButton onClick={() => selectLocation(item.location)} type="button">
            <S.TextGroup>
              <S.MainText>{mainText}</S.MainText>
              {subText ? <S.SubText>{subText}</S.SubText> : null}
            </S.TextGroup>
            <S.IconSlot aria-hidden>
              <Icon name="map-pin" size={20} />
            </S.IconSlot>
          </S.SelectButton>
          <S.DeleteButton
            aria-label={`${mainText} 기록 삭제`}
            onClick={deleteHistoryItem}
            type="button"
          >
            <Icon name="circle-x" size={18} />
          </S.DeleteButton>
        </S.Root>
      );
    }
    default:
      return assertNever(item);
  }
};

export default HistoryItem;

const S = {
  Root: styled.div<{ readonly $height: 44 | 56 }>`
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: ${({ $height }) => $height}px;
    overflow: hidden;

    background-color: ${theme.tokens.color.neutral[0]};
    border: 1px solid ${theme.tokens.color.neutral[200]};
    border-radius: 8px;

    &:active {
      border-color: ${theme.tokens.color.primary[500]};
    }
  `,
  SelectButton: styled.button`
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    justify-content: space-between;
    height: 100%;
    padding: 0 14px;

    text-align: left;
    background: transparent;
    border: 0;
    cursor: pointer;
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
  IconSlot: styled.span`
    display: flex;
    flex: 0 0 20px;
    align-items: center;
    justify-content: center;
    margin-left: 12px;

    color: ${theme.tokens.color.neutral[700]};
  `,
  DeleteButton: styled.button`
    display: flex;
    flex: 0 0 42px;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 100%;
    padding: 0;

    color: ${theme.tokens.color.neutral[700]};
    background: transparent;
    border: 0;
    cursor: pointer;
  `,
};

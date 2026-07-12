import styled from "@emotion/styled";

import { theme } from "../../../../design-system/theme.generated";

type DayButtonProps = {
  readonly $isSelected: boolean;
  readonly $isToday: boolean;
};

export const S = {
  Wrapper: styled.div`
    display: flex;
    min-height: 0;
    height: 100%;
    flex-direction: column;
    gap: 28px;
    width: 100%;
  `,
  Title: styled.h2`
    margin: 0;
    color: ${theme.tokens.color.neutral[900]};

    ${theme.tokens.typography.title.xs}
  `,
  MonthSelector: styled.div`
    display: grid;
    grid-template-columns: 48px 1fr 48px;
    align-items: center;
    width: 100%;
  `,
  MonthButton: styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background-color: transparent;
    color: ${theme.tokens.color.secondary[700]};
    cursor: pointer;

    &:active {
      background-color: ${theme.tokens.color.secondary[50]};
    }
  `,
  MonthLabel: styled.h3`
    margin: 0;
    text-align: center;
    color: ${theme.tokens.color.neutral[900]};

    white-space: nowrap;

    ${theme.tokens.typography.title.xs}
  `,
  Calendar: styled.div`
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: 100%;
  `,
  WeekdayRow: styled.div`
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    column-gap: 10px;
    width: 100%;
  `,
  WeekdayCell: styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    color: ${theme.tokens.color.secondary[500]};

    ${theme.tokens.typography.label.lg}
  `,
  DayGrid: styled.div`
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    place-items: center;
    row-gap: 10px;
    column-gap: 10px;
    width: 100%;
  `,
  EmptyDay: styled.div`
    aspect-ratio: 1;
    width: 100%;
    max-width: 48px;
    justify-self: center;
  `,
  DayButton: styled.button<DayButtonProps>`
    display: flex;
    align-items: center;
    justify-content: center;

    aspect-ratio: 1;
    width: 100%;
    max-width: 48px;

    box-sizing: border-box;

    border: ${({ $isSelected }) =>
      $isSelected
        ? `2px solid ${theme.tokens.color.primary[500]}`
        : `1px solid ${theme.tokens.color.neutral[200]}`};
    border-radius: 50%;
    background-color: ${({ $isToday }) => {
      if ($isToday) return theme.tokens.color.neutral[200];
      return theme.tokens.color.neutral[50];
    }};

    color: ${({ $isSelected }) =>
      $isSelected ? theme.tokens.color.primary[500] : theme.tokens.color.neutral[900]};
    cursor: pointer;

    ${theme.tokens.typography.body.lg}

    &:active {
      border-color: ${theme.tokens.color.primary[500]};
      color: ${theme.tokens.color.primary[500]};
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.35;
    }
  `,
  Footer: styled.div`
    flex: 0 0 auto;
    margin-top: auto;
  `,
  ConfirmButton: styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 68px;
    padding: 14px 20px;
    border: none;
    border-radius: 14px;
    background-color: ${theme.tokens.color.primary[500]};
    color: ${theme.tokens.color.neutral[0]};
    cursor: pointer;

    ${theme.tokens.typography.title.sm}

    &:active {
      transform: scale(0.99);
    }
  `,
};

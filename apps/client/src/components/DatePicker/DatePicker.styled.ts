import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

type DayButtonProps = {
  readonly $isSelected: boolean;
  readonly $isToday: boolean;
};

export const S = {
  InputWrapper: styled.div`
    cursor: pointer;

    input {
      cursor: pointer;
    }
  `,
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
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs}
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
    color: ${tokens.color.secondary[700]};
    cursor: pointer;

    &:active {
      background-color: ${tokens.color.secondary[50]};
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.35;
    }
  `,
  MonthLabel: styled.h3`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    text-align: center;
    white-space: nowrap;
    ${tokens.typography.title.xs}
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
    min-width: 0;
    align-items: center;
    justify-content: center;
    color: ${tokens.color.secondary[500]};
    ${tokens.typography.label.lg}
  `,
  DayGrid: styled.div`
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    place-items: center;
    gap: 10px;
    width: 100%;
  `,
  EmptyDay: styled.div`
    aspect-ratio: 1;
    width: 100%;
    max-width: 48px;
    justify-self: center;
  `,
  DayButton: styled.button<DayButtonProps>`
    position: relative;
    display: flex;
    aspect-ratio: 1;
    width: 100%;
    max-width: 48px;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    border: ${({ $isSelected }) =>
      $isSelected
        ? `2px solid ${tokens.color.primary[500]}`
        : `1px solid ${tokens.color.neutral[200]}`};
    border-radius: 50%;
    background-color: ${({ $isToday }) =>
      $isToday ? tokens.color.neutral[200] : tokens.color.neutral[50]};
    color: ${({ $isSelected }) =>
      $isSelected ? tokens.color.primary[500] : tokens.color.neutral[900]};
    cursor: pointer;
    ${tokens.typography.body.lg}

    &:active {
      border-color: ${tokens.color.primary[500]};
      color: ${tokens.color.primary[500]};
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.35;
    }
  `,
  SelectedMark: styled.span`
    position: absolute;
    right: -2px;
    bottom: -2px;
    display: flex;
    width: 16px;
    height: 16px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background-color: ${tokens.color.primary[500]};
    color: ${tokens.color.neutral[0]};
    font-size: 10px;
    font-weight: 700;
  `,
  Footer: styled.div`
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 8px;
    flex: 0 0 auto;
    margin-top: auto;
  `,
  CancelButton: styled.button`
    display: flex;
    min-height: 68px;
    align-items: center;
    justify-content: center;
    padding: 14px 20px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 14px;
    background-color: ${tokens.color.neutral[0]};
    color: ${tokens.color.secondary[700]};
    cursor: pointer;
    ${tokens.typography.title.sm}
  `,
  ConfirmButton: styled.button`
    display: flex;
    width: 100%;
    min-height: 68px;
    align-items: center;
    justify-content: center;
    padding: 14px 20px;
    border: none;
    border-radius: 14px;
    background-color: ${tokens.color.primary[500]};
    color: ${tokens.color.neutral[0]};
    cursor: pointer;
    ${tokens.typography.title.sm}

    &:active {
      transform: scale(0.99);
    }

    &:disabled {
      cursor: not-allowed;
      background-color: ${tokens.color.neutral[200]};
    }
  `,
};

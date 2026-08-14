import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  ResultMap: styled.section`
    position: relative;
    height: 310px;
    flex: none;
  `,
  MapLabel: styled.span`
    position: absolute;
    z-index: 1;
    top: 12px;
    left: 16px;
    padding: 8px 10px;
    border-radius: 16px;
    background: ${tokens.color.neutral[0]};
  `,
  Result: styled.section`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    padding: 20px 24px;
    overflow: auto;
  `,
  ResultHeader: styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `,
  ResultTitle: styled.h2`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};
  `,
  ResultCount: styled.span`
    color: ${tokens.color.primary[700]};
  `,
  SelectionStatus: styled.p`
    margin: 0;
    padding: 5px 10px;
    border-radius: 999px;
    background: ${tokens.color.primary[100]};
    color: ${tokens.color.primary[700]};
    white-space: nowrap;
    ${tokens.typography.label.xs};
  `,
  Option: styled.article<{ $selected: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid
      ${({ $selected }) => ($selected ? tokens.color.primary[500] : tokens.color.neutral[200])};
    border-radius: 12px;
    background: ${({ $selected }) =>
      $selected ? tokens.color.primary[50] : tokens.color.neutral[0]};
  `,
  OptionRow: styled.div`
    display: flex;
    width: 100%;
    align-items: center;
    gap: 8px;
  `,
  OptionSelect: styled.button`
    display: flex;
    min-width: 0;
    flex: 1;
    gap: 10px;
    border: 0;
    background: transparent;
    cursor: pointer;
    text-align: left;

    b {
      display: grid;
      width: 24px;
      height: 24px;
      place-items: center;
      border-radius: 50%;
      background: ${tokens.color.primary[100]};
      color: ${tokens.color.primary[700]};
    }

    span {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 3px;
    }

    small {
      overflow: hidden;
      color: ${tokens.color.neutral[700]};
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
      border-radius: 8px;
    }
  `,
  TextButton: styled.button`
    min-height: 44px;
    flex: none;
    padding: 6px 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 999px;
    background: ${tokens.color.neutral[0]};
    color: ${tokens.color.primary[700]};
    cursor: pointer;
    ${tokens.typography.label.xs};

    &:focus-visible {
      outline: 2px solid ${tokens.color.primary[500]};
      outline-offset: 2px;
    }
  `,
  OptionReason: styled.p`
    width: 100%;
    margin: 0;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
  `,
  Decisions: styled.details`
    width: 100%;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};

    summary {
      min-height: 44px;
      padding: 12px 0;
      color: ${tokens.color.primary[700]};
      cursor: pointer;
    }

    ul {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding-left: 20px;
    }
  `,
  LegacyBadge: styled.span`
    align-self: flex-start;
    padding: 5px 10px;
    border-radius: 999px;
    background: ${tokens.color.neutral[50]};
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.label.xs};
  `,
};

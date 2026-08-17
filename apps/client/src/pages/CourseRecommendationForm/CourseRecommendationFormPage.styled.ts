import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

const pickerResultRowHeight = "74px";

export const S = {
  Scroll: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 13px;
    padding: 24px 28px;
    overflow: auto;
  `,
  RequiredNotice: styled.span`
    margin-bottom: 8px;
    color: ${tokens.color.primary[500]};
    ${tokens.typography.label.xs};
  `,
  Section: styled.section`
    display: flex;
    flex-direction: column;
    gap: 13px;
  `,
  SectionHeader: styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `,
  Heading: styled.h2<{ $required?: boolean }>`
    margin: 0;
    color: ${tokens.color.neutral[900]};
    ${tokens.typography.title.xs};

    &::after {
      display: ${({ $required }) => ($required ? "inline" : "none")};
      color: ${tokens.color.primary[500]};
      content: " *";
    }
  `,
  SectionCount: styled.span`
    color: ${tokens.color.neutral[700]};
    white-space: nowrap;
    ${tokens.typography.body.sm};
  `,
  Helper: styled.p`
    margin: -4px 0 0;
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.xs};
  `,
  PickerOpen: styled.button`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    padding: 16px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 12px;
    background: ${tokens.color.neutral[0]};
    text-align: left;

    strong {
      color: ${tokens.color.neutral[900]};
    }

    span {
      grid-column: 1;
      color: ${tokens.color.neutral[700]};
      ${tokens.typography.body.xs};
    }
  `,
  SelectedPlace: styled.div`
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: ${tokens.color.primary[100]};

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  TimeSelection: styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  `,
  TimeSeparator: styled.span`
    color: ${tokens.color.neutral[700]};
    ${tokens.typography.body.lg}
  `,
  Field: styled.div<{ $required?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 8px;

    label {
      color: ${tokens.color.neutral[900]};
      font-size: 13px;
      font-weight: 500;
      line-height: 18px;

      &::after {
        display: ${({ $required }) => ($required ? "inline" : "none")};
        color: ${tokens.color.primary[500]};
        content: " *";
      }
    }
  `,
  FieldError: styled.p`
    margin: 0;
    color: ${tokens.color.warning[500]};
    ${tokens.typography.body.xs};
  `,
  Checkbox: styled.input`
    width: 20px;
    height: 20px;
    flex: none;
    cursor: pointer;
    accent-color: ${tokens.color.primary[700]};
  `,
  OptionalRow: styled.div`
    display: flex;
    align-items: center;
    gap: 8px;

    & > :last-child {
      flex: 1;
      width: 100%;
    }
  `,
  OptionalLabel: styled.label`
    width: 90px;
    flex: none;
    color: ${tokens.color.neutral[700]};
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
    white-space: nowrap;
  `,
  BudgetWrapper: styled.div<{ $disabled: boolean }>`
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    opacity: ${({ $disabled }) => ($disabled ? 0.4 : 1)};
    pointer-events: ${({ $disabled }) => ($disabled ? "none" : "auto")};
    transition: opacity 0.2s ease;
  `,
  BudgetAmountText: styled.div`
    color: ${tokens.color.neutral[700]};
    text-align: right;
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
  `,
  Bottom: styled.div`
    padding: 16px 28px 24px;
    border-top: 1px solid ${tokens.color.neutral[200]};
  `,
  Sheet: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 14px;
  `,
  PickerResults: styled.div`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    overflow: auto;
  `,
  SheetBottom: styled.div`
    flex: none;
    padding-top: 2px;
  `,
  Tabs: styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid ${tokens.color.neutral[200]};
  `,
  Tab: styled.button<{ $active: boolean }>`
    display: flex;
    min-height: 46px;
    align-items: center;
    justify-content: center;
    padding: 10px;
    border: 0;
    border-bottom: 2px solid
      ${({ $active }) => ($active ? tokens.color.primary[500] : "transparent")};
    background: transparent;
    color: ${({ $active }) => ($active ? tokens.color.primary[700] : tokens.color.neutral[700])};
    text-align: center;
  `,
  Count: styled.p`
    margin: 0;
    color: ${tokens.color.neutral[700]};
  `,
  List: styled.ul`
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  `,
  ListItem: styled.li`
    display: flex;
    min-height: ${pickerResultRowHeight};
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 10px;

    span {
      display: flex;
      min-width: 0;
      flex: 1;
      flex-direction: column;
      gap: 3px;
    }

    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      overflow: hidden;
      color: ${tokens.color.neutral[700]};
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  PlaceOption: styled.div<{ $disabled: boolean }>`
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  `,
  PickerSkeleton: styled.ul`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  PickerSkeletonItem: styled.li`
    display: flex;
    min-height: ${pickerResultRowHeight};
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px;
    border: 1px solid ${tokens.color.neutral[200]};
    border-radius: 10px;
  `,
  PickerSkeletonInfo: styled.div`
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 3px;
  `,
};

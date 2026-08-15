import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  RootContainer: styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
  `,

  ScrollContent: styled.div`
    display: flex;
    flex-direction: column;
    gap: 13px;
    padding: 24px 28px;
    flex: 1;
    overflow-y: auto;
  `,

  RequiredNotice: styled.span`
    font-size: 12px;
    font-weight: 800;
    line-height: 16px;
    color: ${tokens.color.primary["500"]};
    margin-bottom: 8px;
  `,

  FormRow: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,

  FormLabel: styled.label<{ $required?: boolean }>`
    font-size: 13px;
    color: ${tokens.color.neutral["900"]};
    font-weight: 500;
    line-height: 18px;

    &::after {
      content: " *";
      color: ${tokens.color.primary["500"]};
      display: ${({ $required }) => ($required ? "inline" : "none")};
    }
  `,

  FlexRow: styled.div`
    display: flex;
    flex-direction: row;
    gap: 12px;
  `,

  FlexColumn: styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
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

  LocationSection: styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,

  LocationHeader: styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
  `,

  LocationCount: styled.span`
    font-size: 12px;
    color: ${tokens.color.neutral["700"]};
  `,

  LocationList: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,

  LocationItem: styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background-color: ${tokens.color.neutral["0"]};
    border: 1px solid ${tokens.color.neutral["200"]};
    border-radius: 8px;
  `,

  LocationBadge: styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: ${tokens.color.neutral["700"]};
    color: ${tokens.color.neutral["0"]};
    font-size: 12px;
    font-weight: bold;
    line-height: 16px;
  `,

  LocationText: styled.span`
    flex: 1;
    font-size: 14px;
    color: ${tokens.color.neutral["700"]};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `,

  RemoveButton: styled.button`
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: ${tokens.color.neutral["700"]};
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  `,

  AddLocationButton: styled.button`
    width: 100%;
    padding: 14px;
    background-color: ${tokens.color.neutral["50"]};
    border: 1px solid ${tokens.color.neutral["200"]};
    border-radius: 8px;
    color: ${tokens.color.primary["500"]};
    font-size: 12px;
    font-weight: 700;
    line-height: 17px;
    cursor: pointer;
    text-align: center;
  `,

  TextareaContainer: styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 12px;
    border-bottom: 1px solid ${tokens.color.neutral["200"]};
  `,

  StyledTextarea: styled.textarea`
    width: 100%;
    height: 90px;
    padding: 14px;
    background-color: #fff;
    border: 1px solid ${tokens.color.neutral["200"]};
    border-radius: 8px;
    outline: none;
    resize: none;
    ${tokens.typography.body.sm};
    color: ${tokens.color.neutral["900"]};

    &::placeholder {
      font-weight: 4 00;
      color: ${tokens.color.neutral["200"]};
    }
  `,

  OptionalSection: styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 8px;
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

  Checkbox: styled.input`
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: ${tokens.color.primary["700"]};
  `,

  OptionalLabel: styled.span`
    width: 90px;
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
    white-space: nowrap; // 두 줄로 줄바꿈 되지 않음
    flex-shrink: 0;
    color: ${tokens.color.secondary["700"]};
  `,

  BudgetWrapper: styled.div<{ $disabled: boolean }>`
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;

    opacity: ${({ $disabled }) => ($disabled ? 0.4 : 1)};
    pointer-events: ${({ $disabled }) => ($disabled ? "none" : "auto")};
    transition: opacity 0.2s ease;
  `,

  ButtonWrapper: styled.div`
    margin-top: 24px;
  `,

  SubmitErrorMessage: styled.p`
    margin: 0 0 10px;
    color: ${tokens.color.primary["500"]};
    font-size: 13px;
    font-weight: 500;
  `,
  BudgetAmountText: styled.div`
    text-align: right;
    font-size: 13px;
    color: ${tokens.color.neutral["700"]};
    font-weight: 500;
  `,
};

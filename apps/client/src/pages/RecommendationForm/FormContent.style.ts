import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  RootContainer: styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
  `,
  Header: styled.header`
    background-color: ${tokens.color.neutral[50]};
    height: 96px;
  `,
  StatusBarMock: styled.div`
    display: flex;
    justify-content: space-between;
    padding: 14px 20px;
    ${tokens.typography.body.sm}
    font-weight: 600;
  `,
  NavBar: styled.div`
    display: flex;
    align-items: center;
    padding: 12px 20px;
    gap: 12px;
  `,
  BackButton: styled.button`
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 24px;
      height: 24px;
    }
  `,
  HeaderWrapper: styled.div`
    padding: 18px 24px;
  `,

  Title: styled.h2`
    font-size: 16px;
    font-weight: bold;
    margin: 0;
    color: ${tokens.color.neutral["900"]};
  `,

  ScrollContent: styled.div`
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 24px 28px;
    flex: 1;
    overflow-y: auto;
  `,

  FormRow: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,

  FormLabel: styled.label`
    font-size: 13px;
    color: ${tokens.color.neutral["700"]};
    font-weight: 500;

    &[htmlFor="form-date"] {
      font-size: 14px;
    }
  `,

  FlexRow: styled.div<{ $gap: string }>`
    display: flex;
    flex-direction: row;
    gap: ${({ $gap }) => $gap};
  `,

  FlexColumn: styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,

  BudgetContainer: styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,

  BudgetTextWrapper: styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
  `,

  BudgetValue: styled.span`
    font-size: 14px;
    font-weight: bold;
    color: ${tokens.color.neutral["700"]};
  `,

  TextareaContainer: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 32px;
  `,

  StyledTextarea: styled.textarea`
    width: 100%;
    height: 110px;
    padding: 14px;
    background-color: #fff;
    border: 1px solid #e6dfd8;
    border-radius: 8px;
    outline: none;
    resize: none;
    font-size: 14px;
    color: #141413;
  `,

  ButtonWrapper: styled.div`
    margin-top: auto;
    padding-top: 24px;
  `,

  SubmitErrorMessage: styled.p`
    margin: 0 0 10px;
    color: ${tokens.color.primary["700"]};
    font-size: 13px;
    font-weight: 500;
  `,
};

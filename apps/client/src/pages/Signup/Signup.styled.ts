import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  Container: styled.main`
    display: flex;
    width: 100%;
    flex-direction: column;
  `,

  Header: styled.header`
    display: flex;
    width: 100%;
    padding: 18px 24px 6px 24px;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    background: ${tokens.color.neutral["50"]};
  `,

  StatusBarMock: styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    font-size: 13px;
    font-weight: 600;
    color: ${tokens.color.neutral["900"]};
  `,

  NavBar: styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  `,

  BackButton: styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    width: 24px;
    height: 24px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  `,

  Title: styled.h1`
    font-size: 16px;
    font-weight: 600;
    color: ${tokens.color.neutral["900"]};
    line-height: 22px;
    margin: 0;
  `,

  Form: styled.form`
    display: flex;
    width: 100%;
    padding: 24px 36px 432px 36px;
    flex-direction: column;
    align-items: stretch;
    gap: 18px;
    background: ${tokens.color.neutral["50"]};
  `,

  InputGroup: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  `,

  Label: styled.label`
    font-family: "Noto Sans KR";
    font-size: 13px;
    font-weight: 500;
    color: ${tokens.color.neutral["900"]};
    line-height: 18px;
  `,

  InputRow: styled.div`
    display: flex;
    width: 100%;
    height: 56px;
    align-items: flex-start;
    gap: 8px;
    flex-shrink: 0;
  `,

  Input: styled.input`
    display: flex;
    flex: 1;
    height: 56px;
    padding: 17px 16px;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
    border-radius: 10px;
    border: 1px solid ${tokens.color.neutral["200"]};
    background: ${tokens.color.neutral["0"]};
    color: ${tokens.color.neutral["900"]};
    font-size: 14px;
    transition: border-color 0.2s ease;

    &:focus {
      border-color: ${tokens.color.primary["500"]}; // 포커스 효과
    }

    &::placeholder {
      color: #999999;
    }
  `,

  ActionButton: styled.button`
    display: flex;
    height: 56px;
    width: 116px;
    padding: 18px 0px;
    border-radius: 10px;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;
    background-color: ${tokens.color.primary["500"]};
    color: ${tokens.color.neutral["0"]};
    font-size: 14px;
    font-weight: 700;
    line-height: 20px;
    cursor: pointer;
  `,

  HelperText: styled.span`
    width: 100%;
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    color: ${tokens.color.neutral["700"]};
  `,

  SubmitButton: styled.button<{ disabled?: boolean }>`
    display: flex;
    width: 100%;
    height: 56px;
    margin-top: 18px 0;
    justify-content: center;
    align-items: center;
    border-radius: 10px;

    background-color: ${({ disabled }) =>
      disabled ? tokens.color.neutral["200"] : tokens.color.primary["500"]};
    color: ${({ disabled }) =>
      disabled ? tokens.color.neutral["700"] : tokens.color.neutral["0"]};

    font-size: 14px;
    font-weight: 700;
    cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
    border: none;
  `,

  AgreementGroup: styled.div`
    display: flex;
    padding: 1px 2px 1px 0;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  `,

  Checkbox: styled.input`
    width: 16px;
    height: 16px;
    margin: 0;
    border-radius: 50%;
    cursor: pointer;
  `,

  AgreementText: styled.label`
    color: ${tokens.color.neutral["700"]};
    font-family: "Noto Sans KR";
    font-size: 13px;
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  `,
};

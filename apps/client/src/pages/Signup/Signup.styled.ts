import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  Container: styled.main`
    display: flex;
    width: 100%;
    flex-direction: column;
  `,

  Header: styled.header`
    background-color: ${tokens.color.neutral[50]};
    height: 96px;
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

  Title: styled.div`
    ${tokens.typography.utility.screenTitle}
    font-size: 16px;
    font-weight: 600;
    line-height: 22px;
    color: ${tokens.color.neutral["900"]};
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
    ${tokens.typography.label.sm}
    font-size: 13px;
    line-height: 18px;
    font-weight: 700;
    color: ${tokens.color.neutral["900"]};
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
    ${tokens.typography.body.md};
    font-size: 16px;
    font-weight: 400;
    line-height: 22px;
    transition: border-color 0.2s ease;

    outline: none;
    &:focus {
      border-color: ${tokens.color.primary["500"]};
    }

    &::placeholder {
      color: #999999;
    }
  `,

  ActionButton: styled.button<{ $variant?: "primary" | "secondary" | "disabled" }>`
    display: flex;
    height: 56px;
    width: 116px;
    padding: 18px 0px;
    border-radius: 10px;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;

    background-color: ${({ $variant }) => {
      if ($variant === "secondary") return tokens.color.neutral["0"];
      if ($variant === "disabled") return tokens.color.neutral["200"];
      return tokens.color.primary["500"];
    }};

    color: ${({ $variant }) => {
      if ($variant === "secondary") return tokens.color.neutral["900"];
      if ($variant === "disabled") return tokens.color.neutral["700"];
      return tokens.color.neutral["0"];
    }};

    border: ${({ $variant }) =>
      $variant === "secondary" ? `1px solid ${tokens.color.neutral["200"]}` : "none"};

    ${tokens.typography.utility.cta};
    font-size: 14px;
    font-weight: 700;
    line-height: 20px;
    cursor: ${({ $variant }) => ($variant === "disabled" ? "not-allowed" : "pointer")};
  `,

  HelperText: styled.span<{ $state?: "default" | "success" | "error" }>`
    width: 100%;
    flex-shrink: 0;
    ${tokens.typography.body.xs};
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    color: ${({ $state }) => {
      if ($state === "success") return tokens.color.tertiary["500"];
      if ($state === "error") return tokens.color.primary["700"];
      return tokens.color.neutral["700"];
    }};
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

    ${tokens.typography.utility.cta};
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
    ${tokens.typography.body.xs};
    font-size: 13px;
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  `,
};

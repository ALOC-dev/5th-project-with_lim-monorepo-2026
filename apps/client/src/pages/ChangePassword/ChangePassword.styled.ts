import styled from "@emotion/styled";

import { tokens } from "../../design-system/tokens.generated";

export const S = {
  Container: styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    margin: 0 auto;
    min-height: 0;
    background-color: ${tokens.color.neutral["50"]};
    box-sizing: border-box;
  `,

  Form: styled.form`
    display: flex;
    flex-direction: column;
    padding: 24px 28px;
    gap: 16px;
    flex: 1;
    background: ${tokens.color.neutral["50"]};
    box-sizing: border-box;
  `,

  IntroSection: styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  `,

  Heading: styled.label`
    ${tokens.typography.title.lg};
    font-size: 28px;
    font-weight: 700;
    line-height: 36px;
    color: ${tokens.color.neutral["900"]};
    margin: 0;
    word-break: keep-all;
    overflow-wrap: break-word;
  `,

  Description: styled.label`
    ${tokens.typography.body.xs};
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    color: ${tokens.color.neutral["700"]};
    margin: 0;
    word-break: keep-all;
    overflow-wrap: break-word;
  `,

  NoWrap: styled.span`
    white-space: nowrap;
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
    font-weight: 700;
    line-height: 18px;
    color: ${tokens.color.neutral["900"]};
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
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 56px;
    border-radius: 12px;
    border: none;
    background-color: ${({ disabled }) =>
      disabled ? tokens.color.neutral["200"] : tokens.color.primary["500"]};
    color: ${({ disabled }) =>
      disabled ? tokens.color.neutral["700"] : tokens.color.neutral["0"]};
    ${tokens.typography.utility.cta};
    font-size: 14px;
    font-weight: 700;
    line-height: 20px;
    cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
    margin-top: 16px;
  `,
};

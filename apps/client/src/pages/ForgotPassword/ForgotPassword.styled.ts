import styled from "@emotion/styled";
import { Link } from "react-router-dom";

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

  InputRow: styled.div`
    display: flex;
    width: 100%;
    height: 48px;
    align-items: flex-start;
    gap: 8px;
    flex-shrink: 0;

    > input {
      flex: 1;
      min-width: 0;
      width: auto;
    }
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

  HelperTextError: styled.span`
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    color: ${tokens.color.primary["500"]};
  `,

  ActionButton: styled.button<{ $variant?: "primary" | "secondary" | "disabled" }>`
    display: flex;
    height: 48px;
    width: 116px;
    padding: 14px 0px;
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

  Footer: styled.div<{ isBottomFixed?: boolean }>`
    display: flex;
    height: 44px;
    justify-content: center;
    align-items: center;
    gap: 4px;
    padding-bottom: 32px;
    margin-top: ${({ isBottomFixed }) => (isBottomFixed ? "auto" : "0")};
  `,

  LoginLink: styled(Link)`
    ${tokens.typography.utility.cta}
    font-size: 13px;
    font-weight: 700;
    line-height: 20px;
    padding: 0 8px;
    color: ${tokens.color.primary["500"]};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
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

  InfoBox: styled.div`
    display: flex;
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
    padding: 16px 18px;
    border-radius: 12px;
    border: 1px solid ${tokens.color.neutral["200"]};
    background-color: ${tokens.color.neutral["0"]};
  `,

  InfoTitle: styled.strong`
    ${tokens.typography.title.xs}
    font-size: 13px;
    font-weight: 700;
    line-height: 18px;
    color: ${tokens.color.neutral["900"]};
  `,

  InfoText: styled.span`
    ${tokens.typography.body.xs}
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
    color: ${tokens.color.neutral["700"]};
    word-break: keep-all;
    overflow-wrap: break-word;
  `,

  TitleSection: styled.div`
    margin-bottom: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,

  Badge: styled.span`
    ${tokens.typography.utility.cta}
    color: ${tokens.color.primary["500"]};
    font-size: 12px;
    font-weight: 700;
    line-height: 16px;
  `,
};

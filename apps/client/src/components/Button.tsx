import styled from "@emotion/styled";
import { type ButtonHTMLAttributes } from "react";

import { type theme as themeType } from "../design-system/theme.generated";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "primary" | "secondary";
  width?: "fit" | "full";
}

const S = {
  Wrapper: styled.button<ButtonProps>`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 46px;
    padding: 16px 20px;
    border-radius: 14px;
    
    border: none;
    cursor: pointer;
    transition: opacity 0.2s ease-in-out, transform 0.1s ease;

    width: ${({ width }) => (width === "full" ? "100%" : "fit-content")};

    background-color: ${({ theme, tone }) => {
      const t = theme as typeof themeType;
      return tone === "secondary"
        ? t.tokens.color.secondary["500"]
        : t.tokens.color.primary["500"];
    }};

    color: ${({ theme }) => (theme as typeof themeType).tokens.color.neutral["0"]};

    /* 3. Typography 적용 */
    ${({ theme }) => (theme as typeof themeType).tokens.typography.label.md}

    &:hover {
      opacity: 0.9;
    }

    &:active {
      transform: scale(0.98);
    }

    &:disabled {
      background-color: ${({ theme }) => (theme as typeof themeType).tokens.color.secondary["300"]};
      cursor: not-allowed;
      transform: none;
      opacity: 1;
    }
  `,
};

export const Button = ({ 
  children, 
  tone = "primary", 
  width = "fit", 
  ...props 
}: ButtonProps) => {
  return (
    <S.Wrapper tone={tone} width={width} {...props}>
      {children}
    </S.Wrapper>
  );
};
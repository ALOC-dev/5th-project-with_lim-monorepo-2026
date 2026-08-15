import styled from "@emotion/styled";
import { forwardRef, type InputHTMLAttributes } from "react";

import { theme } from "../design-system/theme.generated";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  width?: string | number;
}

const S = {
  StyledInput: styled.input<{ width?: string | number }>`
    width: ${({ width }) => (typeof width === "number" ? `${width}px` : width || "100%")};
    height: 48px;
    padding: 0 14px;

    background-color: ${theme.tokens.color.neutral[0]};
    border: 1px solid #e6dfd8;
    border-radius: 8px;

    color: ${theme.tokens.color.neutral[900]};

    ${theme.tokens.typography.body.sm}

    outline: none;
    transition: all 0.2s ease;

    &::placeholder {
      color: ${theme.tokens.color.neutral[200]};
    }

    &:focus {
      border-color: ${theme.tokens.color.primary[500]};
      box-shadow: 0 0 0 2px ${theme.tokens.color.primary[50]};
    }
  `,
};

export const Input = forwardRef<HTMLInputElement, InputProps>(({ width, ...props }, ref) => {
  return <S.StyledInput ref={ref} width={width} {...props} />;
});

Input.displayName = "Input";

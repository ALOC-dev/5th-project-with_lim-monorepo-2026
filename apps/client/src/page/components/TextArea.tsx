import styled from "@emotion/styled";
import { type TextareaHTMLAttributes } from "react";

import { type theme as themeType } from "../../design-system/theme.generated";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

const S = {
  Wrapper: styled.textarea`
    width: 100%;
    height: 110px; 
    padding: 12px;
    border-radius: 12px;
    box-sizing: border-box; 
    resize: none;
    
    border: 1px solid ${({ theme }) => (theme as typeof themeType).tokens.color.neutral["200"]};
    background-color: ${({ theme }) => (theme as typeof themeType).tokens.color.neutral["50"]};
    
  
    ${({ theme }) => (theme as typeof themeType).tokens.typography.body.md}
    color: ${({ theme }) => (theme as typeof themeType).tokens.color.neutral["900"]};

    &:focus {
      outline: none;
      border: 1px solid ${({ theme }) => (theme as typeof themeType).tokens.color.primary["500"]};
    }

    &::placeholder {
      color: ${({ theme }) => (theme as typeof themeType).tokens.color.neutral["200"]};
    }
  `,
};

export const TextArea = (props: TextAreaProps) => {
  return <S.Wrapper {...props} />;
};
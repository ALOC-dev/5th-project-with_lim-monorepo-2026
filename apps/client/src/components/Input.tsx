import styled from '@emotion/styled';
import { type InputHTMLAttributes } from 'react';

import { theme } from '../design-system/theme.generated';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  width?: string;
}

const S = {
  StyledInput: styled.input<{ width?: string }>`
    width: ${({ width }) => width || '125px'};
    height: 48px;
    padding: 0 14px;
    

    background-color: ${theme.tokens.color.neutral[0]};
    border: 1px solid #E6DFD8; 
    border-radius: 8px;
    
  
    font-size: 14px;
    color: ${theme.tokens.color.neutral[900]};
    
    outline: none;
    transition: all 0.2s ease;

    &::placeholder {
      color: ${theme.tokens.color.neutral[900]};
    }

    &:focus {
      border-color: ${theme.tokens.color.primary[500]};
      box-shadow: 0 0 0 2px ${theme.tokens.color.primary[50]};
    }
  `,
};

export const Input = ({ width, ...props }: InputProps) => {
  return <S.StyledInput width={width} {...props} />;
};
import styled from '@emotion/styled';
import { useEffect, useRef, useState } from 'react';

import { theme } from '../design-system/theme.generated';

export interface DropdownOption {
  label: string;
  value: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: string; 
}

const S = {
  // width props를 받아 동적으로 스타일 적용
  Container: styled.div<{ width?: string }>`
    position: relative;
    width: ${({ width }) => width || '100%'};
  `,
  
  Trigger: styled.button<{ isOpen: boolean }>`
    width: 100%;
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    
    background: ${theme.tokens.color.neutral[0]};
    border: 1px solid ${({ isOpen }) => 
      isOpen ? theme.tokens.color.primary[500] : theme.tokens.color.neutral[200]};
    border-radius: 12px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
    
    &:focus { 
      outline: none; 
      border-color: ${theme.tokens.color.primary[500]}; 
    }
  `,
  
  Menu: styled.ul`
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 100%;
    margin: 0;
    padding: 8px;
    
    background: ${theme.tokens.color.neutral[0]};
    border: 1px solid ${theme.tokens.color.neutral[200]};
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    
    list-style: none;
    z-index: 100;
  `,
  
  Item: styled.li<{ selected: boolean }>`
    padding: 12px;
    border-radius: 8px;
    cursor: pointer;
    
    background: ${({ selected }) => 
      selected ? theme.tokens.color.neutral[50] : 'transparent'};
    color: ${({ selected }) => 
      selected ? theme.tokens.color.primary[700] : theme.tokens.color.neutral[900]};
    
    &:hover { background: ${theme.tokens.color.neutral[50]}; }
  `
};

export const Dropdown = ({ 
  options, 
  value, 
  onChange, 
  placeholder = '선택하세요', 
  width 
}: DropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find(opt => opt.value === value);

  return (
    <S.Container ref={containerRef} width={width}>
      <S.Trigger isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} type="button">
        {selected ? selected.label : placeholder}
        <span>{isOpen ? '▲' : '▼'}</span>
      </S.Trigger>
      
      {isOpen && (
        <S.Menu>
          {options.map((opt) => (
            <S.Item 
              key={opt.value} 
              selected={opt.value === value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
            >
              {opt.label}
            </S.Item>
          ))}
        </S.Menu>
      )}
    </S.Container>
  );
};
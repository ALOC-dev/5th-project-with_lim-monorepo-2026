import styled from "@emotion/styled";

import { theme } from "../design-system/theme.generated";

export interface DropdownOption {
  label: string;
  value: string;
}

interface DropdownProps {
  readonly id?: string;
  readonly options: readonly DropdownOption[];
  readonly value?: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly width?: string;
  readonly disabled?: boolean;
}

const S = {
  Select: styled.select<{ readonly $isPlaceholder: boolean; readonly $width?: string }>`
    width: ${({ $width }) => $width ?? "100%"};
    height: 48px;
    padding: 0 14px;

    color: ${({ $isPlaceholder }) =>
      $isPlaceholder ? theme.tokens.color.neutral[200] : theme.tokens.color.neutral[900]};
    background-color: ${theme.tokens.color.neutral[0]};
    border: 1px solid ${theme.tokens.color.neutral[200]};
    border-radius: 8px;
    cursor: pointer;

    ${theme.tokens.typography.body.sm}

    &:focus {
      outline: none;
      border-color: ${theme.tokens.color.primary[500]};
      box-shadow: 0 0 0 2px ${theme.tokens.color.primary[50]};
    }

    &:disabled {
      cursor: not-allowed;
      background-color: ${theme.tokens.color.neutral[50]};
    }
  `,
};

/** Uses the platform's native select menu for familiar mobile and keyboard interactions. */
export const Dropdown = ({
  id,
  options,
  value,
  onChange,
  placeholder = "선택하세요",
  width,
  disabled = false,
}: DropdownProps) => {
  const selected = options.some((option) => option.value === value);

  return (
    <S.Select
      $isPlaceholder={!selected}
      $width={width}
      disabled={disabled}
      id={id}
      onChange={(event) => onChange(event.target.value)}
      value={selected ? value : ""}
    >
      <option disabled value="">
        {placeholder}
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </S.Select>
  );
};

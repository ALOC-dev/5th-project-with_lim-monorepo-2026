import { type InputHTMLAttributes, useRef } from "react";

import { Icon } from "../Icon";
import { Input } from "../Input";
import { S } from "./SearchInput.styled";

export type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  readonly value: string;
  readonly backHandler: () => void;
  readonly clearHandler: () => void;
  readonly isSearchMode: boolean;
};

export const SearchInput = ({
  value,
  placeholder,
  backHandler,
  clearHandler,
  isSearchMode,
  ...inputProps
}: SearchInputProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasValue = value.length > 0;

  return (
    <S.Wrapper>
      <S.IconButton
        aria-label={isSearchMode ? "검색 모드 닫기" : "검색 시작"}
        onClick={
          isSearchMode
            ? (e) => {
                backHandler();
                e.currentTarget.blur();
              }
            : () => inputRef.current?.focus()
        }
        type="button"
      >
        <Icon name={isSearchMode ? "back-arrow" : "search"} size={24} />
      </S.IconButton>
      <Input ref={inputRef} placeholder={placeholder} value={value} {...inputProps} />
      <S.IconButton
        aria-label="검색어 지우기"
        disabled={!hasValue}
        onClick={() => {
          inputRef.current?.focus();
          clearHandler();
        }}
        type="button"
      >
        <Icon name="circle-x" size={24} />
      </S.IconButton>
    </S.Wrapper>
  );
};

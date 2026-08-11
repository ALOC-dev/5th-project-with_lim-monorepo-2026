import type { ReactNode } from "react";

import { Icon } from "../Icon/Icon";
import { S } from "./Header.styled";

type HeaderProps = {
  readonly title: string;
  readonly onBack?: () => void;
  readonly right?: ReactNode;
};

const Header = ({ title, onBack, right }: HeaderProps) => {
  return (
    <S.Wrapper>
      {onBack ? (
        <S.BackButton aria-label="뒤로 가기" onClick={onBack} type="button">
          <Icon name="back-arrow" />
        </S.BackButton>
      ) : null}
      <S.Title>{title}</S.Title>
      {right ? <S.Right>{right}</S.Right> : null}
    </S.Wrapper>
  );
};

export default Header;

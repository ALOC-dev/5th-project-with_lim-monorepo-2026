import { useLocation, useNavigate } from "react-router-dom";

import { Icon } from "../Icon";
import { S } from "./BottomBar.styled";

const navigationItems = [
  { icon: "home", label: "홈", to: "/" },
  { icon: "person", label: "마이", to: "/activity" },
] as const;

const BottomBar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <S.Navigation aria-label="주요 메뉴">
      {navigationItems.map((item) => {
        const isActive = pathname === item.to;

        return (
          <S.NavigationButton
            $active={isActive}
            aria-current={isActive ? "page" : undefined}
            aria-label={item.label}
            key={item.to}
            onClick={() => void navigate(item.to)}
            type="button"
          >
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </S.NavigationButton>
        );
      })}
    </S.Navigation>
  );
};

export default BottomBar;

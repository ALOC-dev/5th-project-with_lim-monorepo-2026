import { useLocation } from "react-router-dom";

import { useAppNavigate } from "../../routes/useAppNavigate";
import { Icon } from "../Icon";
import { S } from "./BottomBar.styled";

const navigationItems = [
  { icon: "home", label: "홈", to: "/" },
  { icon: "person", label: "마이페이지", to: "/my" },
] as const;

const BottomBar = () => {
  const { pathname } = useLocation();
  const navigate = useAppNavigate();

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
            onClick={() => void navigate(item.to, { replace: true })}
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
